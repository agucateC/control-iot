import { JOYSTICK_KEYS } from '../domain/catalog.js';
import { Emitter } from '../utils/emitter.js';

const ENTER = 0.38;      // radio normalizado para salir de la zona neutral
const LEAVE = 0.22;      // radio para volver a neutral (histéresis)
const ANGLE_MARGIN = 12; // grados extra para cambiar de dirección (evita parpadeo en diagonales)

/**
 * Joystick circular con Pointer Events (ratón y táctil) + teclado (flechas).
 * Emite 'direction' SOLO en transiciones: 'up'|'down'|'left'|'right'|null. Sin POST ni lógica de red.
 * Al soltar, cancelar, perder el puntero o la pestaña → null (neutral).
 */
export class Joystick extends Emitter {
  #root; #knob; #stateText; #pid = null; #dir = null; #enabled = true; #available = { up: true, down: true, left: true, right: true };
  #rect = null;

  constructor(root, knob, stateText) {
    super();
    this.#root = root; this.#knob = knob; this.#stateText = stateText;
    root.addEventListener('pointerdown', (e) => this.#down(e));
    root.addEventListener('pointermove', (e) => this.#move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(t, (e) => this.#up(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('keydown', (e) => this.#key(e, true));
    root.addEventListener('keyup', (e) => this.#key(e, false));
    root.addEventListener('blur', () => this.#neutral());
    globalThis.addEventListener('blur', () => this.#neutral());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.#neutral(); });
  }

  /** Direcciones sin comando en el catálogo quedan inertes. */
  setAvailability(catalog) {
    for (const d of Object.keys(this.#available)) this.#available[d] = catalog.joystickAvailable(d);
    for (const d of Object.keys(JOYSTICK_KEYS)) {
      this.#root.querySelector(`[data-dir="${JOYSTICK_KEYS[d]}"]`)?.classList.toggle('is-missing', !this.#available[d]);
    }
  }

  setEnabled(on) {
    this.#enabled = on;
    this.#root.classList.toggle('is-disabled', !on);
    this.#root.setAttribute('aria-disabled', String(!on));
    if (!on) this.#neutral();
  }

  /** Forzar neutral (p. ej. tras DETENER) sin esperar a que se suelte el puntero. */
  forceNeutral() {
    if (this.#pid !== null) { try { this.#root.releasePointerCapture(this.#pid); } catch { /* ya liberado */ } }
    this.#pid = null; this.#setDir(null); this.#drag(0, 0, false);
  }

  #down(e) {
    if (!this.#enabled || this.#pid !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.#pid = e.pointerId;
    this.#rect = this.#root.getBoundingClientRect();
    try { this.#root.setPointerCapture(e.pointerId); } catch { /* puntero ya inactivo */ }
    this.#root.classList.add('is-active');
    this.#root.focus({ preventScroll: true });
    this.#update(e);
  }
  #move(e) { if (e.pointerId === this.#pid) { e.preventDefault(); this.#update(e); } }
  #up(e) { if (e.pointerId === this.#pid) this.#neutral(); }

  #update(e) {
    const r = this.#rect ?? this.#root.getBoundingClientRect();
    const radius = r.width / 2;
    let nx = (e.clientX - (r.left + radius)) / radius;
    let ny = (e.clientY - (r.top + radius)) / radius;
    const mag = Math.hypot(nx, ny);
    if (mag > 1) { nx /= mag; ny /= mag; }
    this.#drag(nx, ny, true);
    this.#setDir(this.#classify(nx, ny, Math.min(mag, 1)));
  }

  #classify(nx, ny, mag) {
    const cur = this.#dir;
    if (mag < (cur ? LEAVE : ENTER)) return null;
    const ang = (Math.atan2(-ny, nx) * 180) / Math.PI;           // 0=der, 90=arriba
    const sector = (a) => (a >= 45 && a < 135 ? 'up' : a >= -135 && a < -45 ? 'down' : (a >= 135 || a < -135) ? 'left' : 'right');
    const next = sector(ang);
    if (cur && next !== cur) {                                    // histéresis angular
      const center = { right: 0, up: 90, left: 180, down: -90 }[cur];
      let diff = Math.abs(ang - center); if (diff > 180) diff = 360 - diff;
      if (diff < 45 + ANGLE_MARGIN) return cur;
    }
    return this.#available[next] ? next : null;
  }

  #setDir(d) {
    if (d === this.#dir) return;
    this.#dir = d;
    for (const [dir, key] of Object.entries(JOYSTICK_KEYS)) this.#root.querySelector(`[data-dir="${key}"]`)?.classList.toggle('is-on', dir === d);
    this.#stateText.textContent = d ? { up: 'Avanzar', down: 'Retroceder', left: 'Girar izquierda', right: 'Girar derecha' }[d] : 'Neutral';
    this.emit('direction', d);
  }

  #drag(nx, ny, active) {
    const k = 0.5 * this.#root.getBoundingClientRect().width * 0.58;  // recorrido máximo de la perilla
    this.#knob.style.setProperty('--dx', `${nx * k}px`);
    this.#knob.style.setProperty('--dy', `${ny * k}px`);
    this.#root.classList.toggle('is-active', active);
  }

  #neutral() {
    if (this.#pid !== null) { try { this.#root.releasePointerCapture(this.#pid); } catch { /* ya liberado */ } }
    this.#pid = null; this.#rect = null;
    this.#drag(0, 0, false);
    this.#setDir(null);
  }

  #key(e, down) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const d = map[e.key];
    if (!d || !this.#enabled) return;
    e.preventDefault();
    if (down) {
      if (e.repeat || !this.#available[d]) return;
      const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
      this.#drag(v[0] * 0.8, v[1] * 0.8, true); this.#setDir(d);
    } else if (this.#dir === d) { this.#drag(0, 0, false); this.#setDir(null); }
  }
}
