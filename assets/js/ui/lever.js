import { LEVER_KEYS } from '../domain/catalog.js';
import { Emitter } from '../utils/emitter.js';

const ENTER = 0.5;     // desplazamiento normalizado para activar
const LEAVE = 0.28;    // para volver a neutral (histéresis)
const KNOB = 0.78;     // diámetro de la perilla = 78 % del ancho de la palanca (coincide con el CSS)

/**
 * Palanca de la garra (estilo gatillo/stick de control de Xbox, pero de UN solo eje).
 * Emite 'direction' SOLO en transiciones: 'up' (sube) | 'down' (baja) | null (neutral → al soltar se detiene).
 * Pointer Events (ratón/táctil) + teclado (↑/↓ o RePág/AvPág con la palanca enfocada). Sin red ni lógica de comandos.
 */
export class Lever extends Emitter {
  #root; #knob; #pid = null; #dir = null; #enabled = true; #available = { up: true, down: true }; #rect = null;

  constructor(root) {
    super();
    this.#root = root; this.#knob = root.querySelector('.lv-knob');
    root.addEventListener('pointerdown', (e) => this.#down(e));
    root.addEventListener('pointermove', (e) => { if (e.pointerId === this.#pid) { e.preventDefault(); this.#update(e); } });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(t, (e) => { if (e.pointerId === this.#pid) this.#neutral(); });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('keydown', (e) => this.#key(e, true));
    root.addEventListener('keyup', (e) => this.#key(e, false));
    root.addEventListener('blur', () => this.#neutral());
    globalThis.addEventListener('blur', () => this.#neutral());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.#neutral(); });
  }

  /** Sin ningún comando de garra en el catálogo, la palanca se oculta; con uno solo, el otro sentido queda inerte. */
  setAvailability(catalog) {
    for (const d of Object.keys(this.#available)) this.#available[d] = catalog.leverAvailable(d);
    this.#root.hidden = !(this.#available.up || this.#available.down);
    for (const [d, key] of Object.entries(LEVER_KEYS)) this.#root.querySelector(`[data-dir="${key}"]`)?.classList.toggle('is-missing', !this.#available[d]);
  }

  setEnabled(on) {
    this.#enabled = on;
    this.#root.classList.toggle('is-disabled', !on);
    this.#root.setAttribute('aria-disabled', String(!on));
    if (!on) this.#neutral();
  }

  /** Fase del comando (pressed/sending/accepted/error/idle) para el brillo de la palanca. */
  setPhase(key, state) {
    if (!Object.values(LEVER_KEYS).includes(key)) return;
    this.#root.dataset.state = state;
    this.#root.setAttribute('aria-busy', String(state === 'sending'));
  }

  forceNeutral() {
    if (this.#pid !== null) { try { this.#root.releasePointerCapture(this.#pid); } catch { /* ya liberado */ } }
    this.#pid = null; this.#rect = null; this.#pull(0, false); this.#setDir(null);
  }

  #down(e) {
    if (!this.#enabled || this.#pid !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.#pid = e.pointerId; this.#rect = this.#root.getBoundingClientRect();
    try { this.#root.setPointerCapture(e.pointerId); } catch { /* puntero ya inactivo */ }
    this.#root.focus({ preventScroll: true });
    this.#update(e);
  }

  #update(e) {
    const r = this.#rect ?? this.#root.getBoundingClientRect();
    const travel = Math.max(1, (this.#root.clientHeight - this.#root.clientWidth * KNOB) / 2);   // recorrido útil de la perilla (sin bordes)
    const n = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / travel));   // -1 = arriba, 1 = abajo
    this.#pull(n, true);
    const mag = Math.abs(n);
    const cur = this.#dir;
    let next = null;
    if (mag >= (cur ? LEAVE : ENTER)) next = n < 0 ? 'up' : 'down';
    this.#setDir(next && this.#available[next] ? next : null);
  }

  #setDir(d) {
    if (d === this.#dir) return;
    this.#dir = d;
    for (const [dir, key] of Object.entries(LEVER_KEYS)) this.#root.querySelector(`[data-dir="${key}"]`)?.classList.toggle('is-on', dir === d);
    this.#root.dataset.dir = d ?? '';
    this.emit('direction', d);
  }

  #pull(n, active) {
    this.#root.style.setProperty('--n', String(n));
    this.#root.classList.toggle('is-active', active);
  }

  #neutral() {
    if (this.#pid !== null) { try { this.#root.releasePointerCapture(this.#pid); } catch { /* ya liberado */ } }
    this.#pid = null; this.#rect = null;
    this.#pull(0, false); this.#setDir(null);
  }

  #key(e, down) {
    const d = { ArrowUp: 'up', PageUp: 'up', ArrowDown: 'down', PageDown: 'down' }[e.key];
    if (!d || !this.#enabled) return;
    e.preventDefault();
    if (down) { if (e.repeat || !this.#available[d]) return; this.#pull(d === 'up' ? -0.9 : 0.9, true); this.#setDir(d); }
    else if (this.#dir === d) { this.#pull(0, false); this.#setDir(null); }
  }
}
