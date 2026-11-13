import { el, setText } from '../utils/dom.js';
import { formatDateTime, zoneLabel } from '../utils/datetime.js';

const CONN = {
  open: null,
  connecting: 'Conectando con el servidor en tiempo real…',
  reconnecting: 'Reconectando… los datos pueden estar desactualizados.',
  closed: 'Desconectado: sin tiempo real. Se muestran los últimos datos conocidos.',
};
const TABLE_MSG = { loading: 'Cargando…', empty: 'Sin registros', error: 'Error al cargar el historial' };
const SCOPE = { individual: 'Movimiento individual', demo: 'Paso de DEMO', ia: 'Paso de instrucción IA' };
const PHASE = { running: 'DEMO en ejecución', done: 'DEMO finalizada', cancelled: 'DEMO cancelada', error: 'DEMO terminó con error' };

/** Vista de MONITOREO: solo pinta lo que le dicen (sin red ni lógica). Todo texto remoto entra con textContent. */
export class MonitorView {
  #rows = new Map(); #animate = false;

  constructor(root = document) {
    const $ = (id) => root.getElementById(id);
    this.card = $('mon-card'); this.cmd = $('mon-cmd'); this.codeBox = $('mon-code'); this.codeVal = $('mon-code-val');
    this.when = $('mon-when'); this.time = $('mon-time'); this.zone = $('mon-zone'); this.scope = $('mon-scope'); this.demo = $('mon-demo');
    this.errBox = $('mon-card-error');
    this.evChannel = $('mon-ev-channel'); this.evRds = $('mon-ev-rds');
    this.conn = $('mon-conn'); this.tbody = $('mon-tbody'); this.tableMsg = $('mon-table-msg'); this.scroll = $('mon-scroll');
    this.vehicleName = $('mon-vehicle-name'); this.vehicleId = $('mon-vehicle-id');
    this.refreshBtn = $('mon-refresh'); this.retryBtn = $('mon-retry');
    setText(this.zone, zoneLabel());
  }

  onRefresh(fn) { this.refreshBtn.addEventListener('click', fn); this.retryBtn.addEventListener('click', fn); }
  setVehicle(name, id) { setText(this.vehicleName, name); setText(this.vehicleId, id ? `(ID: ${id})` : ''); }

  setConnection(state) {
    const msg = state in CONN ? CONN[state] : CONN.closed;
    this.conn.dataset.state = state;
    this.conn.hidden = !msg;
    setText(this.conn, msg ?? '');
  }

  #ev(node, state, text) { node.dataset.state = state; setText(node.querySelector('[data-role="val"]'), text); }

  renderCard(s) {
    this.card.dataset.state = s.kind;
    this.card.dataset.scope = s.scope ?? '';
    this.errBox.hidden = !s.error;
    setText(this.errBox, s.error ? `Error: ${s.error}` : '');
    const ready = s.kind === 'ready';
    setText(this.cmd, { loading: 'Cargando…', empty: 'Sin movimientos', error: 'Error' }[s.kind] ?? s.comando);
    this.codeBox.hidden = !(ready && s.codigo !== null);
    setText(this.codeVal, ready && s.codigo !== null ? String(s.codigo) : '');
    this.when.hidden = !(ready && s.at);
    if (ready && s.at) { this.time.dateTime = s.at.toISOString(); setText(this.time, formatDateTime(s.at)); }
    setText(this.scope, ready ? `${SCOPE[s.scope] ?? ''}${s.step ? ` ${s.step.orden ?? '?'}/${s.step.total ?? '?'}` : ''}` : '');

    const ph = s.demoPhase;
    this.demo.hidden = !ph || (ph.name !== 'running' && s.scope === 'individual' && s.from === 'rest');
    setText(this.demo, ph ? `${ph.ia && ph.name === 'running' ? 'Instrucción IA en ejecución' : PHASE[ph.name] ?? ''}${ph.detalle ? `: ${ph.detalle}` : ''}` : '');
    this.demo.dataset.phase = ph?.name ?? '';

    if (!ready) { this.#ev(this.evChannel, 'na', '—'); this.#ev(this.evRds, 'na', '—'); return; }
    this.#ev(this.evChannel, s.from === 'wss' ? 'ok' : 'info', s.from === 'wss' ? 'Publicado por WSS (tiempo real)' : 'Leído de la API (GET /estado)');
    const rds = {
      rds: ['info', 'Estado guardado en RDS'],
      pending: ['wait', 'Verificando en el historial…'],
      confirmed: ['ok', `Persistido en RDS · historial #${s.persistedId}${s.note ? ` — ${s.note}` : ''}`],
      unconfirmed: ['warn', 'Sin confirmar en el historial (usa ⟳ para reintentar)'],
      none: ['na', 'No se guarda en el historial (DEMO/IA)'],
    }[s.persistence] ?? ['na', '—'];
    this.#ev(this.evRds, rds[0], rds[1]);
  }

  setTableStatus(kind, extra = '') {
    this.tableMsg.dataset.state = kind;
    this.tableMsg.hidden = kind === 'ok';
    this.retryBtn.hidden = kind !== 'error';
    setText(this.tableMsg, kind === 'ok' ? '' : `${TABLE_MSG[kind]}${extra ? `. ${extra}` : ''}`);
    this.scroll.hidden = kind === 'empty' || (kind === 'loading' && !this.#rows.size) || (kind === 'error' && !this.#rows.size);
    this.tbody.closest('table').setAttribute('aria-busy', String(kind === 'loading'));
  }

  /** Reconcilia el DOM por id_historial: crea solo las filas nuevas, reordena y quita las que salen del top 10. */
  renderTable(items, addedIds = []) {
    const wanted = new Set(items.map((i) => i.id));
    for (const [id, tr] of this.#rows) if (!wanted.has(id)) { tr.remove(); this.#rows.delete(id); }
    let cur = this.tbody.firstElementChild;
    items.forEach((it, idx) => {
      let tr = this.#rows.get(it.id);
      if (!tr) {
        tr = this.#makeRow(it);
        this.#rows.set(it.id, tr);
        if (this.#animate && addedIds.includes(it.id)) { tr.classList.add('is-new'); tr.addEventListener('animationend', () => tr.classList.remove('is-new'), { once: true }); }
      }
      if (tr === cur) cur = cur.nextElementSibling; else this.tbody.insertBefore(tr, cur);
      const n = String(idx + 1);
      if (tr.cells[0].textContent !== n) setText(tr.cells[0], n);
    });
    this.#animate = true;                                   // la primera carga no se anima
  }

  #makeRow(it) {
    const when = el('time', { text: formatDateTime(it.fecha) });
    if (it.fecha) when.dateTime = it.fecha.toISOString();
    else when.title = it.fechaRaw ? 'Fecha no interpretable' : 'Sin fecha';
    const tr = el('tr', { attrs: { 'data-id': String(it.id) }, children: [
      el('td', { cls: 'c-num' }),
      el('td', { cls: 'c-mov', text: it.comando, attrs: { title: `ID #${it.id}${it.codigo !== null ? ` · código ${it.codigo}` : ''}${it.origen ? ` · origen ${it.origen}` : ''}` } }),
      el('td', { cls: 'c-when', children: [when] }),
    ] });
    return tr;
  }
}
