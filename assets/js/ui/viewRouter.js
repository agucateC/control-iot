import { Emitter } from '../utils/emitter.js';

/**
 * Navegación entre vistas con hash (#/control, #/monitoreo): funciona en GitHub Pages sin servidor.
 * Un solo listener de hashchange; las vistas no se destruyen, solo se ocultan (sin listeners duplicados).
 * Emite 'change' → { from, to }.
 */
export class ViewRouter extends Emitter {
  #views; #fallback; #current = null; #skip;

  /** @param {Record<string,{el:HTMLElement, link:HTMLElement, title:string}>} views */
  constructor({ views, fallback = 'control', skipLink = null }) {
    super();
    this.#views = views; this.#fallback = fallback; this.#skip = skipLink;
  }

  get current() { return this.#current; }

  start() {
    globalThis.addEventListener('hashchange', () => this.#sync(true));
    this.#sync(false);
  }

  #fromHash() {
    const name = globalThis.location.hash.replace(/^#\/?/, '').toLowerCase();
    return name in this.#views ? name : null;
  }

  #sync(focus) {
    let to = this.#fromHash();
    if (!to) {                                    // hash vacío o desconocido → vista por defecto
      to = this.#fallback;
      globalThis.history.replaceState(null, '', `#/${to}`);
    }
    if (to === this.#current) return;
    const from = this.#current;
    this.#current = to;
    for (const [name, v] of Object.entries(this.#views)) {
      const on = name === to;
      v.el.hidden = !on;
      if (on) v.link.setAttribute('aria-current', 'page'); else v.link.removeAttribute('aria-current');
    }
    document.documentElement.dataset.view = to;          // el CSS oculta el registro de acciones fuera de CONTROL
    if (this.#skip) this.#skip.setAttribute('href', `#${this.#views[to].el.id}`);
    document.title = this.#views[to].title();
    if (focus) this.#views[to].el.focus({ preventScroll: true });    // lectores de pantalla: anuncia la vista nueva
    this.emit('change', { from, to });
  }
}
