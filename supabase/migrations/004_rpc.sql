-- Lot 0 · 004 — Fonctions transactionnelles appelées par le web (PRD 6.5, section 8 points 1, 2, 4, 5, 9).
-- Toutes en SECURITY DEFINER : elles prennent la boutique de l'appelant (current_shopid()),
-- jamais celle envoyée par le client.

-- Vente complète, idempotente sur p_order.id.
-- p_order : {id, customer, customer_id?, total, discount?, created?}
-- p_items : [{id, pid, qty, price, coast?, name?}]
-- p_dept  : null ou {id, name, phone?, amount}
-- Renvoie {id, fid, duplicate, stock: [{id, qty}]}
create or replace function create_order(p_order jsonb, p_items jsonb, p_dept jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop text := current_shopid();
  v_now bigint := now_ms();
  v_created bigint := coalesce(nullif(p_order ->> 'created', '')::bigint, v_now);
  v_fid int;
  v_item jsonb;
  v_qty numeric;
  v_existing orders%rowtype;
  v_stock jsonb := '[]'::jsonb;
  v_row jsonb;
begin
  if v_shop is null then
    raise exception 'Utilisateur sans boutique.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La vente ne contient aucun article.' using errcode = '22023';
  end if;

  -- Renvoi après coupure : la vente existe déjà, on renvoie son résultat sans rien refaire.
  select * into v_existing from orders where id = p_order ->> 'id';
  if found then
    if v_existing.shopid <> v_shop then
      raise exception 'Facture d''une autre boutique.' using errcode = '42501';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'qty', p.qty)), '[]'::jsonb) into v_stock
      from products p where p.id in (select oi.pid from orderitem oi where oi.oid = v_existing.id);
    return jsonb_build_object('id', v_existing.id, 'fid', v_existing.fid, 'duplicate', true, 'stock', v_stock);
  end if;

  -- N° de facture : séquence par boutique, verrouillée ; tient compte des N° déjà pris par Android.
  insert into shop_counters (shopid, last_fid) values (v_shop, 0) on conflict (shopid) do nothing;
  update shop_counters
     set last_fid = greatest(last_fid, (select coalesce(max(fid), 0) from orders where shopid = v_shop)) + 1
   where shopid = v_shop
  returning last_fid into v_fid;

  insert into orders (id, fid, customer, customer_id, total, discount, status, shopid, sync, created, updated)
  values (p_order ->> 'id', v_fid, coalesce(p_order ->> 'customer', ''), p_order ->> 'customer_id',
          (p_order ->> 'total')::bigint, coalesce((p_order ->> 'discount')::bigint, 0),
          case when p_dept is null then 'PAID' else 'CREDIT' end,
          v_shop, 0, v_created, v_now);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty <= 0 then
      raise exception 'Quantité invalide.' using errcode = '22023';
    end if;
    -- orderitem.qty reste entier tant qu'Android le lit en Long (voir 001_schema.sql).
    if v_qty <> trunc(v_qty) then
      raise exception 'Quantités décimales pas encore acceptées par le serveur.' using errcode = '22023';
    end if;

    insert into orderitem (id, pid, oid, qty, price, coast, name, shopid, sync, created, updated)
    values (v_item ->> 'id', v_item ->> 'pid', p_order ->> 'id', v_qty,
            (v_item ->> 'price')::bigint, nullif(v_item ->> 'coast', '')::bigint,
            coalesce(v_item ->> 'name', ''), v_shop, 0, v_created, v_now);

    -- Décrément atomique : jamais d'écrasement entre deux caisses (section 8, point 4).
    update products set qty = qty - v_qty
     where id = v_item ->> 'pid' and shopid = v_shop
    returning jsonb_build_object('id', id, 'qty', qty) into v_row;
    if v_row is not null then v_stock := v_stock || v_row; end if;
  end loop;

  if p_dept is not null then
    insert into dept (id, fid, name, phone, amount, order_id, shopid, sync, created, updated)
    values (p_dept ->> 'id', v_fid, coalesce(p_dept ->> 'name', ''), coalesce(p_dept ->> 'phone', ''),
            (p_dept ->> 'amount')::bigint, p_order ->> 'id', v_shop, 0, v_created, v_now);
  end if;

  return jsonb_build_object('id', p_order ->> 'id', 'fid', v_fid, 'duplicate', false, 'stock', v_stock);
