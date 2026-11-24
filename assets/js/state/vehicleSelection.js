import { CONFIG } from '../config.js';

const KEY = 'iot.vehiculo';

/** Vehículo activo de la sesión (sessionStorage solo recuerda la elección tras recargar; la API autoriza cada uso). */
export function selectedVehicleId() {
  if (!CONFIG.AUTH_ENABLED) return CONFIG.VEHICLE_ID;
  try { const n = Number(sessionStorage.getItem(KEY)); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; }
}

export function selectVehicle(id) {
  try { sessionStorage.setItem(KEY, String(id)); } catch { /* opcional */ }
}
