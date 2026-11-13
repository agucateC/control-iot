import { CONFIG } from '../config.js';
import { Emitter } from '../utils/emitter.js';
import { ApiError, friendlyMessage } from '../utils/errors.js';

const STOP_RETRIES = [0, 400, 1000];   // DETENER es seguridad: se reintenta ante fallos de red

/**
 * ÚNICA tubería de envío de comandos (joystick, botones y DETENER pasan por aquí).
 *
 * Reglas:
 *  - Solo un comando activo a la vez: un control "dueño" (owner) mantiene el movimiento.
 *  - Las solicitudes se serializan (una POST en vuelo); las intermedias se COALESCEN (gana la última),
 *    y no se reenvía el comando que ya está activo (sin POST repetitivos por píxel/fotograma).
 *  - DETENER tiene prioridad absoluta: se envía antes que cualquier movimiento pendiente.
 *  - Con una DEMO en ejecución solo se admite DETENER/cancelar.
 *
 * Eventos: 'demoStop' (DETENER durante una DEMO → cancelar)  'phase' {key,state}  'lock' {owner,demo}  'action' {kind,text,steps,detail}  'forceRelease' {owner}
 */
export class CommandController extends Emitter {
  #service; #catalog = null; #isWsOpen;
  #owner = null; #blocked = new Set();
  #move = null; #stopQueued = false; #sending = false;
  #active = false; #lastId = null; #demo = false;
  #pending = new Map();      // timestamp → { cmd, res, timer }
  #seen = new Map();         // timestamp → evento WSS ya recibido (el servidor lo emite ANTES de responder el POST)
  #phaseTimers = new Map();

