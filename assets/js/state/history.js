import { CONFIG } from '../config.js';

/** Copia local SOLO DE LECTURA de lo que devolvió GET /historial (la fuente de verdad es RDS). */
export class HistoryStore {
  #items = [];
  get items() { return this.#items; }
  get topId() { return this.#items[0]?.id ?? null; }

  /** Sustituye la copia (ya ordenada y deduplicada por el servicio). Devuelve los ids nuevos y si cambió algo. */
  replace(list) {
    const next = list.slice(0, CONFIG.HISTORY_LIMIT);        // la fila 11 solo se deja de MOSTRAR; nunca se borra nada en RDS
    const known = new Set(this.#items.map((i) => i.id));
    const added = next.filter((i) => !known.has(i.id)).map((i) => i.id);
    const same = next.length === this.#items.length && next.every((n, i) => n.id === this.#items[i].id);
    this.#items = next;
    return { changed: !same, added };
  }
}
