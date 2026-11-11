/** Validaciones de JSON remoto: se trata TODO como no confiable. */
export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isPosInt = (v) => Number.isInteger(v) && v > 0;
export const isCode = (v) => Number.isInteger(v) && v >= 0 && v <= 65535;
export const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');

export function requireFields(obj, spec, what) {
  if (!isObject(obj)) throw new TypeError(`${what}: se esperaba un objeto`);
  for (const [key, check] of Object.entries(spec)) {
    if (!check(obj[key])) throw new TypeError(`${what}: campo "${key}" inválido`);
  }
  return obj;
}
