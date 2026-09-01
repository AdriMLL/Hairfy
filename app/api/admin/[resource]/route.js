import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { isValidDateStr, localToUtc } from "@/lib/availability";
import { sanitizeHours } from "@/lib/hours";

export const dynamic = "force-dynamic";

// API del panel de administración. Todas las peticiones exigen un token de
// sesión válido (Supabase Auth). Solo se puede tocar la lista de recursos
// permitidos, con los campos permitidos — nada de SQL ni tablas arbitrarias.

const RESOURCES = {
  services: {
    select: "id,name,duration_min,price_eur,active,created_at",
    insertFields: ["name", "duration_min", "price_eur"],
    updateFields: ["name", "duration_min", "price_eur", "active"],
  },
  employees: {
    select: "id,name,active,created_at",
    insertFields: ["name"],
    updateFields: ["name", "active"],
  },
  clients: {
    select: "id,name,phone,access_code,created_at",
    insertFields: [],
    updateFields: ["name", "phone"],
  },
  products: {
    select: "id,name,description,price_eur,stock,active,created_at",
    insertFields: ["name", "description", "price_eur", "stock"],
    updateFields: ["name", "description", "price_eur", "stock", "active"],
  },
  appointments: null, // gestionado aparte (necesita joins)
  settings: null, // gestionado aparte (validación específica)
};

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

// Devuelve al stock los productos de una cita (al cancelarla)
async function restockAppointment(db, appointmentId) {
  const { data: items } = await db
    .from("appointment_products")
    .select("product_id,quantity")
    .eq("appointment_id", appointmentId);
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
}

// Intenta volver a descontar el stock (al reactivar una cita)
async function reReserveAppointment(db, appointmentId) {
  const { data: items } = await db
    .from("appointment_products")
    .select("product_id,quantity")
    .eq("appointment_id", appointmentId);
  for (const it of items || []) {
    const { data: prod } = await db
      .from("products")
      .select("stock")
      .eq("id", it.product_id)
      .single();
    if (prod && prod.stock >= it.quantity) {
      await db
        .from("products")
        .update({ stock: prod.stock - it.quantity })
        .eq("id", it.product_id);
    }
  }
}

export async function GET(request, { params }) {
  const user = await requireAdmin(request);
  if (!user) return unauthorized();
  const { resource } = params;
  const db = supabaseAdmin();

  if (resource === "appointments") {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!isValidDateStr(date)) {
      return Response.json({ error: "Fecha no válida" }, { status: 400 });
    }
    const dayStart = localToUtc(date, "00:00").toISOString();
    const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
    const { data, error } = await db
      .from("appointments")
      .select(
        "id,starts_at,ends_at,status,employees(name),services(name,price_eur),clients(name,phone),appointment_products(quantity,products(name))"
      )
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at");
    if (error) return Response.json({ error: "Error al cargar citas" }, { status: 500 });
    return Response.json({ data });
  }

  if (resource === "settings") {
    const { data } = await db
      .from("settings")
      .select("key,value")
      .eq("key", "business_hours")
      .maybeSingle();
    return Response.json({ data: { business_hours: data?.value ?? null } });
  }

  const cfg = RESOURCES[resource];
  if (!cfg) return Response.json({ error: "Recurso desconocido" }, { status: 404 });

  const { data, error } = await db
    .from(resource)
    .select(cfg.select)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return Response.json({ error: "Error al cargar datos" }, { status: 500 });
  return Response.json({ data });
}

export async function POST(request, { params }) {
  const user = await requireAdmin(request);
  if (!user) return unauthorized();
  const { resource } = params;
  const cfg = RESOURCES[resource];
  if (!cfg || cfg.insertFields.length === 0) {
    return Response.json({ error: "Operación no permitida" }, { status: 405 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const values = pick(body, cfg.insertFields);
  if (Object.keys(values).length === 0) {
    return Response.json({ error: "Faltan datos" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db.from(resource).insert(values).select(cfg.select).single();
  if (error) return Response.json({ error: "No se pudo crear" }, { status: 400 });
  return Response.json({ data });
}

export async function PATCH(request, { params }) {
  const user = await requireAdmin(request);
  if (!user) return unauthorized();
  const { resource } = params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const db = supabaseAdmin();

  if (resource === "settings") {
    if (body?.key !== "business_hours") {
      return Response.json({ error: "Ajuste desconocido" }, { status: 400 });
    }
    const clean = sanitizeHours(body?.value);
    if (!clean) {
      return Response.json(
        { error: "Horario no válido: revisa las horas (apertura < cierre)" },
        { status: 400 }
      );
    }
    const { error } = await db
      .from("settings")
      .upsert({ key: "business_hours", value: clean, updated_at: new Date().toISOString() });
    if (error) return Response.json({ error: "No se pudo guardar el horario" }, { status: 500 });
    return Response.json({ ok: true, value: clean });
  }

  const id = body?.id;
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });

  if (resource === "appointments") {
    // Solo se permite cambiar el estado (cancelar / reactivar)
    const status = body?.status;
    if (!["confirmed", "cancelled"].includes(status)) {
      return Response.json({ error: "Estado no válido" }, { status: 400 });
    }
    const { data: current } = await db
      .from("appointments")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!current) return Response.json({ error: "Cita no encontrada" }, { status: 404 });

    const { error } = await db.from("appointments").update({ status }).eq("id", id);
    if (error) {
      if (error.code === "23P01") {
        return Response.json(
          { error: "No se puede reactivar: el hueco ya está ocupado" },
          { status: 409 }
        );
      }
      return Response.json({ error: "No se pudo actualizar" }, { status: 400 });
    }
    // Mantener el stock de productos en orden
    if (current.status === "confirmed" && status === "cancelled") {
      await restockAppointment(db, id);
    } else if (current.status === "cancelled" && status === "confirmed") {
      await reReserveAppointment(db, id);
    }
    return Response.json({ ok: true });
  }

  const cfg = RESOURCES[resource];
  if (!cfg) return Response.json({ error: "Recurso desconocido" }, { status: 404 });
  const values = pick(body, cfg.updateFields);
  if (Object.keys(values).length === 0) {
    return Response.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  const { error } = await db.from(resource).update(values).eq("id", id);
  if (error) return Response.json({ error: "No se pudo actualizar" }, { status: 400 });
  return Response.json({ ok: true });
}
