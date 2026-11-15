import { el, icon, setText } from '../utils/dom.js';
import { humanize } from '../domain/catalog.js';
import { toast } from './toast.js';

/**
 * Vista + eventos de los botones del catálogo, joystick y DETENER.
 * Solo traduce gestos a llamadas del CommandController (la lógica común vive allí).
 * Estados de botón: normal, pressed, sending, accepted, error, disabled.
 */
export class ControlPanel {
  #cmd; #joystick; #lever; #extrasRoot; #stopBtn; #buttons = new Map(); #catalog = null; #lock = { owner: null, demo: false };
  #logBox; #logMain; #isActive; #nowTimer = 0;

  constructor({ commandController, joystick, lever, root = document, isActive = () => true }) {
    this.#cmd = commandController; this.#joystick = joystick; this.#lever = lever; this.#isActive = isActive;
    this.#extrasRoot = root.getElementById('extras');
    this.#stopBtn = root.getElementById('btn-stop');
    this.#logBox = root.getElementById('action-log');
    this.#logMain = root.getElementById('log-main');

    // Joystick → controlador
    joystick.on('direction', (dir) => {
      if (!dir) { this.#cmd.release('joystick'); return; }
      const key = { up: 'AVANZAR', down: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA' }[dir];
      if (!this.#cmd.press(key, 'joystick')) joystick.forceNeutral();
    });

    // Palanca de la garra (solo vertical) → controlador. Misma regla que el joystick: al soltar, DETENER.
    lever.on('direction', (dir) => {
      if (!dir) { this.#cmd.release('lever'); return; }
      const key = { up: 'SUBIR_BRAZO', down: 'BAJAR_BRAZO' }[dir];
      if (!this.#cmd.press(key, 'lever')) lever.forceNeutral();
    });

    // DETENER: pointerdown (respuesta inmediata) + teclado/click para accesibilidad
    this.#stopBtn.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); this.#stop(); } });
    this.#stopBtn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); this.#stop(); } });
    this.#stopBtn.addEventListener('click', (e) => { if (e.detail === 0) this.#stop(); });   // click sintético (lectores de pantalla)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.#isActive()) this.#stop(); });

    this.#cmd.on('phase', ({ key, state }) => this.#phase(key, state));
    this.#cmd.on('lock', (l) => { this.#demoNow(l.demo); this.#lock = l; this.#syncDisabled(); });
    this.#cmd.on('forceRelease', ({ owner }) => { if (owner === 'joystick') this.#joystick.forceNeutral(); if (owner === 'lever') this.#lever.forceNeutral(); });
    this.#cmd.on('action', (a) => this.#log(a));
  }

  /** Al ocultar la vista CONTROL: suelta joystick y botones sostenidos (no envía nada si no había nada). */
  suspend() { this.#joystick.forceNeutral(); this.#lever.forceNeutral(); this.#cmd.releaseAll(); }

  #stop() { if (!this.#stopBtn.disabled) this.#cmd.stop(); }

  setCatalog(catalog) {
    this.#catalog = catalog;
    this.#joystick.setAvailability(catalog);
    this.#lever.setAvailability(catalog);
    for (const b of this.#extrasRoot.querySelectorAll('[data-key]')) b.remove();      // los botones de IA (voz/señas) se conservan
    this.#buttons.clear();
    const built = [];
    const n = catalog.extras.length + this.#extrasRoot.querySelectorAll('.ai-btn').length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4;      // la cuadrícula se ajusta al número real de botones
    this.#extrasRoot.closest('.gamepad')?.style.setProperty('--cols', String(cols));   // también reparte el ancho con la palanca
    this.#extrasRoot.style.setProperty('--rows', String(Math.max(1, Math.ceil(n / cols))));
    for (const c of catalog.extras) {
      const b = el('button', { cls: 'cmd-btn', attrs: { type: 'button', 'data-key': c.key, 'data-state': 'idle', ...(c.key === 'SONIDO' ? { 'data-on': 'false', 'aria-pressed': 'false' } : {}), title: `${c.label} · ${c.nombre} (código ${c.codigo})`, 'aria-label': c.label },
        children: [icon(c.icon), el('span', { cls: 'lbl-l', text: c.short ?? c.label }), el('span', { cls: 'lbl-s', text: (c.short ?? c.label).split(' ')[0] })] });
      this.#bind(b, c);
      built.push(b);
      this.#buttons.set(c.key, b);
    }
    this.#extrasRoot.prepend(...built);
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
    } else if (c.key === 'SONIDO') {
      btn.addEventListener('click', () => {      // interruptor: 1.er toque activa el sonido, el 2.º lo detiene
        if (btn.disabled) return;
        if (this.#soundOn) { this.#setSound(false); this.#cmd.stop(); } else { this.#setSound(true); this.#cmd.pulse(c.key); }
      });
    } else {
      btn.addEventListener('click', () => { if (!btn.disabled) this.#cmd.pulse(c.key); });
    }
  }

  #soundOn = false;
  #setSound(on) {
    this.#soundOn = on;
    const b = this.#buttons.get('SONIDO');
    if (b) { b.dataset.on = String(on); b.setAttribute('aria-pressed', String(on)); }
  }

  #phase(key, state) {
    if (key === 'SONIDO' && state === 'error') this.#setSound(false);
    this.#lever.setPhase(key, state);
    const target = key === 'DETENER' ? this.#stopBtn : this.#buttons.get(key);
    if (!target) return;
    target.dataset.state = state;
    if (key !== 'DETENER' && key !== 'SONIDO') target.setAttribute('aria-pressed', String(state === 'pressed'));
    target.setAttribute('aria-busy', String(state === 'sending'));
  }

  #syncDisabled() {
    const { owner, demo } = this.#lock;
    const ready = this.#cmd.ready;
    for (const [key, b] of this.#buttons) b.disabled = !ready || demo || Boolean(owner && owner !== `btn:${key}`);
    this.#joystick.setEnabled(ready && !demo && (!owner || owner === 'joystick'));
    if (demo || !ready) this.#setSound(false);
    this.#lever.setEnabled(ready && !demo && (!owner || owner === 'lever'));
    this.#stopBtn.disabled = !ready || !this.#catalog?.stop;
    this.#stopBtn.setAttribute('aria-disabled', String(this.#stopBtn.disabled));
  }

  /** Durante una DEMO el vehículo lo mueve el servidor: el cuadro lo dice; al terminar vuelve a «Detenido». */
  #demoNow(running) {
    if (running === this.#lock.demo) return;
    clearTimeout(this.#nowTimer);
    this.#logBox.dataset.kind = running ? 'moving' : 'idle';
    setText(this.#logMain, running ? 'DEMO en ejecución' : 'Detenido');
  }

  /** CONTROL solo dice qué movimiento se está haciendo. Los errores salen como aviso; la evidencia técnica vive en MONITOREO. */
  #log({ kind, text, detail, movement }) {
    if (kind === 'error') { toast(`${text}${detail ? ` ${detail}` : ''}`.trim(), { error: true, ms: 4500 }); return; }
    if (!movement) return;
    if (movement.stop) this.#setSound(false);        // DETENER (desde donde sea) apaga el sonido
    clearTimeout(this.#nowTimer);
    const label = movement.stop ? 'Detenido' : (this.#catalog?.get(movement.key)?.say ?? humanize(movement.key));
    this.#logBox.dataset.kind = movement.stop ? 'idle' : 'moving';
    setText(this.#logMain, label);
    if (movement.mode === 'pulse' && movement.key !== 'SONIDO') this.#nowTimer = setTimeout(() => { this.#logBox.dataset.kind = 'idle'; setText(this.#logMain, 'Listo'); }, 1800);   // acción puntual: termina sola
  }
}
