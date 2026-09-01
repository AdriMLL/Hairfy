import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { isValidDateStr, localToUtc } from "@/lib/availability";

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
    select: "id,name,phone,created_at",
    insertFields: [],
    updateFields: ["name", "phone"],
  },
  appointments: null, // gestionado aparte (necesita joins)
};

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
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
        "id,starts_at,ends_at,status,employees(name),services(name,price_eur),clients(name,phone)"
      )
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at");
    if (error) return Response.json({ error: "Error al cargar citas" }, { status: 500 });
    return Response.json({ data });
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
  const id = body?.id;
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });
  const db = supabaseAdmin();

  if (resource === "appointments") {
    // Solo se permite cambiar el estado (cancelar / reconfirmar)
    const status = body?.status;
    if (!["confirmed", "cancelled"].includes(status)) {
      return Response.json({ error: "Estado no válido" }, { status: 400 });
    }
    const { error } = await db.from("appointments").update({ status }).eq("id", id);
    if (error) {
      if (error.code === "23P01") {
        return Response.json(
          { error: "No se puede reconfirmar: el hueco ya está ocupado" },
          { status: 409 }
        );
      }
      return Response.json({ error: "No se pudo actualizar" }, { status: 400 });
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
