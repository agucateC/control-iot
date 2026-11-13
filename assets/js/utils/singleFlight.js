/**
 * Una sola ejecución a la vez. Si llegan peticiones mientras corre, se agrupan en UNA repetición
 * al terminar (evita fetch simultáneos sin perder la última petición).
 */
export class SingleFlight {
  #fn; #running = false; #again = false;
  constructor(fn) { this.#fn = fn; }
  get running() { return this.#running; }
  async run() {
    if (this.#running) { this.#again = true; return; }
    this.#running = true;
    try {
      do { this.#again = false; await this.#fn(); } while (this.#again);
    } finally { this.#running = false; }
  }
}
