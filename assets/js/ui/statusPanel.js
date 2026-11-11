import { hora } from '../utils/format.js';
import { setText } from '../utils/dom.js';

const WS_TEXT = { open: ['En línea', '✔'], connecting: ['Conectando…', '…'], reconnecting: ['Reconectando…', '↻'], closed: ['Desconectado', '✖'] };
const API_TEXT = { up: ['Disponible', '✔'], checking: ['Comprobando…', '…'], down: ['No disponible', '✖'] };
const RDS_TEXT = { up: ['Disponible', '✔'], down: ['No disponible', '✖'], unverified: ['Sin verificar', '?'] };

/** Tres indicadores independientes: sesión WSS, servidor AWS (/salud) y RDS (/salud/rds). */
export class StatusPanel {
  constructor(root = document) {
    this.ws = root.getElementById('ind-ws');
    this.api = root.getElementById('ind-api');
    this.rds = root.getElementById('ind-rds');
    this.event = root.getElementById('event-line');
  }

  #apply(node, state, [text, mark], title) {
    node.dataset.state = state;
    const v = node.querySelector('[data-role="value"]');
    v.dataset.mark = mark;
    setText(v, text);
    node.title = title ?? '';
  }

  setWs(state, info = {}) {
    let title = 'Sesión WebSocket del navegador con la API (no es el vehículo físico).';
    if (info.reason === 'mixed-content') title = 'Bloqueado: una página HTTPS no puede usar ws://. Usa wss://.';
    if (info.reason === 'not-found') title = 'La API rechazó el vehículo (no existe).';
    if (info.state === 'reconnecting' && info.delay) title = `Reintento ${info.attempt} en ${(info.delay / 1000).toFixed(1)} s.`;
    this.#apply(this.ws, state, WS_TEXT[state] ?? WS_TEXT.closed, title);
  }
  setApi(state) { this.#apply(this.api, state, API_TEXT[state] ?? API_TEXT.checking, 'Resultado de GET /salud'); }
  setRds(state) { this.#apply(this.rds, state, RDS_TEXT[state] ?? RDS_TEXT.unverified,
    state === 'unverified' ? 'Sin diagnóstico verificado de RDS desde el backend.' : 'Resultado de GET /salud/rds'); }

  showEvent(ev) {
    const bits = [hora(ev.timestamp), ev.evento];
    if (ev.comando) bits.push(`${ev.comando}${ev.codigo !== null ? ` (código ${ev.codigo})` : ''}`);
    if (ev.orden) bits.push(`paso ${ev.orden}/${ev.total ?? '?'}`);
    if (ev.origen) bits.push(`origen ${ev.origen}`);
    setText(this.event, bits.join(' · '));
  }
}
