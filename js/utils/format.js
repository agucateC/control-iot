export function hora(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('es-MX', { hour12: false });
}
