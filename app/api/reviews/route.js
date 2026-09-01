import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCode, normalizePhone } from "@/lib/code";
import { authBlocked, authFail, authOk, tooManyResponse } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/security";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/reviews — un cliente valora una cita ya realizada.
// Se autentica con teléfono + código, igual que "Mis citas".
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }

  const phone = normalizePhone(body?.phone);
  const code = normalizeCode(body?.code);
  const appointmentId = body?.appointmentId;
  const rating = Number.isInteger(body?.rating) ? body.rating : 0;
  const comment =
    typeof body?.comment === "string" ? body.comment.trim().slice(0, 400) : null;

  if (!phone || !code || !appointmentId) {
    return Response.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (rating < 1 || rating > 5) {
    return Response.json({ error: "La puntuación debe ser de 1 a 5" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (await authBlocked(db, request, phone)) return tooManyResponse();
  const { data: client } = await db
    .from("clients")
    .select("id,name,access_code")
    .eq("phone", phone)
    .maybeSingle();
  if (!client || !safeEqual(client.access_code, code)) {
    await authFail(db, request, phone);
    return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
  }
  await authOk(db, request, phone);

  const { data: appt } = await db
    .from("appointments")
    .select("id,client_id,status,ends_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt || appt.client_id !== client.id) {
    return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  }
  if (appt.status !== "confirmed" || new Date(appt.ends_at) > new Date()) {
    return Response.json(
      { error: "Solo puedes valorar citas ya realizadas" },
      { status: 400 }
    );
  }

  const { error } = await db.from("reviews").insert({
    appointment_id: appt.id,
    client_id: client.id,
    rating,
    comment: comment || null,
  });
  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Ya has valorado esta cita" }, { status: 409 });
    }
    return Response.json({ error: "No se pudo guardar la valoración" }, { status: 500 });
  }

  await logActivity("cliente", "resena_enviada", {
    cliente: client.name,
    puntuacion: rating,
  });

  return Response.json({ ok: true });
}
