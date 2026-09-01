import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { buildSlots, isValidDateStr, localToUtc } from "@/lib/availability";
import { getBusinessHours, sanitizeHours } from "@/lib/hours";
import { generateAccessCode, normalizePhone } from "@/lib/code";

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
    select: "id,name,active,hours,created_at",
    insertFields: ["name"],
    updateFields: ["name", "active"], // hours se valida aparte
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
  reviews: null, // gestionado aparte (joins + aprobación)
  gallery: null, // gestionado aparte (Storage)
  orders: null, // gestionado aparte (estado + restock)
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

  if (resource === "reviews") {
    const { data, error } = await db
      .from("reviews")
      .select("id,rating,comment,approved,created_at,clients(name),appointments(starts_at)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return Response.json({ error: "Error al cargar reseñas" }, { status: 500 });
    return Response.json({ data });
  }

  if (resource === "gallery") {
    const { data, error } = await db
      .from("gallery")
      .select("id,url,path,caption,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return Response.json({ error: "Error al cargar la galería" }, { status: 500 });
    return Response.json({ data });
  }

  if (resource === "orders") {
    const { data, error } = await db
      .from("orders")
      .select("id,status,created_at,clients(name,phone),order_items(quantity,price_eur,products(name))")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return Response.json({ error: "Error al cargar pedidos" }, { status: 500 });
    return Response.json({ data });
  }

  if (resource === "stats") {
    const weeks = 8;
    const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
    const { data, error } = await db
      .from("appointments")
      .select("id,starts_at,status,services(name,price_eur),clients(id,name)")
      .gte("starts_at", since)
      .order("starts_at")
      .limit(5000);
    if (error) return Response.json({ error: "Error al calcular estadísticas" }, { status: 500 });

    const confirmed = (data || []).filter((a) => a.status === "confirmed");
    const weekly = new Map();
    const byService = new Map();
    const byClient = new Map();
    let revenue = 0;
    for (const a of confirmed) {
      const d = new Date(a.starts_at);
      // Lunes de esa semana como clave
      const monday = new Date(d);
      const dow = (d.getUTCDay() + 6) % 7;
      monday.setUTCDate(d.getUTCDate() - dow);
      const wk = monday.toISOString().slice(0, 10);
      const price = Number(a.services?.price_eur || 0);
      revenue += price;
      const w = weekly.get(wk) || { count: 0, revenue: 0 };
      w.count += 1;
      w.revenue += price;
      weekly.set(wk, w);
      const sName = a.services?.name || "—";
      byService.set(sName, (byService.get(sName) || 0) + 1);
      if (a.clients?.id) {
        const c = byClient.get(a.clients.id) || { name: a.clients.name, count: 0 };
        c.count += 1;
        byClient.set(a.clients.id, c);
      }
    }
    return Response.json({
      data: {
        weeks,
        totalAppointments: confirmed.length,
        totalRevenue: revenue,
        weekly: [...weekly.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([weekStart, v]) => ({ weekStart, ...v })),
        topServices: [...byService.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => ({ name, count })),
        topClients: [...byClient.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      },
    });
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

  if (resource === "appointments") {
    // El personal apunta una cita a mano (cliente que llama o entra por la puerta)
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Petición no válida" }, { status: 400 });
    }
    const { serviceId, employeeId, date, startsAt } = body || {};
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    const phone = normalizePhone(body?.phone);

    if (!serviceId || !employeeId || !isValidDateStr(date) || !startsAt) {
      return Response.json({ error: "Faltan datos de la cita" }, { status: 400 });
    }
    if (name.length < 2) {
      return Response.json({ error: "Escribe el nombre del cliente" }, { status: 400 });
    }
    if (phone.replace(/\D/g, "").length < 9) {
      return Response.json({ error: "Escribe un teléfono válido" }, { status: 400 });
    }

    const db2 = supabaseAdmin();
    const [{ data: service }, { data: employee }, generalHours] = await Promise.all([
      db2.from("services").select("id,duration_min").eq("id", serviceId).eq("active", true).single(),
      db2.from("employees").select("id,hours").eq("id", employeeId).eq("active", true).single(),
      getBusinessHours(),
    ]);
    if (!service || !employee) {
      return Response.json({ error: "Servicio o empleado no válido" }, { status: 400 });
    }
    const hours = sanitizeHours(employee.hours) ?? generalHours;

    const dayStart = localToUtc(date, "00:00").toISOString();
    const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
    const { data: busy } = await db2
      .from("appointments")
      .select("starts_at,ends_at")
      .eq("employee_id", employeeId)
      .eq("status", "confirmed")
      .gte("ends_at", dayStart)
      .lte("starts_at", dayEnd);

    const slots = buildSlots(date, service.duration_min, busy || [], hours);
    const slot = slots.find((s) => s.startsAt === startsAt && s.free);
    if (!slot) {
      return Response.json(
        { error: "Ese hueco no está disponible. Elige otra hora." },
        { status: 409 }
      );
    }

    // Cliente: buscar por teléfono o crearlo (con código para "Mis citas")
    let clientId;
    let accessCode;
    const { data: existing } = await db2
      .from("clients")
      .select("id,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      clientId = existing.id;
      accessCode = existing.access_code;
      if (!accessCode) {
        accessCode = generateAccessCode();
        await db2.from("clients").update({ access_code: accessCode }).eq("id", clientId);
      }
    } else {
      let created = null;
      for (let intento = 0; intento < 3 && !created; intento++) {
        accessCode = generateAccessCode();
        const { data } = await db2
          .from("clients")
          .insert({ name, phone, access_code: accessCode })
          .select("id")
          .single();
        if (data) created = data;
      }
      if (!created) {
        return Response.json({ error: "No se pudo guardar el cliente" }, { status: 500 });
      }
      clientId = created.id;
    }

    const { data: appt, error: aErr } = await db2
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
      if (aErr.code === "23P01") {
        return Response.json(
          { error: "Ese hueco se acaba de ocupar. Elige otra hora." },
          { status: 409 }
        );
      }
      return Response.json({ error: "No se pudo crear la cita" }, { status: 500 });
    }

    return Response.json({ ok: true, appointmentId: appt.id, accessCode });
  }

  if (resource === "gallery") {
    // Subida de foto: { imageBase64, contentType, caption }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Petición no válida" }, { status: 400 });
    }
    const contentType = ["image/jpeg", "image/png", "image/webp"].includes(body?.contentType)
      ? body.contentType
      : null;
    const b64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    if (!contentType || !b64 || b64.length > 8_000_000) {
      return Response.json(
        { error: "Imagen no válida (JPG/PNG/WebP, máx ~5MB)" },
        { status: 400 }
      );
    }
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return Response.json({ error: "Imagen no válida" }, { status: 400 });
    }
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const path = `trabajos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const db = supabaseAdmin();
    const { error: upErr } = await db.storage
      .from("gallery")
      .upload(path, buffer, { contentType });
    if (upErr) {
      return Response.json({ error: "No se pudo subir la imagen" }, { status: 500 });
    }
    const { data: pub } = db.storage.from("gallery").getPublicUrl(path);
    const caption = typeof body?.caption === "string" ? body.caption.slice(0, 120) : null;
    const { data, error } = await db
      .from("gallery")
      .insert({ url: pub.publicUrl, path, caption })
      .select("id,url,path,caption,created_at")
      .single();
    if (error) return Response.json({ error: "No se pudo guardar la foto" }, { status: 500 });
    return Response.json({ data });
  }

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

  if (resource === "orders") {
    const status = body?.status;
    if (!["pending", "delivered", "cancelled"].includes(status)) {
      return Response.json({ error: "Estado no válido" }, { status: 400 });
    }
    const { data: current } = await db
      .from("orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!current) return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    const { error } = await db.from("orders").update({ status }).eq("id", id);
    if (error) return Response.json({ error: "No se pudo actualizar" }, { status: 400 });
    // Si se cancela un pedido que estaba activo, devolver el stock
    if (current.status !== "cancelled" && status === "cancelled") {
      const { data: items } = await db
        .from("order_items")
        .select("product_id,quantity")
        .eq("order_id", id);
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
    return Response.json({ ok: true });
  }

  if (resource === "reviews") {
    if (typeof body?.approved !== "boolean") {
      return Response.json({ error: "Falta el estado de aprobación" }, { status: 400 });
    }
    const { error } = await db.from("reviews").update({ approved: body.approved }).eq("id", id);
    if (error) return Response.json({ error: "No se pudo actualizar" }, { status: 400 });
    return Response.json({ ok: true });
  }

  if (resource === "employees" && body.hours !== undefined) {
    // Horario propio del empleado: null = usa el general
    let hoursValue = null;
    if (body.hours !== null) {
      hoursValue = sanitizeHours(body.hours);
      if (!hoursValue) {
        return Response.json(
          { error: "Horario no válido: revisa las horas (apertura < cierre)" },
          { status: 400 }
        );
      }
    }
    const { error } = await db.from("employees").update({ hours: hoursValue }).eq("id", id);
    if (error) return Response.json({ error: "No se pudo guardar el horario" }, { status: 400 });
    return Response.json({ ok: true });
  }

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

export async function DELETE(request, { params }) {
  const user = await requireAdmin(request);
  if (!user) return unauthorized();
  const { resource } = params;
  if (!["gallery", "reviews"].includes(resource)) {
    return Response.json({ error: "Operación no permitida" }, { status: 405 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });
  const db = supabaseAdmin();

  if (resource === "gallery") {
    const { data: row } = await db.from("gallery").select("path").eq("id", id).maybeSingle();
    if (row?.path) {
      await db.storage.from("gallery").remove([row.path]);
    }
  }

  const { error } = await db.from(resource).delete().eq("id", id);
  if (error) return Response.json({ error: "No se pudo borrar" }, { status: 400 });
  return Response.json({ ok: true });
}
