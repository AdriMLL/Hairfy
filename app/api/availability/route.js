import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { availableSlots, isValidDateStr, isBookableDate, localToUtc } from "@/lib/availability";

export const dynamic = "force-dynamic";

// GET /api/availability?date=YYYY-MM-DD&employeeId=...&serviceId=...
// Devuelve los huecos libres de ese empleado para ese servicio y día.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const employeeId = searchParams.get("employeeId");
  const serviceId = searchParams.get("serviceId");

  if (!isValidDateStr(date) || !employeeId || !serviceId) {
    return Response.json({ error: "Parámetros no válidos" }, { status: 400 });
  }
  if (!isBookableDate(date)) {
    return Response.json({ error: "Fecha fuera del rango de reserva" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: service, error: sErr } = await db
    .from("services")
    .select("id,duration_min")
    .eq("id", serviceId)
    .eq("active", true)
    .single();
  if (sErr || !service) {
    return Response.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  // Citas confirmadas del empleado ese día (con margen de un día por zonas horarias)
  const dayStart = localToUtc(date, "00:00").toISOString();
  const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
  const { data: busy, error: bErr } = await db
    .from("appointments")
    .select("starts_at,ends_at")
    .eq("employee_id", employeeId)
    .eq("status", "confirmed")
    .gte("ends_at", dayStart)
    .lte("starts_at", dayEnd);
  if (bErr) {
    return Response.json({ error: "Error al consultar la agenda" }, { status: 500 });
  }

  const slots = availableSlots(date, service.duration_min, busy || []);
  return Response.json({ slots });
}
