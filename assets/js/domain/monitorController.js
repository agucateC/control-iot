import { CONFIG } from '../config.js';
import { ApiError, friendlyMessage } from '../utils/errors.js';
import { SingleFlight } from '../utils/singleFlight.js';

const DEMO_END = new Set(['demo_fin', 'demo_cancelada', 'demo_error']);
const msg = (e) => friendlyMessage(e instanceof TypeError ? new ApiError('invalid', e.message) : e);

/**
 * Orquesta MONITOREO. REST = fuente de verdad (estado e historial); WSS = disparador en tiempo real.
 *
 * Estrategia (comprobable en tests/):
 *  - Orden/duplicados: el historial se ordena por id_historial DESC y se deduplica por ese id (servicio).
 *  - Datos viejos: LastMovement descarta una respuesta REST si llegó un evento WSS después de pedirla.
 *  - Fetch simultáneos: SingleFlight (1 en vuelo + a lo sumo 1 repetición).
 *  - Evento individual → se espera que el historial muestre un id mayor al conocido; si no, reintentos acotados
 *    (CONFIG.HISTORY_RETRY_MS) y luego «Sin confirmar». Sin polling continuo.
 *  - Eventos de DEMO/IA: solo actualizan la tarjeta; NUNCA tocan el historial. Al terminar la DEMO se reconcilia el estado por REST.
 *  - WSS reconectado, regreso a la pestaña o API recuperada: resincronización REST de estado + historial.
 */
export class MonitorController {
  #svc; #view; #last; #hist; #active = false;
  #expect = null; #retryN = 0; #retryTimer = 0; #wsWasDown = false; #histLoaded = false;
  #state = new SingleFlight(() => this.#loadState());
  #history = new SingleFlight(() => this.#loadHistory());

  constructor({ service, view, lastMovement, history }) {
    this.#svc = service; this.#view = view; this.#last = lastMovement; this.#hist = history;
    this.#last.on('change', (s) => this.#view.renderCard(s));
    this.#view.renderCard(this.#last.state);
    this.#view.onRefresh(() => this.refreshAll());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.#active) this.refreshAll(); });
  }

  get active() { return this.#active; }
  setVehicle(name, id) { this.#view.setVehicle(name, id); }

  activate() {
    this.#active = true;
    this.refreshAll();                         // al entrar: estado + historial reales por REST
  }
  deactivate() { this.#active = false; clearTimeout(this.#retryTimer); }

  refreshAll() { this.#state.run(); this.#history.run(); }

  /** Sesión WSS (la propia del navegador, compartida con CONTROL). */
  onSocketState({ state }) {
    this.#view.setConnection(state);
    if (state !== 'open') { this.#wsWasDown = true; return; }
    if (this.#wsWasDown) { this.#wsWasDown = false; if (this.#active) this.refreshAll(); }
  }

  /** Evento ya validado y filtrado por vehículo (SocketClient). */
  onSocketEvent(ev) {
    if (ev.evento === 'estado_inicial' || ev.evento === 'pong') return;
    const changed = this.#last.applyEvent(ev);
    if (ev.evento === 'movimiento_individual' && changed) {
      this.#expect ??= this.#hist.topId ?? 0;      // el historial debe superar este id
      this.#retryN = 0;
      if (this.#active) this.#history.run();
    }
    if (DEMO_END.has(ev.evento) && this.#active) this.#state.run();
  }

  onApiRecovered() {
    if (this.#active && (this.#last.state.kind === 'error' || this.#last.state.error || this.#view.tableMsg.dataset.state === 'error')) this.refreshAll();
  }

  async #loadState() {
    const token = this.#last.beginRest();
    this.#last.setLoading();
    try {
      const estado = await this.#svc.getState();
      this.#last.clearError();
      this.#last.applyRest(token, estado);
    } catch (e) { this.#last.setError(msg(e)); }
  }

  async #loadHistory() {
    if (!this.#histLoaded) this.#view.setTableStatus('loading');
    try {
      const list = await this.#svc.getHistory();
      const { added } = this.#hist.replace(list);
      this.#histLoaded = true;
      this.#view.renderTable(this.#hist.items, added);
      this.#view.setTableStatus(list.length ? 'ok' : 'empty');
      this.#resolveExpectation();
    } catch (e) {
      this.#view.setTableStatus(this.#histLoaded ? 'ok' : 'error', this.#histLoaded ? '' : msg(e));
      if (this.#histLoaded) this.#last.setError(`No se pudo actualizar el historial. ${msg(e)}`);
    }
  }

  #resolveExpectation() {
    if (this.#expect === null) return;
    const top = this.#hist.items[0];
    if (top && top.id > this.#expect) {
      this.#expect = null; this.#retryN = 0; clearTimeout(this.#retryTimer);
      const s = this.#last.state;
      let note = '';
      if (s.at && top.fecha) {
        const diff = Math.abs(top.fecha - s.at);
        if (diff > CONFIG.CLOCK_SKEW_WARN_MS) note = `aviso: la hora de la BD difiere ${Math.round(diff / 60000)} min de la del evento (revisa SERVER_NAIVE_IS_UTC)`;
      }
      this.#last.markPersisted(top.id, note);
      return;
    }
    const delay = CONFIG.HISTORY_RETRY_MS[this.#retryN];
    if (delay === undefined) { this.#expect = null; this.#retryN = 0; this.#last.markUnconfirmed(); return; }
    this.#retryN++;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => { if (this.#active) this.#history.run(); }, delay);
  }
}
