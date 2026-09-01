import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSlots, isValidDateStr, isBookableDate, localToUtc } from "@/lib/availability";
import { getBusinessHours, sanitizeHours } from "@/lib/hours";
import { getClosure } from "@/lib/closures";

export const dynamic = "force-dynamic";

// GET /api/availability?date=YYYY-MM-DD&employeeId=...&serviceId=...
// Devuelve TODOS los huecos del día (los ocupados con free=false).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const employeeId = searchParams.get("employeeId");
  const serviceId = searchParams.get("serviceId");
  const excludeId = searchParams.get("excludeId"); // al editar una cita, su propio hueco no cuenta

  if (!isValidDateStr(date) || !employeeId || !serviceId) {
    return Response.json({ error: "Parámetros no válidos" }, { status: 400 });
  }
  if (!isBookableDate(date)) {
    return Response.json({ error: "Fecha fuera del rango de reserva" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const [{ data: service, error: sErr }, { data: employeeRow }] = await Promise.all([
    db.from("services").select("id,duration_min").eq("id", serviceId).eq("active", true).single(),
    db.from("employees").select("id,hours").eq("id", employeeId).eq("active", true).single(),
  ]);
  if (sErr || !service) {
    return Response.json({ error: "Servicio no encontrado" }, { status: 404 });
  }
  if (!employeeRow) {
    return Response.json({ error: "Profesional no encontrado" }, { status: 404 });
  }

  // Festivos / vacaciones: día cerrado = sin huecos
  const closure = await getClosure(db, date, employeeId);
  if (closure) {
    return Response.json({ slots: [], closed: true, reason: closure.reason || null });
  }

  const dayStart = localToUtc(date, "00:00").toISOString();
  const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
  const [{ data: busyRaw, error: bErr }, hours] = await Promise.all([
    db
      .from("appointments")
      .select("id,starts_at,ends_at")
      .eq("employee_id", employeeId)
      .eq("status", "confirmed")
      .gte("ends_at", dayStart)
      .lte("starts_at", dayEnd),
    getBusinessHours(),
  ]);
  if (bErr) {
    return Response.json({ error: "Error al consultar la agenda" }, { status: 500 });
  }
  const busy = (busyRaw || []).filter((b) => b.id !== excludeId);

  // Horario propio del empleado (si lo tiene); si no, el general
  const effectiveHours = sanitizeHours(employeeRow.hours) ?? hours;
  const slots = buildSlots(date, service.duration_min, busy || [], effectiveHours);
  return Response.json({ slots });
}