  constructor({ service, isWsOpen = () => false }) { super(); this.#service = service; this.#isWsOpen = isWsOpen; }

  setCatalog(catalog) { this.#catalog = catalog; this.#lock(); }
  get ready() { return Boolean(this.#catalog?.size); }
  get owner() { return this.#owner; }
  get demoRunning() { return this.#demo; }

  setDemoRunning(running) {
    if (this.#demo === running) return;
    this.#demo = running;
    if (running) { // el servidor ejecuta la secuencia: se descartan solicitudes locales
      this.#move = null;
      const o = this.#owner; this.#owner = null; this.#active = false;
      if (o) this.emit('forceRelease', { owner: o });
    }
    this.#lock();
  }

  #lock() { this.emit('lock', { owner: this.#owner, demo: this.#demo, sending: this.#sending }); }

  #setPhase(key, state, resetMs) {
    clearTimeout(this.#phaseTimers.get(key));
    this.emit('phase', { key, state });
    if (resetMs) this.#phaseTimers.set(key, setTimeout(() => this.emit('phase', { key, state: this.#owner && state === 'accepted' ? 'pressed' : 'idle' }), resetMs));
  }

  /** Mantener un comando (joystick o botón). `owner` identifica al control que lo sostiene. */
  press(key, owner) {
    const cmd = this.#catalog?.get(key);
    if (!cmd || cmd.mode === 'stop') return this.#reject('Ese movimiento no existe en el catálogo del vehículo.');
    if (this.#demo) return this.#reject('Hay una DEMO en ejecución. Cancélala o usa DETENER.');
    if (this.#blocked.has(owner)) return false;                         // tras DETENER, hasta soltar
    if (this.#owner && this.#owner !== owner) return this.#reject('Suelta el control actual antes de usar otro.');
    if (cmd.mode === 'pulse') return this.pulse(key, owner);
    const prev = this.#owner;
    this.#owner = owner;
    if (prev !== owner) this.#lock();
    this.#setPhase(key, 'pressed');
    this.#move = key;
    this.#pump();
    return true;
  }

  /** Soltar un control mantenido → DETENER. */
  release(owner) {
    this.#blocked.delete(owner);
    if (this.#owner !== owner) return;
    this.#owner = null;
    const neverSent = this.#move !== null && !this.#sending && !this.#active;
    this.#move = null;                  // un movimiento aún no enviado ya no tiene sentido
    this.#stopQueued = !neverSent;
    this.#lock();
    this.#pump();
  }

  /** Al salir de la vista CONTROL: si algo seguía sostenido, se suelta (→ DETENER). Sin control activo no envía nada. */
  releaseAll() { if (this.#owner) this.release(this.#owner); }

  /** Acción puntual (giro 90°/360°, sonido…): una sola solicitud. */
  pulse(key, owner = `pulse:${key}`) {
    const cmd = this.#catalog?.get(key);
    if (!cmd) return this.#reject('Ese movimiento no existe en el catálogo del vehículo.');
    if (this.#demo) return this.#reject('Hay una DEMO en ejecución. Cancélala o usa DETENER.');
    if (this.#owner && this.#owner !== owner) return this.#reject('Suelta el control actual antes de usar otro.');
    if (this.#sending || this.#move || this.#stopQueued) return this.#reject('Espera a que termine el envío anterior.');
    this.#setPhase(key, 'pressed');
    this.#move = key;
    this.#pump();
    return true;
  }

  /** DETENER (botón, Escape, pérdida de foco): prioridad absoluta; descarta lo pendiente. */
  stop() {
    if (this.#demo) {                    // el servidor está ejecutando la DEMO: detener = cancelarla (un POST de movimiento daría 409)
      this.emit('demoStop', {});
      return;
    }
    if (this.#owner) { this.#blocked.add(this.#owner); this.emit('forceRelease', { owner: this.#owner }); }
    this.#owner = null;
    this.#move = null;
    this.#stopQueued = true;
    this.#lock();
    this.#pump();
  }

  #reject(text) { this.emit('action', { kind: 'error', text, steps: null, detail: '' }); return false; }

  async #pump() {
    if (this.#sending) return;
    this.#sending = true; this.#lock();
    try {
      for (;;) {
        if (this.#stopQueued) { this.#stopQueued = false; await this.#run('DETENER'); continue; }
        if (this.#move) { const k = this.#move; this.#move = null; await this.#run(k); continue; }
        break;
      }
    } finally { this.#sending = false; this.#lock(); }
  }

  async #run(key) {
    const cmd = this.#catalog?.get(key);
    const isStop = key === 'DETENER';
    if (!cmd) {
      this.emit('action', { kind: 'error', text: isStop ? 'El catálogo no tiene el comando DETENER.' : 'Comando no disponible.', steps: null,
        detail: isStop ? 'Créalo (código 9) para poder detener el vehículo.' : '' });
      this.#setPhase(key, 'error', 1200);
      return;
    }
    if (!isStop && cmd.id_comando === this.#lastId && this.#active) { this.#setPhase(key, this.#owner ? 'pressed' : 'idle'); return; } // duplicado

    this.#setPhase(key, 'sending');
    this.emit('action', { kind: 'busy', text: `Enviando ${cmd.label}…`, steps: { requested: true, accepted: false, event: false }, detail: '' });
    const tries = isStop ? STOP_RETRIES : [0];
    let lastErr = null;
    for (const wait of tries) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const res = await this.#service.sendMovement(cmd);
        this.#lastId = cmd.id_comando;
        this.#active = !isStop;
        this.#setPhase(key, 'accepted', 700);
        this.emit('action', { kind: 'ok', text: `${cmd.label} aceptado por la API (código ${res.codigo}).`,
          steps: { requested: true, accepted: true, event: false }, detail: this.#isWsOpen() ? 'Esperando evento por WebSocket…' : 'WebSocket sin conexión: no habrá evento.' });
        this.#track(res, cmd);          // después de 'aceptado': si el evento WSS ya llegó, lo confirma de inmediato
        return;
      } catch (e) {
        lastErr = e;
        if (e instanceof ApiError && e.kind === 'http' && e.status >= 400 && e.status < 500) break; // rechazo definitivo: no reintentar
      }
    }
    this.#setPhase(key, 'error', 1500);
    this.emit('action', { kind: 'error', text: `${cmd.label}: no se pudo enviar. ${friendlyMessage(lastErr)}`, steps: { requested: true, accepted: false, event: false }, detail: '' });
    if (!isStop && !(lastErr?.kind === 'http' && lastErr.status < 500)) {
      // Resultado incierto (timeout/red): por seguridad se solicita DETENER.
      this.#active = true; this.#stopQueued = true;
    }
  }

  /** Correlaciona el POST aceptado con el evento WSS (mismo `timestamp`). */
  #track(res, cmd) {
    const early = this.#seen.get(res.timestamp);
    if (early) { this.#seen.delete(res.timestamp); this.#confirm(early, cmd); return; }
    const timer = setTimeout(() => {
      this.#pending.delete(res.timestamp);
      this.emit('action', { kind: 'ok', text: `${cmd.label} aceptado por la API (código ${res.codigo}).`,
        steps: { requested: true, accepted: true, event: false },
        detail: this.#isWsOpen() ? 'No llegó el evento WSS esperado todavía.' : 'WebSocket desconectado: no se puede observar el evento.' });
    }, CONFIG.EVENT_WAIT_MS);
    this.#pending.set(res.timestamp, { cmd, res, timer });
  }

  #confirm(ev, cmd) {
    this.emit('action', { kind: 'ok', text: `${cmd.label}: evento recibido por WebSocket (código ${ev.codigo}).`,
      steps: { requested: true, accepted: true, event: true },
      detail: 'Esto confirma el mensaje en tiempo real, no la ejecución física del vehículo.' });
  }

  /** Llamar con cada evento WSS recibido. */
  onSocketEvent(ev) {
    if (ev.evento !== 'movimiento_individual' || !ev.timestamp) return;
    const hit = this.#pending.get(ev.timestamp);
    if (hit) { clearTimeout(hit.timer); this.#pending.delete(ev.timestamp); this.#confirm(ev, hit.cmd); return; }
    this.#seen.set(ev.timestamp, ev);                       // llegó antes que la respuesta HTTP
    if (this.#seen.size > 20) this.#seen.delete(this.#seen.keys().next().value);
  }
}
