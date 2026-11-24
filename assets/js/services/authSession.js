import { CONFIG } from '../config.js';
import { Emitter } from '../utils/emitter.js';
import { ApiError } from '../utils/errors.js';

const GUEST_KEY = 'iot.guest';       // solo para retomar la sesión de invitado tras recargar (dura lo que la pestaña)

/**
 * Sesión de la persona usuaria. El access token vive SOLO en memoria (nunca localStorage);
 * el refresh token es una cookie HttpOnly que JavaScript no puede leer.
 * Emite: 'token' (nuevo access token, para re-autenticar el WebSocket) y 'expired'.
 */
export class AuthSession extends Emitter {
  #base = CONFIG.API_BASE_URL; #token = null; #exp = 0; #user = null; #timer = 0; #inflight = null; #guest = null;

  get token() { return this.#token; }
  get user() { return this.#user; }
  get role() { return this.#user?.rol ?? null; }
  get isGuest() { return this.role === 'INVITADO'; }
  get guest() { return this.#guest; }        // { id_sesion, id_unidad, id_vehiculo, expira_en }

  async #call(path, { method = 'POST', body, bearer } = {}) {
    let res;
    try {
      res = await fetch(this.#base + path, {
        method, credentials: 'include', cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new ApiError('network', 'Error de red'); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError('http', `HTTP ${res.status}`, { status: res.status, detail: typeof data?.detail === 'string' ? data.detail.slice(0, 200) : '', body: data });
    return data;
  }

  #apply(s) {
    this.#token = s.access_token; this.#exp = s.exp; this.#user = s.usuario;
    clearTimeout(this.#timer);
    if (s.usuario.rol !== 'INVITADO') {   // renueva 60 s antes de vencer (la sesión de invitado NO se renueva: es temporal)
      const ms = Math.max(5000, s.exp * 1000 - Date.now() - 60000);
      this.#timer = setTimeout(() => this.refresh(), ms);
    }
    this.emit('token', { token: this.#token });
  }

  /** ¿Hay una sesión previa? (cookie de refresh o sesión de invitado guardada). */
  async restore() {
    try {
      const g = JSON.parse(sessionStorage.getItem(GUEST_KEY) || 'null');
      if (g?.token && g.exp * 1000 > Date.now()) {
        await this.#call(CONFIG.ENDPOINTS.me, { method: 'GET', bearer: g.token });
        this.#guest = g.sesion; this.#apply({ access_token: g.token, exp: g.exp, usuario: { id_usuario: 0, email: '', nombre: 'Invitado', rol: 'INVITADO' } });
        return true;
      }
    } catch { try { sessionStorage.removeItem(GUEST_KEY); } catch { /* sin almacenamiento */ } }
    return this.refresh();
  }

  async login(email, password) {
    this.#apply(await this.#call(CONFIG.ENDPOINTS.login, { body: { email, password } }));
    return this.#user;
  }

  /** Renueva con la cookie HttpOnly. Devuelve true/false (nunca lanza). Una sola petición a la vez. */
  refresh() {
    if (this.#inflight) return this.#inflight;
    this.#inflight = (async () => {
      try { this.#apply(await this.#call(CONFIG.ENDPOINTS.refresh)); return true; }
      catch { return false; }
      finally { this.#inflight = null; }
    })();
    return this.#inflight;
  }

  async startGuest(idUnidad) {
    const r = await this.#call(CONFIG.ENDPOINTS.sesionesInvitado, { body: { id_unidad: idUnidad } });
    this.#guest = { id_sesion: r.id_sesion, id_unidad: r.id_unidad, id_vehiculo: r.id_vehiculo, expira_en: r.expira_en };
    try { sessionStorage.setItem(GUEST_KEY, JSON.stringify({ token: r.access_token, exp: r.exp, sesion: this.#guest })); } catch { /* opcional */ }
    this.#apply({ access_token: r.access_token, exp: r.exp, usuario: { id_usuario: 0, email: '', nombre: 'Invitado', rol: 'INVITADO' } });
    return this.#guest;
  }

  async logout() {
    const wasGuest = this.isGuest; const t = this.#token;
    try {
      if (wasGuest) await this.#call(CONFIG.ENDPOINTS.sesionInvitado, { method: 'DELETE', bearer: t });
      else await this.#call(CONFIG.ENDPOINTS.logout);
    } catch { /* se cierra localmente de todos modos */ }
    this.clear();
  }

  clear() {
    clearTimeout(this.#timer); this.#token = null; this.#user = null; this.#guest = null;
    try { sessionStorage.removeItem(GUEST_KEY); sessionStorage.removeItem('iot.vehiculo'); } catch { /* opcional */ }
  }

  expire() { this.clear(); this.emit('expired', {}); }
}
