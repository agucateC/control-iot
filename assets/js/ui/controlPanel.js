import { el, icon, setText } from '../utils/dom.js';

/**
 * Vista + eventos de los botones del catálogo, joystick y DETENER.
 * Solo traduce gestos a llamadas del CommandController (la lógica común vive allí).
 * Estados de botón: normal, pressed, sending, accepted, error, disabled.
 */
export class ControlPanel {
  #cmd; #joystick; #extrasRoot; #stopBtn; #buttons = new Map(); #catalog = null; #lock = { owner: null, demo: false };
  #logBox; #logMain; #logEvidence; #isActive;

  constructor({ commandController, joystick, root = document, isActive = () => true }) {
    this.#cmd = commandController; this.#joystick = joystick; this.#isActive = isActive;
    this.#extrasRoot = root.getElementById('extras');
    this.#stopBtn = root.getElementById('btn-stop');
    this.#logBox = root.getElementById('action-log');
    this.#logMain = root.getElementById('log-main');
    this.#logEvidence = root.getElementById('log-evidence');

    // Joystick → controlador
    joystick.on('direction', (dir) => {
      if (!dir) { this.#cmd.release('joystick'); return; }
      const key = { up: 'AVANZAR', down: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA' }[dir];
      if (!this.#cmd.press(key, 'joystick')) joystick.forceNeutral();
    });

    // DETENER: pointerdown (respuesta inmediata) + teclado/click para accesibilidad
    this.#stopBtn.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); this.#stop(); } });
    this.#stopBtn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); this.#stop(); } });
    this.#stopBtn.addEventListener('click', (e) => { if (e.detail === 0) this.#stop(); });   // click sintético (lectores de pantalla)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.#isActive()) this.#stop(); });

    this.#cmd.on('phase', ({ key, state }) => this.#phase(key, state));
    this.#cmd.on('lock', (l) => { this.#lock = l; this.#syncDisabled(); });
    this.#cmd.on('forceRelease', ({ owner }) => { if (owner === 'joystick') this.#joystick.forceNeutral(); });
    this.#cmd.on('action', (a) => this.#log(a));
  }

  /** Al ocultar la vista CONTROL: suelta joystick y botones sostenidos (no envía nada si no había nada). */
  suspend() { this.#joystick.forceNeutral(); this.#cmd.releaseAll(); }

  #stop() { if (!this.#stopBtn.disabled) this.#cmd.stop(); }

  setCatalog(catalog) {
    this.#catalog = catalog;
    this.#joystick.setAvailability(catalog);
    this.#extrasRoot.replaceChildren();
    this.#buttons.clear();
    const n = catalog.extras.length;
    const cols = n <= 6 ? 3 : 4;                      // la cuadrícula se ajusta al número real de botones
    this.#extrasRoot.style.setProperty('--cols', String(cols));
    this.#extrasRoot.style.setProperty('--rows', String(Math.max(1, Math.ceil(n / cols))));
    for (const c of catalog.extras) {
      const b = el('button', { cls: 'cmd-btn', attrs: { type: 'button', 'data-key': c.key, 'data-state': 'idle', title: `${c.label} · ${c.nombre} (código ${c.codigo})`, 'aria-label': c.label },
        children: [icon(c.icon), el('span', { cls: 'lbl-l', text: c.short ?? c.label }), el('span', { cls: 'lbl-s', text: (c.short ?? c.label).split(' ')[0] })] });
      this.#bind(b, c);
      this.#extrasRoot.append(b);
      this.#buttons.set(c.key, b);
    }
    this.#stopBtn.title = catalog.stop ? `DETENER (código ${catalog.stop.codigo})` : 'Falta el comando DETENER en el catálogo';
    this.#syncDisabled();
  }

  #bind(btn, c) {
    const owner = `btn:${c.key}`;
    if (c.mode === 'hold') {
      btn.addEventListener('pointerdown', (e) => { if (btn.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return; e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* sin captura */ } this.#cmd.press(c.key, owner); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(t, () => this.#cmd.release(owner));
      btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !btn.disabled) { e.preventDefault(); this.#cmd.press(c.key, owner); } });
      btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') this.#cmd.release(owner); });
      btn.addEventListener('blur', () => this.#cmd.release(owner));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    } else {
      btn.addEventListener('click', () => { if (!btn.disabled) this.#cmd.pulse(c.key); });
    }
  }

  #phase(key, state) {
    const target = key === 'DETENER' ? this.#stopBtn : this.#buttons.get(key);
    if (!target) return;
    target.dataset.state = state;
    if (key !== 'DETENER') target.setAttribute('aria-pressed', String(state === 'pressed'));
    target.setAttribute('aria-busy', String(state === 'sending'));
  }

  #syncDisabled() {
    const { owner, demo } = this.#lock;
    const ready = this.#cmd.ready;
    for (const [key, b] of this.#buttons) b.disabled = !ready || demo || Boolean(owner && owner !== `btn:${key}`);
    this.#joystick.setEnabled(ready && !demo && (!owner || owner === 'joystick'));
    this.#stopBtn.disabled = !ready || !this.#catalog?.stop;
    this.#stopBtn.setAttribute('aria-disabled', String(this.#stopBtn.disabled));
  }

  #log({ kind, text, steps, detail }) {
    this.#logBox.dataset.kind = kind;
    setText(this.#logMain, text);
    const parts = [];
    if (steps) parts.push(`${steps.requested ? '✔' : '○'} Solicitado → ${steps.accepted ? '✔' : '○'} Aceptado por la API → ${steps.event ? '✔' : '○'} Evento WSS`);
    if (detail) parts.push(detail);
    setText(this.#logEvidence, parts.join(' · '));
  }
}