end $$;

-- Annulation ADMIN, comme OrderRepository.deleteOrder (Android) : stock restauré, dette liée, lignes et
-- facture supprimées, aucune dépense. Android ne lit pas orders.status : une facture gardée en CANCELLED
-- resterait comptée dans ses recettes. Les suppressions partent dans tombstones (002). Idempotente.
create or replace function cancel_order(p_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop text := current_shopid();
  v_order orders%rowtype;
  v_stock jsonb := '[]'::jsonb;
begin
  if not is_admin() then
    raise exception 'Réservé à l''administrateur.' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_id and shopid = v_shop for update;
  if not found then
    -- Déjà annulée (renvoi après coupure) ou facture d'une autre boutique : rien à faire.
    return jsonb_build_object('id', p_id, 'already', true, 'stock', v_stock);
  end if;

  with restored as (
    update products p set qty = p.qty + s.qty
      from (select pid, sum(qty) as qty from orderitem where oid = p_id group by pid) s
     where p.id = s.pid and p.shopid = v_shop
    returning p.id, p.qty
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'qty', qty)), '[]'::jsonb) into v_stock from restored;

  -- Dette liée : order_id (web) ou id « dept_<id commande> » (Android). Jamais par N° de facture :
  -- Android peut produire des N° en double entre appareils.
  delete from dept where shopid = v_shop and (order_id = p_id or id = 'dept_' || p_id);
  delete from orderitem where oid = p_id and shopid = v_shop;
  delete from orders where id = p_id;

  return jsonb_build_object('id', p_id, 'already', false, 'stock', v_stock);
end $$;

-- Remboursement : historique + décrément du restant, sans le dépasser. Idempotent sur p_payment.id.
-- Dette soldée : supprimée comme dans DeptScreen (Android) ; l'historique reste dans dept_payment.
-- p_payment : {id, dept_id, amount, created?}
create or replace function pay_dept(p_payment jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop text := current_shopid();
  v_amount bigint := (p_payment ->> 'amount')::bigint;
  v_dept dept%rowtype;
begin
  if v_shop is null then
    raise exception 'Utilisateur sans boutique.' using errcode = '42501';
  end if;
  if exists (select 1 from dept_payment where id = p_payment ->> 'id') then
    select * into v_dept from dept where id = p_payment ->> 'dept_id';
    return jsonb_build_object('dept_id', p_payment ->> 'dept_id', 'amount', coalesce(v_dept.amount, 0), 'duplicate', true);
  end if;

  select * into v_dept from dept where id = p_payment ->> 'dept_id' and shopid = v_shop for update;
  if not found then
    raise exception 'Dette introuvable.' using errcode = 'P0002';
  end if;
  if v_amount <= 0 or v_amount > v_dept.amount then
    raise exception 'Montant supérieur au restant dû (%).', v_dept.amount using errcode = '22023';
  end if;

  insert into dept_payment (id, dept_id, amount, shopid, sync, created, updated)
  values (p_payment ->> 'id', v_dept.id, v_amount, v_shop, 0,
          coalesce(nullif(p_payment ->> 'created', '')::bigint, now_ms()), now_ms());
  update dept set amount = amount - v_amount where id = v_dept.id returning amount into v_amount;
  if v_amount = 0 then
    delete from dept where id = v_dept.id;
  end if;

  return jsonb_build_object('dept_id', v_dept.id, 'amount', v_amount, 'settled', v_amount = 0, 'duplicate', false);
end $$;

revoke all on function create_order(jsonb, jsonb, jsonb) from public, anon;
revoke all on function cancel_order(text) from public, anon;
revoke all on function pay_dept(jsonb) from public, anon;
grant execute on function create_order(jsonb, jsonb, jsonb) to authenticated;
grant execute on function cancel_order(text) to authenticated;
grant execute on function pay_dept(jsonb) to authenticated;
