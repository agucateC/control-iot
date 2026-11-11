import { CONFIG } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { isCode, isObject, isPosInt, requireFields, str } from '../utils/validators.js';

/** Operaciones del contrato real de la API para UN vehículo. Valida cada respuesta. */
export class VehicleService {
  constructor(api, vehicleId) { this.api = api; this.id = vehicleId; }

  async getDetail() {
    const raw = await this.api.get(CONFIG.ENDPOINTS.detalle(this.id));
    try {
      requireFields(raw, { id_vehiculo: isPosInt, nombre: (v) => typeof v === 'string', comandos: Array.isArray }, 'vehículo');
      const comandos = raw.comandos.filter((c) => isObject(c) && isPosInt(c.id_comando) && isCode(c.codigo) && typeof c.nombre === 'string')
        .map((c) => ({ id_comando: c.id_comando, codigo: c.codigo, nombre: str(c.nombre, 60), activo: Boolean(c.activo) }));
      const demos = (Array.isArray(raw.demos) ? raw.demos : [])
        .filter((d) => isObject(d) && isPosInt(d.id_demo) && typeof d.nombre === 'string')
        .map((d) => ({ id_demo: d.id_demo, nombre: str(d.nombre, 80), activo: Boolean(d.activo) }));
      return { id: raw.id_vehiculo, nombre: str(raw.nombre, 80), activo: Boolean(raw.activo), comandos, demos };
    } catch (e) {
      throw new ApiError('invalid', e.message);
    }
  }

  /** POST /vehiculos/{id}/movimientos → 201 con `timestamp` (el mismo del evento WS). */
  async sendMovement(command, { signal } = {}) {
    const body = { id_comando: command.id_comando, origen: 'CONTROL_WEB' };
    const raw = await this.api.post(CONFIG.ENDPOINTS.movimientos(this.id), body,
      { timeoutMs: CONFIG.MOVE_TIMEOUT_MS, signal });
    try {
      requireFields(raw, { id_comando: isPosInt, codigo: isCode, timestamp: (v) => typeof v === 'string' }, 'movimiento');
    } catch (e) { throw new ApiError('invalid', e.message); }
    return { id_comando: raw.id_comando, codigo: raw.codigo, comando: str(raw.comando, 60),
      timestamp: raw.timestamp, clientes: Number(raw.clientes_notificados) || 0 };
  }

  /** POST …/demos/{id_demo}/iniciar (protegido) → 202. */
  async startDemo(idDemo) {
    const raw = await this.api.post(CONFIG.ENDPOINTS.iniciarDemo(this.id, idDemo), undefined, { auth: true });
    return { total: Number(raw?.total_movimientos) || 0 };
  }

  /** POST …/ejecucion-demo/cancelar (protegido). */
  async cancelDemo() {
    await this.api.post(CONFIG.ENDPOINTS.cancelarDemo(this.id), undefined, { auth: true });
  }

  async getDemoExecution() {
    const raw = await this.api.get(CONFIG.ENDPOINTS.ejecucionDemo(this.id));
    if (!isObject(raw) || typeof raw.en_ejecucion !== 'boolean') throw new ApiError('invalid', 'ejecucion-demo inválido');
    return { running: raw.en_ejecucion, idDemo: isPosInt(raw.id_demo) ? raw.id_demo : null,
      total: Number(raw.total_movimientos) || 0 };
  }
}
