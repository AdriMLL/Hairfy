import "server-only";

// Cierres del negocio (festivos, vacaciones): un cierre puede ser de todo el
// local (employee_id null) o solo de un empleado. Devuelve el cierre que
// afecta a esa fecha+empleado, o null si está abierto.
export async function getClosure(db, dateStr, employeeId) {
  try {
    const { data } = await db
      .from("closures")
      .select("id,starts_on,ends_on,reason,employee_id")
      .lte("starts_on", dateStr)
      .gte("ends_on", dateStr);
    if (!data || data.length === 0) return null;
    return (
      data.find((c) => !c.employee_id) ||
      (employeeId ? data.find((c) => c.employee_id === employeeId) : null) ||
      null
    );
  } catch {
    // Si la tabla aún no existe o falla la consulta, no bloqueamos reservas
    return null;
  }
}

export function closureMessage(closure) {
  const motivo = closure?.reason ? ` (${closure.reason})` : "";
  return `Ese día estamos cerrados${motivo}. Elige otra fecha.`;
}
