/** Emisor de eventos mínimo (sin dependencias). */
export class Emitter {
  #handlers = new Map();
  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.#handlers.get(type)?.delete(fn);
  }
  emit(type, payload) {
    for (const fn of [...(this.#handlers.get(type) ?? [])]) {
      try { fn(payload); } catch (e) { console.error(`Error en manejador "${type}"`, e); }
    }
  }
}
