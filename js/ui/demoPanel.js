import { el, setText } from '../utils/dom.js';

const KEY_STORAGE = 'controlIot.apiKey';

/** Vista del selector/ejecución de DEMO y de la clave de API (solo memoria, o sessionStorage si se pide). */
export class DemoPanel {
  #demo; #apiKey = '';
  constructor({ demoController, root = document }) {
    this.#demo = demoController;
    this.select = root.getElementById('demo-select');
    this.start = root.getElementById('btn-demo-start');
    this.cancel = root.getElementById('btn-demo-cancel');
    this.status = root.getElementById('demo-status');
    this.progress = root.getElementById('demo-progress');
    this.bar = root.getElementById('demo-bar');
    this.keyInput = root.getElementById('api-key');
    this.remember = root.getElementById('key-remember');
    this.keyBox = root.getElementById('key-box');

    try { const k = sessionStorage.getItem(KEY_STORAGE); if (k) { this.#apiKey = k; this.keyInput.value = k; this.remember.checked = true; } } catch { /* sin storage */ }
    this.keyInput.addEventListener('input', () => { this.#apiKey = this.keyInput.value.trim(); this.#persist(); this.render(this.#demo.state); });
    this.remember.addEventListener('change', () => this.#persist());
    this.select.addEventListener('change', () => this.#demo.select(this.select.value));
    this.start.addEventListener('click', () => this.#guardKey(() => this.#demo.start()));
    this.cancel.addEventListener('click', () => this.#guardKey(() => this.#demo.cancel()));
    this.#demo.on('change', (s) => this.render(s));
  }

  getApiKey() { return this.#apiKey; }
  /** DETENER durante una DEMO: cancela con prioridad (pide la clave si falta). */
  cancelWithKey() { this.#guardKey(() => this.#demo.cancel()); }

  #persist() {
    try { if (this.remember.checked && this.#apiKey) sessionStorage.setItem(KEY_STORAGE, this.#apiKey); else sessionStorage.removeItem(KEY_STORAGE); } catch { /* sin storage */ }
  }
  #guardKey(fn) {
    if (!this.#apiKey) { this.keyBox.open = true; this.keyInput.focus(); setText(this.status, 'Escribe la clave de API para ejecutar o cancelar una DEMO.'); this.status.dataset.kind = 'error'; return; }
    fn();
  }

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
    setText(this.status, s.message);
    this.status.dataset.kind = s.kind;
    const pct = s.total ? Math.round((s.orden / s.total) * 100) : 0;
    this.progress.classList.toggle('d-none', !s.running);
    this.bar.style.width = `${pct}%`;
  }
}
