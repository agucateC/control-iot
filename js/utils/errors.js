/** Error normalizado del cliente REST. `kind`: network | timeout | http | parse | invalid | abort */
export class ApiError extends Error {
  constructor(kind, message, { status = 0, detail = '', body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

/** Mensaje comprensible para la persona usuaria (nunca expone trazas ni datos internos). */
export function friendlyMessage(err) {
  if (!(err instanceof ApiError)) return 'Ocurrió un error inesperado.';
  switch (err.kind) {
    case 'timeout': return 'La API tardó demasiado en responder.';
    case 'network': return 'No se pudo contactar la API (red, CORS o servidor caído).';
    case 'abort': return 'La solicitud fue cancelada.';
    case 'parse': return 'La API respondió con un formato inesperado.';
    case 'invalid': return 'La respuesta de la API no cumple el contrato esperado.';
    default: break;
  }
  const d = err.detail ? ` ${err.detail}` : '';
  switch (err.status) {
    case 400: return `Solicitud inválida.${d}`;
    case 401: return 'Falta la clave de API. Escríbela en la sección DEMO.';
    case 403: return 'La clave de API es incorrecta.';
    case 404: return `No existe el recurso solicitado.${d}`;
    case 409: return `Conflicto: ${err.detail || 'la operación no es válida en este momento.'}`;
    case 422: return 'Los datos enviados no son válidos.';
    case 503: return `Servicio no disponible.${d}`;
    default: return err.status >= 500 ? 'Error interno del servidor.' : `La API rechazó la solicitud (${err.status}).${d}`;
  }
}
