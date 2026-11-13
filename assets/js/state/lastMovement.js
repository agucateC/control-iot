import { Emitter } from '../utils/emitter.js';
import { parseServerDate } from '../utils/datetime.js';

/**
 * Estado del «último movimiento» mostrado en MONITOREO.
 *  kind:  'loading' | 'empty' | 'ready' | 'error'
 *  from:  'rest' (GET /estado) | 'wss' (evento en vivo)
 *  scope: 'individual' | 'demo' | 'ia'
 *  persistence: 'rds' (viene de RDS) | 'pending' | 'confirmed' | 'unconfirmed' | 'none' (DEMO/IA: no se guarda en historial)
 *
 * Regla anti-datos-viejos: cada evento WSS incrementa `seq`. Una respuesta REST solo se aplica si
 * `seq` no cambió desde que empezó la petición (si cambió, hubo algo MÁS NUEVO y la respuesta es vieja).
 */
const MOVE = new Set(['movimiento_individual', 'demo_movimiento']);
const DEMO_PHASE = { demo_inicio: 'running', demo_fin: 'done', demo_cancelada: 'cancelled', demo_error: 'error' };

export class LastMovement extends Emitter {
  #seq = 0; #lastSig = '';
  #s = { kind: 'loading', from: null, scope: null, comando: null, codigo: null, at: null, atRaw: null, origen: null,
    step: null, persistence: null, persistedId: null, note: '', demoPhase: null, error: '' };

  get state() { return this.#s; }
  get seq() { return this.#seq; }
  #set(patch) { this.#s = { ...this.#s, ...patch }; this.emit('change', this.#s); }

  setLoading() { if (this.#s.kind !== 'ready') this.#set({ kind: 'loading' }); }
  setError(message) { this.#set({ error: message, kind: this.#s.comando ? this.#s.kind : 'error' }); }
  clearError() { if (this.#s.error) this.#set({ error: '' }); }

  /** Marca el inicio de una lectura REST; devuelve el token que debe presentarse al aplicarla. */
  beginRest() { return this.#seq; }

  applyRest(token, estado) {
    if (token !== this.#seq) return false;                                // llegó un evento más nuevo: se descarta
    if (!estado.comando) {
      this.#set({ kind: 'empty', from: 'rest', comando: null, codigo: null, at: null, atRaw: null, scope: null,
        persistence: null, step: null, error: '', note: '' });
      return true;
    }
    this.#set({ kind: 'ready', from: 'rest', scope: 'individual', comando: estado.comando, codigo: estado.codigo,
      at: estado.fecha, atRaw: estado.fechaRaw, origen: null, step: null, persistence: 'rds', persistedId: null,
      error: '', note: '' });
    return true;
  }

  /** Evento WSS ya validado por SocketClient (mismo vehículo). Devuelve true si cambió la tarjeta. */
  applyEvent(ev) {
    if (ev.evento in DEMO_PHASE) {
      this.#seq++;
      this.#set({ demoPhase: { name: DEMO_PHASE[ev.evento], total: ev.total, detalle: ev.detalle, ia: ev.origen === 'ia' } });
      return true;
    }
    if (!MOVE.has(ev.evento) || !ev.comando) return false;
    const at = parseServerDate(ev.timestamp);
    const sig = `${ev.evento}|${ev.timestamp}|${ev.comando}|${ev.orden ?? ''}`;
    if (sig === this.#lastSig) return false;                              // evento duplicado
    if (this.#s.from === 'wss' && at && this.#s.at && at < this.#s.at) return false;   // evento atrasado
    this.#lastSig = sig; this.#seq++;
    const demo = ev.evento === 'demo_movimiento';
    this.#set({ kind: 'ready', from: 'wss', scope: demo ? (ev.origen === 'ia' ? 'ia' : 'demo') : 'individual',
      comando: ev.comando, codigo: ev.codigo, at, atRaw: ev.timestamp, origen: ev.origen,
      step: demo ? { orden: ev.orden, total: ev.total } : null,
      persistence: demo ? 'none' : 'pending', persistedId: null, error: '', note: '',
      demoPhase: demo ? { name: 'running', total: ev.total, ia: ev.origen === 'ia' } : this.#s.demoPhase });
    return true;
  }

  markPersisted(id, note = '') { if (this.#s.persistence === 'pending') this.#set({ persistence: 'confirmed', persistedId: id, note }); }
  markUnconfirmed() { if (this.#s.persistence === 'pending') this.#set({ persistence: 'unconfirmed' }); }
}
