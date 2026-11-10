/**
 * Configuración PÚBLICA de la aplicación. No pongas aquí contraseñas, claves de API,
 * claves de AWS ni datos de RDS: este archivo se publica tal cual en GitHub Pages.
 */
const params = new URLSearchParams(globalThis.location?.search ?? '');

/** Permite probar otro servidor con ?api=https://... solo si es HTTPS (o localhost). */
function resolveApiBase(defaultUrl) {
  const candidate = params.get('api');
  if (!candidate) return defaultUrl;
  try {
    const u = new URL(candidate);
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.origin;
  } catch { /* se ignora y se usa el valor por defecto */ }
  return defaultUrl;
}

function resolveVehicleId(defaultId) {
  const n = Number(params.get('vehiculo'));
  return Number.isInteger(n) && n > 0 ? n : defaultId;
}

const API_BASE_URL = resolveApiBase('https://drift-king.duckdns.org');

export const CONFIG = Object.freeze({
  /** Datos del alumno para el pie de página. */
  STUDENT_NAME: 'Nombre Apellido Apellido',
  YEAR: 2026,

  API_BASE_URL,
  /** WSS derivado de la misma base: https→wss (nunca ws:// desde una página HTTPS). */
  WS_BASE_URL: API_BASE_URL.replace(/^http/i, 'ws'),
  VEHICLE_ID: resolveVehicleId(2),

  /** Endpoints REALES del contrato de la API (ver docs/CONTRATO_API.md). */
  ENDPOINTS: Object.freeze({
    detalle: (id) => `/vehiculos/${id}`,
    movimientos: (id) => `/vehiculos/${id}/movimientos`,
    iniciarDemo: (id, demo) => `/vehiculos/${id}/demos/${demo}/iniciar`,
    cancelarDemo: (id) => `/vehiculos/${id}/ejecucion-demo/cancelar`,
    ejecucionDemo: (id) => `/vehiculos/${id}/ejecucion-demo`,
    salud: '/salud',
    saludRds: '/salud/rds',
    ws: (id) => `/ws/vehiculos/${id}`,
  }),

  REQUEST_TIMEOUT_MS: 8000,
  MOVE_TIMEOUT_MS: 5000,
  HEALTH_INTERVAL_MS: 15000,
  HEALTH_TIMEOUT_MS: 5000,
  WS_PING_MS: 20000,
  WS_PONG_TIMEOUT_MS: 8000,
  WS_BACKOFF_MS: [1000, 2000, 4000, 8000, 15000],
  /** Espera máxima del evento WS que corresponde a un POST aceptado. */
  EVENT_WAIT_MS: 3000,
  /**
   * 0 = no reenviar el comando mientras se mantiene presionado (evita POST repetitivos e historial duplicado).
   * Si tu firmware corta el movimiento a los N ms, pon un valor menor (p. ej. 3500) para renovarlo.
   */
  RENOVAR_MOVIMIENTO_MS: 0,
});
