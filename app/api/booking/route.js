import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { availableSlots, isValidDateStr, isBookableDate, localToUtc } from "@/lib/availability";

export const dynamic = "force-dynamic";

// POST /api/booking
// Crea una cita. Toda la validación ocurre aquí, en el servidor:
// nunca nos fiamos de lo que envía el navegador.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }

  const { serviceId, employeeId, date, startsAt } = body || {};
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/[^\d+ ]/g, "").trim().slice(0, 20) : "";

  if (!serviceId || !employeeId || !isValidDateStr(date) || !startsAt) {
    return Response.json({ error: "Faltan datos de la reserva" }, { status: 400 });
  }
  if (name.length < 2) {
    return Response.json({ error: "Escribe tu nombre" }, { status: 400 });
  }
  if (phone.replace(/\D/g, "").length < 9) {
    return Response.json({ error: "Escribe un teléfono válido" }, { status: 400 });
  }
  if (!isBookableDate(date)) {
    return Response.json({ error: "Fecha fuera del rango de reserva" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const [{ data: service }, { data: employee }] = await Promise.all([
    db.from("services").select("id,duration_min").eq("id", serviceId).eq("active", true).single(),
    db.from("employees").select("id").eq("id", employeeId).eq("active", true).single(),
  ]);
  if (!service || !employee) {
    return Response.json({ error: "Servicio o empleado no válido" }, { status: 400 });
  }

  // Recalculamos la disponibilidad en el servidor y comprobamos que el hueco
  // pedido es realmente uno de los huecos libres.
  const dayStart = localToUtc(date, "00:00").toISOString();
  const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
  const { data: busy } = await db
    .from("appointments")
    .select("starts_at,ends_at")
    .eq("employee_id", employeeId)
    .eq("status", "confirmed")
    .gte("ends_at", dayStart)
    .lte("starts_at", dayEnd);

  const slots = availableSlots(date, service.duration_min, busy || []);
  const slot = slots.find((s) => s.startsAt === startsAt);
  if (!slot) {
    return Response.json(
      { error: "Ese hueco ya no está disponible. Elige otra hora." },
      { status: 409 }
    );
  }

  // Cliente: buscar por teléfono o crearlo
  let clientId;
  const { data: existing } = await db.from("clients").select("id").eq("phone", phone).maybeSingle();
  if (existing) {
    clientId = existing.id;
    await db.from("clients").update({ name }).eq("id", clientId);
  } else {
    const { data: created, error: cErr } = await db
      .from("clients")
      .insert({ name, phone })
      .select("id")
      .single();
    if (cErr) {
      return Response.json({ error: "No se pudo guardar el cliente" }, { status: 500 });
    }
    clientId = created.id;
  }

  const { data: appt, error: aErr } = await db
    .from("appointments")
    .insert({
      employee_id: employeeId,
      service_id: serviceId,
      client_id: clientId,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
    })
    .select("id,starts_at")
    .single();

  if (aErr) {
    // 23P01 = violación de la restricción anti-solapes (alguien reservó antes)
    if (aErr.code === "23P01") {
      return Response.json(
        { error: "Ese hueco se acaba de ocupar. Elige otra hora." },
        { status: 409 }
      );
    }
    return Response.json({ error: "No se pudo crear la cita" }, { status: 500 });
  }

  return Response.json({ ok: true, appointmentId: appt.id, startsAt: appt.starts_at });
}
