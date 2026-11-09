import { Emitter } from '../utils/emitter.js';

/** Estado observable mínimo: `patch()` fusiona y notifica solo si algo cambió. */
export class Store extends Emitter {
  #state;
  constructor(initial) { super(); this.#state = Object.freeze({ ...initial }); }
  get state() { return this.#state; }
  patch(partial) {
    const next = { ...this.#state, ...partial };
    const changed = Object.keys(partial).some((k) => !Object.is(this.#state[k], partial[k]));
    if (!changed) return;
    this.#state = Object.freeze(next);
    this.emit('change', this.#state);
  }
}
