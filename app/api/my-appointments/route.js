import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCode, normalizePhone } from "@/lib/code";
import { BUSINESS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Área de cliente: consulta y cancelación de citas con teléfono + código.
// La verificación ocurre siempre en el servidor.

async function authClient(body) {
  const phone = normalizePhone(body?.phone);
  const code = normalizeCode(body?.code);
  if (!phone || phone.replace(/\D/g, "").length < 9 || !code) return null;
  const db = supabaseAdmin();
  const { data: client } = await db
    .from("clients")
    .select("id,name,access_code")
    .eq("phone", phone)
    .maybeSingle();
  if (!client || !client.access_code || client.access_code !== code) return null;
  return client;
}

const AUTH_ERROR = { error: "Teléfono o código incorrectos" };

// POST: lista las citas del cliente
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const client = await authClient(body);
  if (!client) return Response.json(AUTH_ERROR, { status: 401 });

  const db = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await db
    .from("appointments")
    .select("id,starts_at,ends_at,status,services(name,price_eur),employees(name)")
    .eq("client_id", client.id)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true });
  if (error) {
    return Response.json({ error: "Error al consultar las citas" }, { status: 500 });
  }

  const limit = Date.now() + BUSINESS.cancelMinHours * 3600000;
  const appointments = (data || []).map((a) => ({
    id: a.id,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    status: a.status,
    service: a.services?.name,
    price: a.services?.price_eur,
    employee: a.employees?.name,
    cancellable:
      a.status === "confirmed" && new Date(a.starts_at).getTime() > limit,
  }));

  return Response.json({ name: client.name, appointments });
}

// PATCH: cancela una cita del cliente (hasta cancelMinHours antes)
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const client = await authClient(body);
  if (!client) return Response.json(AUTH_ERROR, { status: 401 });

  const id = body?.appointmentId;
  if (!id) return Response.json({ error: "Falta la cita" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: appt } = await db
    .from("appointments")
    .select("id,client_id,starts_at,status")
    .eq("id", id)
    .maybeSingle();
  if (!appt || appt.client_id !== client.id) {
    return Response.json({ error: "Cita no encontrada" }, { status: 404 });
  }
  if (appt.status !== "confirmed") {
    return Response.json({ error: "La cita ya está cancelada" }, { status: 400 });
  }
  const limit = Date.now() + BUSINESS.cancelMinHours * 3600000;
  if (new Date(appt.starts_at).getTime() <= limit) {
    return Response.json(
      {
        error: `Faltan menos de ${BUSINESS.cancelMinHours} horas: para cancelar, llama a la peluquería`,
      },
      { status: 400 }
    );
  }

  const { error } = await db
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) {
    return Response.json({ error: "No se pudo cancelar" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
