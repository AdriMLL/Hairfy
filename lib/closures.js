import "server-only";
import { localToUtc } from "./availability";

// Cierres del negocio: festivos, vacaciones y ratos sueltos.
// - Un cierre puede ser de todo el local (employee_id null) o de un empleado.
// - Si starts_time/ends_time son null, cierra el día entero.
//   Si tienen valor, solo bloquea ese tramo horario de cada día del rango.

// Devuelve TODOS los cierres que afectan a esa fecha+empleado.
export async function getClosures(db, dateStr, employeeId) {
  try {
    const { data } = await db
      .from("closures")
      .select("id,starts_on,ends_on,reason,employee_id,starts_time,ends_time")
      .lte("starts_on", dateStr)
      .gte("ends_on", dateStr);
    if (!data || data.length === 0) return [];
    return data.filter((c) => !c.employee_id || (employeeId && c.employee_id === employeeId));
  } catch {
    // Si la tabla aún no existe o falla la consulta, no bloqueamos reservas
    return [];
  }
}

// Cierre de DÍA COMPLETO que afecta a esa fecha (o null si el día está abierto)
export async function getClosure(db, dateStr, employeeId) {
  const list = await getClosures(db, dateStr, employeeId);
  return list.find((c) => !c.starts_time || !c.ends_time) || null;
}

// Tramos bloqueados ese día: [{ open: "HH:MM", close: "HH:MM", reason }]
export async function getClosedRanges(db, dateStr, employeeId) {
  const list = await getClosures(db, dateStr, employeeId);
  return list
    .filter((c) => c.starts_time && c.ends_time)
    .map((c) => ({
      open: String(c.starts_time).slice(0, 5),
      close: String(c.ends_time).slice(0, 5),
      reason: c.reason || null,
    }));
}

// Los tramos cerrados se tratan como "horas ocupadas": así el cálculo de
// huecos existente los descarta sin lógica adicional.
export async function closedRangesAsBusy(db, dateStr, employeeId) {
  const ranges = await getClosedRanges(db, dateStr, employeeId);
  return ranges.map((r) => ({
    starts_at: localToUtc(dateStr, r.open).toISOString(),
    ends_at: localToUtc(dateStr, r.close).toISOString(),
  }));
}

export function closureMessage(closure) {
  const motivo = closure?.reason ? ` (${closure.reason})` : "";
  return `Ese día estamos cerrados${motivo}. Elige otra fecha.`;
}

export function closedRangeMessage(range) {
  const motivo = range?.reason ? ` (${range.reason})` : "";
  return `A esa hora estamos cerrados${motivo}. Elige otro hueco.`;
}
