// Appels fetch() directs aux API Supabase (PostgREST, GoTrue, Storage), sans SDK.

export class ApiError extends Error {
  /** @param {string} message @param {number} status 0 = réseau @param {any} [body] */
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
  get offline() { return this.status === 0; }
}

export const OFFLINE_MESSAGE =
  'Vous êtes hors connexion. Veuillez vérifier votre connexion Internet et réessayer.';

let base = '';
let anonKey = '';
let hooks = { token: () => null, refresh: async () => false };

/**
 * @param {{supabaseUrl: string, supabaseAnonKey: string}} config
 * @param {{token: () => string|null, refresh: () => Promise<boolean>}} authHooks
 */
export function configure(config, authHooks) {
  base = config.supabaseUrl.replace(/\/$/, '');
  anonKey = config.supabaseAnonKey;
  hooks = authHooks;
}

function messageOf(body, status) {
  if (body && typeof body === 'object') {
    return body.error_description || body.msg || body.message || body.error || `Erreur ${status}`;
  }
  return (typeof body === 'string' && body) || `Erreur ${status}`;
}

/**
 * Requête générique. Un 401 déclenche un rafraîchissement du jeton puis un seul nouvel essai.
 * @param {string} path chemin après l'URL du projet (ex. '/rest/v1/products')
 * @param {{method?: string, headers?: Record<string,string>, body?: any, auth?: boolean, timeout?: number, retry?: boolean}} [opts]
 */
export async function request(path, opts = {}) {
  const { method = 'GET', headers = {}, body, auth = true, timeout = 20000, retry = true } = opts;
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError(OFFLINE_MESSAGE, 0);

  const h = { apikey: anonKey, ...headers };
  const token = auth ? hooks.token() : null;
  h.Authorization = `Bearer ${token || anonKey}`;
  let payload = body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(base + path, { method, headers: h, body: payload, signal: ctrl.signal });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && retry && token && (await hooks.refresh())) {
    return request(path, { ...opts, retry: false });
  }

  const type = res.headers.get('content-type') || '';
  const text = await res.text();
  const data = text && type.includes('json') ? JSON.parse(text) : text || null;
  if (!res.ok) throw new ApiError(messageOf(data, res.status), res.status, data);
  return data;
}

/** GET/POST/PATCH/DELETE sur /rest/v1/{table}?{query}. */
export function rest(table, query = '', opts = {}) {
  return request(`/rest/v1/${table}${query ? '?' + query : ''}`, opts);
}

/** Appel d'une fonction Postgres exposée par PostgREST. */
export function rpc(fn, args = {}) {
  return request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
}

/** Appel GoTrue (/auth/v1/…). */
export function authApi(path, body, opts = {}) {
  return request(`/auth/v1/${path}`, { method: 'POST', body, ...opts });
}

/** Envoi d'un fichier dans Storage ; renvoie l'URL publique. */
export async function upload(bucket, name, blob) {
  const path = `${encodeURIComponent(bucket)}/${encodeURIComponent(name)}`;
  await request(`/storage/v1/object/${path}`, {
    method: 'POST', body: blob, headers: { 'x-upsert': 'true', 'Content-Type': blob.type },
  });
  return `${base}/storage/v1/object/public/${path}`;
}
