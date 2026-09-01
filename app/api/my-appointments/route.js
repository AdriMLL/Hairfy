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
  const ordersPromise = db
    .from("orders")
    .select("id,status,created_at,order_items(quantity,price_eur,products(name))")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data, error } = await db
    .from("appointments")
    .select(
      "id,starts_at,ends_at,status,services(name,price_eur),employees(name),appointment_products(quantity,products(name,price_eur)),reviews(id,rating)"
    )
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
    products: (a.appointment_products || []).map((p) => ({
      name: p.products?.name,
      quantity: p.quantity,
      price: p.products?.price_eur,
    })),
    cancellable:
      a.status === "confirmed" && new Date(a.starts_at).getTime() > limit,
    reviewed: (a.reviews?.length ?? 0) > 0,
    myRating: a.reviews?.[0]?.rating ?? null,
    reviewable:
      a.status === "confirmed" &&
      new Date(a.ends_at) < new Date() &&
      (a.reviews?.length ?? 0) === 0,
  }));

  const { data: ordersData } = await ordersPromise;
  const orders = (ordersData || []).map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.created_at,
    items: (o.order_items || []).map((it) => ({
      name: it.products?.name,
      quantity: it.quantity,
      price: it.price_eur,
    })),
    total: (o.order_items || []).reduce(
      (acc, it) => acc + Number(it.price_eur) * it.quantity,
      0
    ),
  }));

  return Response.json({ name: client.name, appointments, orders });
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

  // Devolver al stock los productos reservados con la cita
  const { data: items } = await db
    .from("appointment_products")
    .select("product_id,quantity")
    .eq("appointment_id", id);
  for (const it of items || []) {
    const { data: prod } = await db
      .from("products")
      .select("stock")
      .eq("id", it.product_id)
      .single();
    if (prod) {
      await db
        .from("products")
        .update({ stock: prod.stock + it.quantity })
        .eq("id", it.product_id);
    }
  }

  return Response.json({ ok: true });
}
