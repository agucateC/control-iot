import { Emitter } from '../utils/emitter.js';
import { ApiError, friendlyMessage } from '../utils/errors.js';

/**
 * DEMO: la secuencia, el orden y la temporización los ejecuta el SERVIDOR.
 * Aquí solo se inicia/cancela por REST y se refleja el avance recibido por WSS.
 * Los pasos internos de la DEMO no se registran como movimientos individuales (lo garantiza el backend).
 * Emite 'change' con { demos, selected, running, starting, cancelling, idDemo, progress, message, kind }.
 */
export class DemoController extends Emitter {
  #service; #resyncTimer = 0;
  state = { demos: [], selected: null, running: false, starting: false, cancelling: false,
    idDemo: null, orden: 0, total: 0, message: 'Sin DEMO en ejecución.', kind: 'idle' };

  constructor(service) { super(); this.#service = service; }

  #set(p) { this.state = { ...this.state, ...p }; this.emit('change', this.state); }

  setDemos(demos) {
    const activos = demos.filter((d) => d.activo);
    const keep = activos.some((d) => d.id_demo === this.state.selected) ? this.state.selected : (activos[0]?.id_demo ?? null);
    this.#set({ demos: activos, selected: keep });
  }
  select(id) { this.#set({ selected: Number(id) || null }); }

  async start() {
    const s = this.state;
    if (s.running || s.starting) return;             // nunca dos DEMO simultáneas
    if (!s.selected) { this.#set({ message: 'Selecciona una DEMO.', kind: 'error' }); return; }
    this.#set({ starting: true, message: 'Solicitando inicio de la DEMO…', kind: 'busy' });
    try {
      const r = await this.#service.startDemo(s.selected);
      this.#set({ starting: false, running: true, idDemo: s.selected, orden: 0, total: r.total,
        message: `DEMO aceptada por la API (${r.total} movimientos). Esperando eventos…`, kind: 'busy' });
      this.#scheduleResync();
    } catch (e) {
      const running = e instanceof ApiError && e.status === 409;
      this.#set({ starting: false, message: friendlyMessage(e), kind: 'error' });
      if (running) this.resync();
    }
  }

  async cancel() {
    if (!this.state.running || this.state.cancelling) return false;
    this.#set({ cancelling: true, message: 'Cancelando DEMO…', kind: 'busy' });
    try {
      await this.#service.cancelDemo();
      this.#set({ cancelling: false });          // el cierre real llega por el evento demo_cancelada
      this.resync();
      return true;
    } catch (e) {
      const noDemo = e instanceof ApiError && e.status === 409;
      this.#set({ cancelling: false, message: friendlyMessage(e), kind: 'error', ...(noDemo ? { running: false } : {}) });
      return false;
    }
  }

  /** Eventos WSS (ya validados por SocketClient). */
  onSocketEvent(ev) {
    switch (ev.evento) {
      case 'demo_inicio':
        this.#set({ running: true, starting: false, idDemo: ev.idDemo, orden: 0, total: ev.total ?? 0, message: 'DEMO iniciada.', kind: 'busy' });
        this.#scheduleResync(); break;
      case 'demo_movimiento':
        this.#set({ running: true, idDemo: ev.idDemo ?? this.state.idDemo, orden: ev.orden ?? 0, total: ev.total ?? this.state.total,
          message: `Paso ${ev.orden ?? '?'} de ${ev.total ?? '?'}: ${ev.comando ?? '—'}${ev.duracionMs ? ` (${ev.duracionMs} ms)` : ''}`, kind: 'busy' }); break;
      case 'demo_fin': this.#end('DEMO finalizada.', 'ok'); break;
      case 'demo_cancelada': this.#end('DEMO cancelada. El vehículo quedó en DETENER.', 'ok'); break;
      case 'demo_error': this.#end(`La DEMO terminó con error. ${ev.detalle ?? ''}`.trim(), 'error'); break;
      default: break;
    }
  }

  #end(message, kind) {
    clearTimeout(this.#resyncTimer);
    this.#set({ running: false, starting: false, cancelling: false, orden: 0, total: 0, idDemo: null, message, kind });
  }

  /** Consulta GET ejecucion-demo: recupera el estado tras recargar la página o perder eventos. */
  async resync() {
    try {
      const r = await this.#service.getDemoExecution();
      if (r.running && !this.state.running) this.#set({ running: true, idDemo: r.idDemo, total: r.total, message: 'Hay una DEMO en ejecución en el servidor.', kind: 'busy' });
      if (!r.running && this.state.running) this.#end('DEMO finalizada.', 'ok');
    } catch { /* sin red: se reintenta en el siguiente ciclo */ }
    if (this.state.running) this.#scheduleResync();
  }

  #scheduleResync() { clearTimeout(this.#resyncTimer); this.#resyncTimer = setTimeout(() => this.resync(), 4000); }
}
