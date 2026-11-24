import { CONFIG } from '../config.js';
import { Emitter } from '../utils/emitter.js';
import { isObject, isPosInt, str } from '../utils/validators.js';

const KNOWN = new Set(['estado_inicial', 'movimiento_individual', 'demo_inicio', 'demo_movimiento',
  'demo_fin', 'demo_cancelada', 'demo_error', 'pong']);

/**
 * Sesión WSS REAL del navegador hacia /ws/vehiculos/{id}.
 * Estados: connecting | open | reconnecting | closed.  Emite: 'state' y 'event'.
 * Una sesión abierta NO equivale a un vehículo físico conectado.
 */
export class SocketClient extends Emitter {
  #url; #id; #ws = null; #state = 'closed'; #attempt = 0; #retryTimer = 0; #pingTimer = 0; #pongTimer = 0;
  #stopped = true; #session; #authed = true;

  /** `session` (AuthSession) opcional: con él el primer mensaje autentica el canal ({type:'auth', token}). */
  constructor(vehicleId, session = null) {
    super();
    this.#session = session;
    this.#id = vehicleId;
    this.#url = CONFIG.WS_BASE_URL + CONFIG.ENDPOINTS.ws(vehicleId);
  }

  get state() { return this.#state; }
  get isOpen() { return this.#state === 'open'; }
  /** Mixed content: una página HTTPS no puede abrir ws:// (salvo localhost). */
  get blockedByMixedContent() {
    return globalThis.location?.protocol === 'https:' && this.#url.startsWith('ws://');
  }

  start() {
    this.#stopped = false;
    globalThis.addEventListener?.('online', this.#onOnline);
    this.#connect();
  }

  stop() {
    this.#stopped = true;
    globalThis.removeEventListener?.('online', this.#onOnline);
    this.#clearTimers();
    this.#detach();
    this.#set('closed');
  }

  #onOnline = () => { if (!this.#stopped && !this.isOpen) { this.#attempt = 0; this.#connect(); } };

  #set(state, extra = {}) {
    this.#state = state;
    this.emit('state', { state, attempt: this.#attempt, ...extra });
  }

  #detach() {
    const ws = this.#ws;
    this.#ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* ya cerrado */ }
  }

  #connect() {
    clearTimeout(this.#retryTimer);
    this.#detach();
    if (this.blockedByMixedContent) { this.#set('closed', { reason: 'mixed-content' }); return; }
    this.#set(this.#attempt === 0 ? 'connecting' : 'reconnecting');
    let ws;
    try { ws = new WebSocket(this.#url); } catch { this.#scheduleRetry(); return; }
    this.#ws = ws;
    ws.onopen = () => {
      if (this.#session?.token) {              // enforced: no se declara «abierto» hasta que la API autoriza este canal
        this.#authed = false;
        ws.send(JSON.stringify({ type: 'auth', token: this.#session.token }));
        return;
      }
      this.#attempt = 0; this.#set('open'); this.#startPing();
    };
    ws.onmessage = (ev) => this.#onMessage(ev);
    ws.onerror = () => { /* el detalle llega en onclose */ };
    ws.onclose = (ev) => {
      this.#clearTimers();
      if (this.#ws === ws) this.#ws = null;
      if (this.#stopped) return;
      if (ev.code === 4404) { this.#set('closed', { reason: 'not-found' }); return; }
      if (ev.code === 4403 || ev.code === 4408) { this.#set('closed', { reason: ev.code === 4408 ? 'session-ended' : 'forbidden' }); return; }   // sin permiso: no reintentar
      if (ev.code === 4401 && this.#session) {   // token vencido/sesión cerrada: renovar y reconectar; si no se puede, la sesión terminó
        this.#session.refresh().then((ok) => { if (this.#stopped) return; if (ok) this.#connect(); else this.#set('closed', { reason: 'unauthorized' }); });
        return;
      }
      this.#scheduleRetry(ev.code);
    };
  }

  #scheduleRetry(code) {
    const list = CONFIG.WS_BACKOFF_MS;
    const base = list[Math.min(this.#attempt, list.length - 1)];
    const delay = base + Math.floor(Math.random() * 400);
    this.#attempt += 1;
    this.#set('reconnecting', { code, delay });
    this.#retryTimer = setTimeout(() => this.#connect(), delay);
  }

  #startPing() {
    this.#clearTimers();
    this.#pingTimer = setInterval(() => {
      if (this.#ws?.readyState !== WebSocket.OPEN) return;
      try { this.#ws.send('ping'); } catch { return; }
      clearTimeout(this.#pongTimer);
      // Sin pong a tiempo → la conexión está muerta (red caída sin cierre): forzar reconexión.
      this.#pongTimer = setTimeout(() => this.#ws?.close(), CONFIG.WS_PONG_TIMEOUT_MS);
    }, CONFIG.WS_PING_MS);
  }

  #clearTimers() { clearInterval(this.#pingTimer); clearTimeout(this.#pongTimer); clearTimeout(this.#retryTimer); }

  #onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }       // JSON remoto no confiable
    if (!isObject(msg) || typeof msg.evento !== 'string' || !KNOWN.has(msg.evento)) return;
    if (!this.#authed) { this.#authed = true; this.#attempt = 0; this.#set('open'); this.#startPing(); }
    if (msg.id_vehiculo !== this.#id) return;                    // solo el vehículo propio
    if (msg.evento === 'pong') { clearTimeout(this.#pongTimer); return; }
    this.emit('event', {
      evento: msg.evento, comando: str(msg.comando, 60) || null,
      codigo: Number.isInteger(msg.codigo) ? msg.codigo : null,
      timestamp: str(msg.timestamp, 40) || null, origen: str(msg.origen, 30) || null,
      idDemo: isPosInt(msg.id_demo) ? msg.id_demo : null,
      orden: isPosInt(msg.orden) ? msg.orden : null,
      total: isPosInt(msg.total_movimientos) ? msg.total_movimientos : null,
      duracionMs: Number.isFinite(msg.duracion_ms) ? msg.duracion_ms : null,
      detalle: str(msg.detalle, 200) || null,
    });
  }
}
