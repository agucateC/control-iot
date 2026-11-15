import { toast } from './toast.js';

/** Botón de pantalla completa (Fullscreen API). En el teléfono intenta además fijar la orientación horizontal. */
export class FullscreenControl {
  #btn; #root = document.documentElement;
  constructor(button) {
    this.#btn = button;
    const supported = Boolean(this.#root.requestFullscreen ?? this.#root.webkitRequestFullscreen);
    if (!supported || globalThis.matchMedia?.('(display-mode: fullscreen)').matches) return;     // iPhone/Safari: se usa «Añadir a pantalla de inicio»
    this.#btn.hidden = false;
    this.#btn.addEventListener('click', () => this.toggle());
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => this.#sync());
  }

  get active() { return Boolean(document.fullscreenElement ?? document.webkitFullscreenElement); }

  async toggle() {
    try {
      if (this.active) { await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document); screen.orientation?.unlock?.(); }
      else {
        await (this.#root.requestFullscreen ?? this.#root.webkitRequestFullscreen).call(this.#root, { navigationUI: 'hide' });
        try { await screen.orientation?.lock?.('landscape'); } catch { /* no todos los navegadores lo permiten */ }
      }
    } catch { toast('Este navegador no permitió la pantalla completa.', { error: true, ms: 4000 }); }
  }

  #sync() {
    const on = this.active;
    this.#btn.setAttribute('aria-pressed', String(on));
    this.#btn.title = this.#btn.ariaLabel = on ? 'Salir de pantalla completa' : 'Pantalla completa';
    this.#btn.querySelector('use')?.setAttribute('href', on ? '#i-compress' : '#i-expand');
  }
}
