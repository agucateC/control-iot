import { CONFIG } from '../config.js';
import { toast } from './toast.js';

const G = CONFIG.GESTURES;
const OWNER = 'gesture';
const CAM_ERRORS = {
  NotAllowedError: 'Permiso de cámara denegado. Actívalo en el navegador.',
  NotFoundError: 'No se encontró una cámara.',
  NotReadableError: 'La cámara está en uso por otra aplicación.',
};

/**
 * Control por señas con la mano. La cámara y MediaPipe (reconocedor de gestos) corren en el navegador:
 * el video no sale del equipo. Cada seña estable se traduce a un comando mantenido (como el joystick);
 * al cambiar de seña o perder la mano se suelta y el CommandController envía DETENER.
 */
export class GestureControl {
  #btn; #panel; #video; #label; #closeBtn; #cmd;
  #stream = null; #recognizer = null; #loading = null; #timer = 0; #running = false; #busy = false;
  #current = null; #cand = null; #candN = 0; #lostN = 0; #token = 0;

  constructor({ button, root = document, commandController }) {
    this.#btn = button; this.#cmd = commandController;
    this.#panel = root.getElementById('cam-panel'); this.#video = root.getElementById('cam-video');
    this.#label = root.getElementById('cam-label'); this.#closeBtn = root.getElementById('cam-close');
    this.#btn.addEventListener('click', () => (this.#running ? this.stop() : this.start()));
    this.#closeBtn.addEventListener('click', () => this.stop());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }

  get active() { return this.#running; }
  #state(s) { this.#btn.dataset.state = s; this.#btn.setAttribute('aria-pressed', String(s === 'listening')); }
  #say(t) { this.#label.textContent = t; }

  setBusy(busy) { this.#busy = busy; this.#btn.disabled = busy; if (busy) this.stop(); }

  async start() {
    if (this.#running || this.#busy) return;
    if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador no permite usar la cámara (se requiere HTTPS).', { error: true, ms: 6000 }); return; }
    const token = ++this.#token;
    this.#running = true; this.#state('sending'); this.#panel.classList.remove('d-none'); this.#say('Abriendo cámara…');
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
      if (token !== this.#token) { this.#stream.getTracks().forEach((t) => t.stop()); this.#stream = null; return; }
      this.#video.srcObject = this.#stream; await this.#video.play().catch(() => {});
      this.#say('Cargando reconocimiento…');
      this.#recognizer ??= await (this.#loading ??= this.#loadRecognizer());
      if (token !== this.#token) return;
    } catch (e) {
      if (token !== this.#token) return;
      this.#loading = null;
      toast(CAM_ERRORS[e?.name] ?? (e?.name ? 'No se pudo iniciar la cámara.' : 'No se pudo cargar el reconocimiento de señas (¿sin internet?).'), { error: true, ms: 7000 });
      this.stop(); return;
    }
    this.#state('listening'); this.#say('Muestra la mano ✋');
    toast('Señas: ☝️ avanza · 👎 retrocede · ✌️ izquierda · 👍 derecha · ✋ detiene', { ms: 6000 });
    this.#tick();
  }

  async #loadRecognizer() {
    const { FilesetResolver, GestureRecognizer } = await import(/* @vite-ignore */ G.MEDIAPIPE_MODULE);
    const fileset = await FilesetResolver.forVisionTasks(G.MEDIAPIPE_WASM);
    const make = (delegate) => GestureRecognizer.createFromOptions(fileset, { baseOptions: { modelAssetPath: G.MODEL_URL, delegate }, runningMode: 'VIDEO', numHands: 1 });
    try { return await make('GPU'); } catch { return make('CPU'); }
  }

  #tick() {
    if (!this.#running || !this.#recognizer) return;
    let name = null;
    try {
      if (this.#video.readyState >= 2) {
        const top = this.#recognizer.recognizeForVideo(this.#video, performance.now())?.gestures?.[0]?.[0];
        if (top && top.score >= G.MIN_SCORE && G.MAP[top.categoryName]) name = top.categoryName;
        this.#feed(name);
      }
    } catch { /* un fotograma fallido se ignora */ }
    this.#timer = setTimeout(() => this.#tick(), G.FRAME_MS);
  }

  /** Estabiliza: una seña nueva necesita STABLE_FRAMES seguidos; perderla necesita LOST_FRAMES. */
  #feed(name) {
    if (name === this.#current) { this.#cand = null; this.#candN = 0; this.#lostN = 0; return; }
    if (name === null) {
      this.#cand = null; this.#candN = 0;
      if (++this.#lostN >= G.LOST_FRAMES) this.#apply(null);
      return;
    }
    this.#lostN = 0;
    if (name === this.#cand) this.#candN++; else { this.#cand = name; this.#candN = 1; }
    if (this.#candN >= G.STABLE_FRAMES) { this.#cand = null; this.#candN = 0; this.#apply(name); }
  }

  #apply(name) {
    const prevKey = this.#current ? G.MAP[this.#current] : null;
    const heldMove = prevKey && prevKey !== 'DETENER';
    this.#current = name;
    if (heldMove) this.#cmd.release(OWNER);                    // soltar = DETENER
    if (!name) { this.#say('Muestra la mano ✋'); return; }
    this.#say(G.NAMES[name] ?? name);
    const key = G.MAP[name];
    if (key === 'DETENER') { if (!heldMove) this.#cmd.stop(); return; }
    if (!this.#cmd.press(key, OWNER)) { this.#say('Controles ocupados'); this.#current = null; }
  }

  /** Apaga la cámara y suelta lo sostenido (envía DETENER solo si había un movimiento activo). */
  stop() {
    this.#token++; clearTimeout(this.#timer);
    const wasMoving = this.#current && G.MAP[this.#current] !== 'DETENER';
    this.#current = null; this.#cand = null; this.#candN = 0; this.#lostN = 0;
    if (wasMoving) this.#cmd.release(OWNER);
    this.#stream?.getTracks().forEach((t) => t.stop()); this.#stream = null;
    this.#video.srcObject = null;
    this.#running = false; this.#state('idle'); this.#panel.classList.add('d-none');
  }
}
