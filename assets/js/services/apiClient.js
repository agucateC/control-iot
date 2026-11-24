import { ApiError } from '../utils/errors.js';

/**
 * Cliente HTTP genérico (Fetch + async/await). Soporta GET, POST, PUT y DELETE.
 * Centraliza URL base, headers, timeout (AbortController), parseo JSON y errores.
 * La clave de API llega por `getApiKey()` (viene de CONFIG.API_KEY).
 */
export class ApiClient {
  #baseUrl; #timeoutMs; #getApiKey; #session;

  /** `session` (AuthSession) opcional: con él se envía Authorization: Bearer y se renueva el token ante un 401. */
  constructor({ baseUrl, timeoutMs = 8000, getApiKey = () => '', session = null }) {
    this.#session = session;
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = timeoutMs;
    this.#getApiKey = getApiKey;
  }

  get(path, opts) { return this.request('GET', path, opts); }
  post(path, body, opts) { return this.request('POST', path, { ...opts, body }); }
  put(path, body, opts) { return this.request('PUT', path, { ...opts, body }); }
  delete(path, opts) { return this.request('DELETE', path, opts); }

  /**
   * @param {{body?:object, auth?:boolean, timeoutMs?:number, signal?:AbortSignal}} opts
   * `auth:true` agrega X-API-Key (operaciones protegidas).
   */
  async request(method, path, opts = {}) {
    try {
      return await this.#once(method, path, opts);
    } catch (e) {
      const s = this.#session;
      if (e instanceof ApiError && e.status === 401 && s?.token && !s.isGuest && !path.startsWith('/auth/')) {
        if (await s.refresh()) return this.#once(method, path, opts);   // token vencido: renueva (cookie HttpOnly) y reintenta UNA vez
        s.expire();
      }
      throw e;
    }
  }

  async #once(method, path, { body, auth = false, timeoutMs = this.#timeoutMs, signal } = {}) {
    const headers = { Accept: 'application/json' };
    const bearer = this.#session?.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (path.startsWith('/auth/')) headers['X-Requested-With'] = 'fetch';   // defensa CSRF del refresh/logout
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (auth) {
      const key = this.#getApiKey();
      if (!key) throw new ApiError('http', 'Falta la clave de API', { status: 401 });
      headers['X-API-Key'] = key;
    }

    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    const onExternalAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    let res;
    try {
      res = await fetch(this.#baseUrl + path, {
        method, headers, signal: ctrl.signal, cache: 'no-store', credentials: path.startsWith('/auth/') ? 'include' : 'omit',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (timedOut) throw new ApiError('timeout', 'Tiempo de espera agotado');
      if (e?.name === 'AbortError') throw new ApiError('abort', 'Solicitud cancelada');
      throw new ApiError('network', 'Error de red');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }

    let data = null;
    const text = await res.text().catch(() => '');
    if (text) {
      try { data = JSON.parse(text); } catch {
        if (res.ok) throw new ApiError('parse', 'Respuesta no es JSON', { status: res.status });
      }
    }
    if (!res.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail.slice(0, 200) : '';
      throw new ApiError('http', `HTTP ${res.status}`, { status: res.status, detail, body: data });
    }
    return data;
  }
}
