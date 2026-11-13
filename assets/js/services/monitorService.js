import { CONFIG } from '../config.js';
import { isObject, isPosInt, requireFields, str } from '../utils/validators.js';
import { parseServerDate } from '../utils/datetime.js';

const nullable = (check) => (v) => v === null || v === undefined || check(v);
const isStr = (v) => typeof v === 'string';
const isCodeN = (v) => Number.isInteger(v) && v >= 0 && v <= 65535;

/**
 * Lecturas de MONITOREO (solo GET) con el ApiClient compartido. Todo JSON remoto se valida:
 *  - GET /vehiculos/{id}/estado    → { id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion }
 *  - GET /vehiculos/{id}/historial → [{ id_historial, id_vehiculo, comando, codigo, fecha_hora, origen }]  (10 más recientes, DESC)
 */
export class MonitorService {
  #api; #id;
  constructor(api, vehicleId) { this.#api = api; this.#id = vehicleId; }

  async getState({ signal } = {}) {
    const raw = await this.#api.get(CONFIG.ENDPOINTS.estado(this.#id), { signal });
    requireFields(raw, { id_vehiculo: isPosInt, comando: nullable(isStr), codigo: nullable(isCodeN),
      fecha_actualizacion: nullable(isStr) }, 'estado');
    if (raw.id_vehiculo !== this.#id) throw new TypeError('estado: respuesta de otro vehículo');
    const comando = str(raw.comando, 60) || null;
    return {
      idVehiculo: raw.id_vehiculo, vehiculo: str(raw.vehiculo, 80) || null,
      comando, codigo: comando && Number.isInteger(raw.codigo) ? raw.codigo : null,
      fechaRaw: raw.fecha_actualizacion ?? null, fecha: parseServerDate(raw.fecha_actualizacion),
    };
  }

  /** Devuelve ≤10 registros únicos por id_historial, del más nuevo al más antiguo (el id crece con cada insert). */
  async getHistory({ signal } = {}) {
    const raw = await this.#api.get(CONFIG.ENDPOINTS.historial(this.#id), { signal });
    if (!Array.isArray(raw)) throw new TypeError('historial: se esperaba una lista');
    const byId = new Map();
    for (const r of raw) {
      if (!isObject(r) || !isPosInt(r.id_historial) || r.id_vehiculo !== this.#id || !isStr(r.comando) || !r.comando) continue;
      if (byId.has(r.id_historial)) continue;                                   // deduplica por ID real
      byId.set(r.id_historial, {
        id: r.id_historial, comando: str(r.comando, 60), codigo: Number.isInteger(r.codigo) ? r.codigo : null,
        origen: str(r.origen, 30), fechaRaw: r.fecha_hora ?? null, fecha: parseServerDate(r.fecha_hora),
      });
    }
    if (raw.length && !byId.size) throw new TypeError('historial: ningún registro válido');
    return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, CONFIG.HISTORY_LIMIT);
  }
}
