import { isCode } from '../utils/validators.js';

/** Normaliza nombres: "Giro 90° Izq." → "GIRO_90_IZQ" */
export const normalize = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Operaciones que la interfaz sabe presentar. `mode`:
 *  - hold:  se mantiene mientras se presiona; al soltar se solicita DETENER.
 *  - pulse: acción puntual (giros de 90°/360°, sonido): una sola solicitud.
 * Los alias permiten reconocer el nombre real del catálogo del vehículo; NO inventan comandos:
 * solo aparece lo que existe y está activo en la API.
 */
const KNOWN = {
  AVANZAR: { label: 'Avanzar', short: 'Avanzar', icon: 'up', mode: 'hold', alias: ['AVANZAR', 'ADELANTE', 'FRENTE'] },
  RETROCEDER: { label: 'Retroceder', short: 'Retroceder', icon: 'down', mode: 'hold', alias: ['RETROCEDER', 'ATRAS', 'REVERSA'] },
  GIRAR_IZQUIERDA: { label: 'Girar izq.', short: 'Izq.', icon: 'left', mode: 'hold', alias: ['GIRAR_IZQUIERDA', 'GIRO_IZQUIERDA', 'GIRAR_A_LA_IZQUIERDA', 'IZQUIERDA', 'GIRAR_IZQ', 'IZQ'] },
  GIRAR_DERECHA: { label: 'Girar der.', short: 'Der.', icon: 'right', mode: 'hold', alias: ['GIRAR_DERECHA', 'GIRO_DERECHA', 'GIRAR_A_LA_DERECHA', 'DERECHA', 'GIRAR_DER', 'DER'] },
  GIRO_90_IZQ: { label: '90° izq.', short: '90° izq', icon: 'rot-l', mode: 'pulse', alias: ['GIRO_90_IZQ', 'GIRO_90_IZQUIERDA', 'GIRAR_90_IZQUIERDA', 'GIRO_90_GRADOS_IZQUIERDA', 'GIRO_90_L'] },
  GIRO_90_DER: { label: '90° der.', short: '90° der', icon: 'rot-r', mode: 'pulse', alias: ['GIRO_90_DER', 'GIRO_90_DERECHA', 'GIRAR_90_DERECHA', 'GIRO_90_GRADOS_DERECHA', 'GIRO_90_R'] },
  GIRO_360: { label: '360°', short: '360°', icon: '360', mode: 'pulse', alias: ['GIRO_360', 'GIRAR_360', 'GIRO_360_GRADOS', 'VUELTA_COMPLETA'] },
  SUBIR_BRAZO: { label: 'Subir brazo', short: 'Subir', icon: 'arm-up', mode: 'hold', alias: ['SUBIR_BRAZO', 'LEVANTAR_BRAZO', 'ELEVAR_BRAZO', 'BRAZO_ARRIBA', 'SUBIR_GARRA', 'LEVANTAR_GARRA', 'LEVANTAR_GRUA', 'LEVANTAR', 'SUBIR'] },
  BAJAR_BRAZO: { label: 'Bajar brazo', short: 'Bajar', icon: 'arm-down', mode: 'hold', alias: ['BAJAR_BRAZO', 'DESCENDER_BRAZO', 'BRAZO_ABAJO', 'BAJAR_GARRA', 'BAJAR_GRUA', 'BAJAR'] },
  SONIDO: { label: 'Sonido', short: 'Sonido', icon: 'sound', mode: 'pulse', alias: ['SONIDO', 'ACTIVAR_SONIDO', 'CLAXON', 'BOCINA', 'PITO'] },
  DETENER: { label: 'Detener', short: 'Detener', icon: 'stop', mode: 'stop', alias: ['DETENER', 'PARAR', 'PARO', 'STOP', 'ALTO'] },
};

export const JOYSTICK_KEYS = Object.freeze({
  up: 'AVANZAR', down: 'RETROCEDER', left: 'GIRAR_IZQUIERDA', right: 'GIRAR_DERECHA',
});

export class CommandCatalog {
  /** @type {Map<string, {key:string,label:string,icon:string,mode:string,id_comando:number,codigo:number,nombre:string}>} */
  #byKey = new Map();
  #extras = [];

  constructor(comandos = []) {
    const activos = comandos.filter((c) => c.activo && isCode(c.codigo));
    const claimed = new Set();
    for (const [key, def] of Object.entries(KNOWN)) {
      for (const a of def.alias) {
        const c = activos.find((x) => normalize(x.nombre) === a && !claimed.has(x.id_comando));
        if (c) { this.#byKey.set(key, { key, ...def, id_comando: c.id_comando, codigo: c.codigo, nombre: c.nombre }); claimed.add(c.id_comando); break; }
      }
    }
    // Comandos activos del vehículo que la interfaz no reconoce: botón genérico (acción puntual).
    for (const c of activos) {
      if (claimed.has(c.id_comando)) continue;
      const key = `CMD_${c.id_comando}`;
      this.#byKey.set(key, { key, label: c.nombre, short: c.nombre.slice(0, 8), icon: 'bolt', mode: 'pulse', id_comando: c.id_comando, codigo: c.codigo, nombre: c.nombre });
    }
    const joy = new Set(Object.values(JOYSTICK_KEYS));
    this.#extras = [...this.#byKey.values()].filter((c) => c.mode !== 'stop' && !joy.has(c.key));
  }

  get(key) { return this.#byKey.get(key) ?? null; }
  has(key) { return this.#byKey.has(key); }
  get stop() { return this.get('DETENER'); }
  /** Botones secundarios: solo lo que existe en el catálogo del vehículo. */
  get extras() { return this.#extras; }
  get size() { return this.#byKey.size; }
  joystickAvailable(dir) { return this.has(JOYSTICK_KEYS[dir]); }
}
