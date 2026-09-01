import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendReminder, emailEnabled } from "@/lib/email";
import { safeEqual } from "@/lib/security";
import { logActivity } from "@/lib/audit";

// Retención de datos (RGPD): el registro de actividad se conserva 12 meses
const ACTIVITY_RETENTION_DAYS = 365;

// Limpieza diaria: actividad antigua y contadores de límite caducados
async function purgeOldData(db) {
  try {
    const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 86400000).toISOString();
    await db.from("activity_log").delete().lt("created_at", cutoff);
    await db.from("rate_limits").delete().lt("until", new Date().toISOString());
  } catch {
    /* best effort: nunca rompe el cron */
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron diario (vercel.json): envía el recordatorio de las citas de las
// próximas ~26 horas a los clientes con email, una sola vez por cita.
export async function GET(request) {
  // Solo Vercel Cron (o quien conozca CRON_SECRET) puede lanzarlo
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    if (!safeEqual(auth, `Bearer ${secret}`)) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const db = supabaseAdmin();

  // Limpieza de datos con cada pasada diaria
  await purgeOldData(db);

  if (!emailEnabled()) {
    return Response.json({ ok: true, sent: 0, note: "email no configurado" });
  }
  const now = new Date();
  const horizon = new Date(now.getTime() + 26 * 3600000);

  const { data: appts, error } = await db
    .from("appointments")
    .select("id,starts_at,clients(name,email),services(name),employees(name)")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon.toISOString())
    .limit(100);
  if (error) {
    return Response.json({ error: "Error al buscar citas" }, { status: 500 });
  }

  let sent = 0;
  for (const a of appts || []) {
    const email = a.clients?.email;
    // Marcamos siempre como procesada para no reintentar cada día
    await db
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", a.id);
    if (!email) continue;
    const ok = await sendReminder(email, {
      name: a.clients?.name || "cliente",
      service: a.services?.name || "tu servicio",
      employee: a.employees?.name || "nuestro equipo",
      startsAt: a.starts_at,
    });
    if (ok) {
      sent += 1;
      await logActivity("sistema", "recordatorio_enviado", {
        cliente: a.clients?.name,
        fecha: a.starts_at,
      });
    }
  }

  return Response.json({ ok: true, revisadas: (appts || []).length, sent });
}
