import { CONFIG } from '../config.js';
import { friendlyMessage } from '../utils/errors.js';
import { toast } from './toast.js';

const SpeechRecognitionCtor = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;

const ERRORS = {
  'not-allowed': 'Permiso de micrófono denegado. Actívalo en el navegador.',
  'service-not-allowed': 'El navegador no permite el reconocimiento de voz aquí.',
  'no-speech': 'No te escuché. Toca Voz e inténtalo de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
};

/**
 * Comando de voz: el navegador convierte la voz en texto (Web Speech API) y ese texto se envía a la API,
 * donde la IA lo traduce a movimientos que el servidor ejecuta como una DEMO.
 * Estados del botón (data-state): idle, listening, sending, error, disabled.
 */
export class VoiceControl {
  #btn; #service; #rec = null; #state = 'idle'; #busy = false; #heard = false;

  constructor({ button, service }) {
    this.#btn = button; this.#service = service;
    if (!SpeechRecognitionCtor) {
      this.#btn.title = 'Tu navegador no admite reconocimiento de voz (usa Chrome, Edge o Safari).';
      this.#btn.setAttribute('aria-disabled', 'true');
    }
    this.#btn.addEventListener('click', () => this.toggle());
  }

  get supported() { return Boolean(SpeechRecognitionCtor); }

  #set(state) { this.#state = state; this.#btn.dataset.state = state; this.#btn.setAttribute('aria-pressed', String(state === 'listening')); }

  /** Mientras corre una DEMO o una instrucción de IA no se aceptan órdenes nuevas (el servidor respondería 409). */
  setBusy(busy) { this.#busy = busy; this.#btn.disabled = busy; if (busy) this.cancel(); }

  toggle() {
    if (this.#btn.disabled) return;
    if (!SpeechRecognitionCtor) { toast('Tu navegador no admite reconocimiento de voz. Usa Chrome, Edge o Safari.', { error: true, ms: 6000 }); return; }
    if (this.#state === 'listening') { this.#rec?.stop(); return; }
    if (this.#state === 'sending') return;
    this.#listen();
  }

  #listen() {
    const rec = new SpeechRecognitionCtor();
    rec.lang = CONFIG.VOICE_LANG; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    this.#heard = false;
    rec.onresult = (e) => {
      const text = String(e.results?.[e.results.length - 1]?.[0]?.transcript ?? '').trim();
      if (!text) return;
      this.#heard = true;
      this.#send(text);
    };
    rec.onerror = (e) => { this.#heard = true; this.#fail(ERRORS[e.error] ?? `Error de voz (${e.error ?? 'desconocido'}).`, e.error === 'aborted'); };
    rec.onend = () => { if (this.#rec === rec) this.#rec = null; if (this.#state === 'listening') { this.#set('idle'); if (!this.#heard) toast('No te escuché. Toca Voz e inténtalo de nuevo.', { ms: 3000 }); } };
    this.#rec = rec; this.#set('listening');
    toast('Escuchando… habla ahora.', { ms: 2500 });
    try { rec.start(); } catch { this.#rec = null; this.#fail('No se pudo iniciar el micrófono.'); }
  }

  async #send(text) {
    this.#set('sending');
    toast(`Entendí: «${text}»`, { ms: 4000 });
    try {
      const r = await this.#service.sendInstruction(text);
      this.#set('idle');
      toast(`IA: ${r.interpretacion || 'instrucción aceptada'} (${r.total} movimientos${r.duracionMs ? `, ≈${(r.duracionMs / 1000).toFixed(1)} s` : ''})`, { ms: 6000 });
    } catch (e) { this.#fail(friendlyMessage(e)); }
  }

  #fail(msg, silent = false) {
    this.#set(silent ? 'idle' : 'error');
    if (!silent) { toast(msg, { error: true, ms: 6000 }); setTimeout(() => { if (this.#state === 'error') this.#set('idle'); }, 2500); }
  }

  /** Corta la escucha (al salir de CONTROL, al ocultar la pestaña o al iniciar una DEMO). */
  cancel() { try { this.#rec?.abort(); } catch { /* ya terminó */ } this.#rec = null; if (this.#state === 'listening') this.#set('idle'); }
}
