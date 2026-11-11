import { el, setText } from '../utils/dom.js';

/** Vista del selector y la ejecución de DEMO (la clave de API la agrega ApiClient desde CONFIG). */
export class DemoPanel {
  #demo;
  constructor({ demoController, root = document }) {
    this.#demo = demoController;
    this.select = root.getElementById('demo-select');
    this.start = root.getElementById('btn-demo-start');
    this.cancel = root.getElementById('btn-demo-cancel');
    this.status = root.getElementById('demo-status');
    this.progress = root.getElementById('demo-progress');
    this.bar = root.getElementById('demo-bar');

    this.select.addEventListener('change', () => this.#demo.select(this.select.value));
    this.start.addEventListener('click', () => { if (!this.start.disabled) this.#demo.start(); });
    this.cancel.addEventListener('click', () => { if (!this.cancel.disabled) this.#demo.cancel(); });
    this.#demo.on('change', (s) => this.render(s));
  }

  /** DETENER durante una DEMO: cancela con prioridad. */
  cancelDemo() { this.#demo.cancel(); }

  render(s) {
    const prev = this.select.value;
    if (this.select.dataset.sig !== JSON.stringify(s.demos)) {
      this.select.dataset.sig = JSON.stringify(s.demos);
      this.select.replaceChildren(...(s.demos.length
        ? s.demos.map((d) => el('option', { attrs: { value: String(d.id_demo) }, text: d.nombre }))
        : [el('option', { attrs: { value: '' }, text: 'No hay DEMO disponibles' })]));
    }
    if (s.selected) this.select.value = String(s.selected); else if (prev) this.select.value = prev;
    const busy = s.running || s.starting;
    this.select.disabled = busy || !s.demos.length;
    this.start.disabled = busy || !s.selected;
    this.cancel.disabled = !s.running || s.cancelling;
    this.start.dataset.state = s.starting ? 'sending' : 'idle';
    setText(this.status, s.message);
    this.status.dataset.kind = s.kind;
    const pct = s.total ? Math.round((s.orden / s.total) * 100) : 0;
    this.progress.classList.toggle('d-none', !s.running);
    this.bar.style.width = `${pct}%`;
  }
}
