import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { buildSlots, isValidDateStr, localToUtc } from "@/lib/availability";
import { getBusinessHours, sanitizeHours } from "@/lib/hours";
import { generateAccessCode, normalizePhone } from "@/lib/code";
import { logActivity } from "@/lib/audit";
import { sendBookingConfirmation, sendBookingUpdate } from "@/lib/email";
import { getClosure, closureMessage, closedRangesAsBusy } from "@/lib/closures";

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
    select: "id,name,phone,email,access_code,created_at",
    insertFields: [],
    updateFields: ["name", "phone", "email", "notes"],
  },
  products: {
    select: "id,name,description,price_eur,stock,active,image_url,image_path,created_at",
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
    // Un día (?date=) o un rango (?from=&to=, ambos incluidos, máx. 62 días)
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    let rangeStart;
    let rangeEnd;
    if (isValidDateStr(from) && isValidDateStr(to)) {
      rangeStart = localToUtc(from, "00:00");
      rangeEnd = new Date(localToUtc(to, "00:00").getTime() + 86400000);
      const days = (rangeEnd.getTime() - rangeStart.getTime()) / 86400000;
      if (days < 1 || days > 62) {
        return Response.json({ error: "Rango de fechas no válido" }, { status: 400 });
      }
    } else if (isValidDateStr(date)) {
      rangeStart = localToUtc(date, "00:00");
      rangeEnd = new Date(rangeStart.getTime() + 86400000);
    } else {
      return Response.json({ error: "Fecha no válida" }, { status: 400 });
    }
    const { data, error } = await db
      .from("appointments")
      .select(
        "id,starts_at,ends_at,status,employees(id,name),services(id,name,price_eur),clients(id,name,phone,email),appointment_products(quantity,products(name))"
      )
      .gte("starts_at", rangeStart.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at")
      .limit(2000);
    if (error) return Response.json({ error: "Error al cargar citas" }, { status: 500 });
    return Response.json({ data });
  }

  if (resource === "client-detail") {
    // Ficha completa de un cliente: datos, historial, pedidos y totales
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "Falta el cliente" }, { status: 400 });
    const { data: client } = await db
      .from("clients")
      .select("id,name,phone,email,access_code,notes,created_at,accepted_terms_at,marketing_consent_at")
      .eq("id", id)
      .maybeSingle();
    if (!client) return Response.json({ error: "Cliente no encontrado" }, { status: 404 });

    const [apptsRes, ordersRes] = await Promise.all([
      db
        .from("appointments")
        .select("id,starts_at,status,services(name,price_eur),employees(name),appointment_products(quantity,products(name,price_eur))")
        .eq("client_id", id)
        .order("starts_at", { ascending: false })
        .limit(200),
      db
        .from("orders")
        .select("id,status,created_at,order_items(quantity,price_eur,products(name))")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const appts = apptsRes.data || [];
    const orders = ordersRes.data || [];
    const now = Date.now();
    let serviceSpent = 0;
    let productSpent = 0;
    let visits = 0;
    let upcoming = 0;
    let noShows = 0;
    let cancelled = 0;
    for (const a of appts) {
      if (a.status === "no_show") noShows += 1;
      else if (a.status === "cancelled") cancelled += 1;
      else if (new Date(a.starts_at).getTime() > now) upcoming += 1;
      else {
        visits += 1;
        serviceSpent += Number(a.services?.price_eur || 0);
        for (const pItem of a.appointment_products || []) {
          productSpent += pItem.quantity * Number(pItem.products?.price_eur || 0);
        }
      }
    }
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      for (const it of o.order_items || []) {
        productSpent += it.quantity * Number(it.price_eur || 0);
      }
    }

    return Response.json({
      data: {
        client,
        appointments: appts,
        orders,
        totals: { visits, upcoming, noShows, cancelled, serviceSpent, productSpent },
      },
    });
  }

  if (resource === "closures") {
    // Festivos y vacaciones: cierres desde hace 30 días en adelante
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await db
      .from("closures")
      .select("id,starts_on,ends_on,reason,employee_id,starts_time,ends_time,employees(name)")
      .gte("ends_on", since)
      .order("starts_on")
      .limit(200);
    if (error) return Response.json({ error: "Error al cargar los cierres" }, { status: 500 });
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

  if (resource === "activity") {
    const { data, error } = await db
      .from("activity_log")
      .select("id,actor,action,details,created_at")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) return Response.json({ error: "Error al cargar la actividad" }, { status: 500 });
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
    const { searchParams } = new URL(request.url);
    const weeks = Math.min(26, Math.max(4, parseInt(searchParams.get("weeks")) || 8));
    const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();

    const [appts, ordersRes, newClientsRes] = await Promise.all([
      db
        .from("appointments")
        .select("id,starts_at,status,services(name,price_eur),clients(id,name),employees(name),appointment_products(quantity,products(name,price_eur))")
        .gte("starts_at", since)
        .order("starts_at")
        .limit(5000),
      db
        .from("orders")
        .select("id,status,created_at,order_items(quantity,price_eur,products(name))")
        .gte("created_at", since)
        .limit(2000),
      db.from("clients").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    if (appts.error) {
      return Response.json({ error: "Error al calcular estadísticas" }, { status: 500 });
    }

    const all = appts.data || [];
    const confirmed = all.filter((a) => a.status === "confirmed");
    const cancelled = all.filter((a) => a.status === "cancelled").length;
    const noShows = all.filter((a) => a.status === "no_show").length;

    const weekKey = (iso) => {
      const d = new Date(iso);
      const monday = new Date(d);
      const dow = (d.getUTCDay() + 6) % 7;
      monday.setUTCDate(d.getUTCDate() - dow);
      return monday.toISOString().slice(0, 10);
    };

    const weekly = new Map();
    const byService = new Map();
    const byClient = new Map();
    const byEmployee = new Map();
    const byProduct = new Map();
    let serviceRevenue = 0;
    let pastConfirmed = 0;
    const now = Date.now();

    for (const a of confirmed) {
      const price = Number(a.services?.price_eur || 0);
      serviceRevenue += price;
      if (new Date(a.starts_at).getTime() < now) pastConfirmed += 1;
      const w = weekly.get(weekKey(a.starts_at)) || { count: 0, revenue: 0 };
      w.count += 1;
      w.revenue += price;
      weekly.set(weekKey(a.starts_at), w);
      const sName = a.services?.name || "—";
      byService.set(sName, (byService.get(sName) || 0) + 1);
      const eName = a.employees?.name || "—";
      byEmployee.set(eName, (byEmployee.get(eName) || 0) + 1);
      if (a.clients?.id) {
        const c = byClient.get(a.clients.id) || { name: a.clients.name, count: 0 };
        c.count += 1;
        byClient.set(a.clients.id, c);
      }
      for (const p of a.appointment_products || []) {
        const key = p.products?.name || "—";
        const acc = byProduct.get(key) || { qty: 0, revenue: 0 };
        acc.qty += p.quantity;
        acc.revenue += p.quantity * Number(p.products?.price_eur || 0);
        byProduct.set(key, acc);
      }
    }

    let productRevenue = 0;
    let orderCount = 0;
    for (const o of ordersRes.data || []) {
      if (o.status === "cancelled") continue;
      orderCount += 1;
      for (const it of o.order_items || []) {
        productRevenue += it.quantity * Number(it.price_eur || 0);
        const key = it.products?.name || "—";
        const acc = byProduct.get(key) || { qty: 0, revenue: 0 };
        acc.qty += it.quantity;
        acc.revenue += it.quantity * Number(it.price_eur || 0);
        byProduct.set(key, acc);
      }
    }

    return Response.json({
      data: {
        weeks,
        totals: {
          appointments: confirmed.length,
          cancelled,
          noShows,
          serviceRevenue,
          productRevenue,
          orders: orderCount,
          newClients: newClientsRes.count ?? 0,
          avgTicket: pastConfirmed > 0 ? serviceRevenue / confirmed.length : 0,
        },
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
        topProducts: [...byProduct.entries()]
          .sort((a, b) => b[1].qty - a[1].qty)
          .slice(0, 8)
          .map(([name, v]) => ({ name, ...v })),
        byEmployee: [...byEmployee.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count })),
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
      db2.from("services").select("id,name,duration_min,price_eur").eq("id", serviceId).eq("active", true).single(),
      db2.from("employees").select("id,name,hours").eq("id", employeeId).eq("active", true).single(),
      getBusinessHours(),
    ]);
    if (!service || !employee) {
      return Response.json({ error: "Servicio o empleado no válido" }, { status: 400 });
    }
    const hours = sanitizeHours(employee.hours) ?? generalHours;

    // Día cerrado (festivo/vacaciones): avisamos también al personal
    const closure = await getClosure(db2, date, employeeId);
    if (closure) {
      return Response.json(
        { error: `${closureMessage(closure)} (Puedes borrar el cierre en Horario → Festivos.)` },
        { status: 409 }
      );
    }

    const dayStart = localToUtc(date, "00:00").toISOString();
    const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
    const { data: busy } = await db2
      .from("appointments")
      .select("starts_at,ends_at")
      .eq("employee_id", employeeId)
      .eq("status", "confirmed")
      .gte("ends_at", dayStart)
      .lte("starts_at", dayEnd);

    const blockedRanges = await closedRangesAsBusy(db2, date, employeeId);
    const slots = buildSlots(date, service.duration_min, [...(busy || []), ...blockedRanges], hours);
    const slot = slots.find((s) => s.startsAt === startsAt && s.free);
    if (!slot) {
      return Response.json(
        { error: "Ese hueco no está disponible (ocupado o cerrado). Elige otra hora." },
        { status: 409 }
      );
    }

    // Cliente: buscar por teléfono o crearlo (con código para "Mis citas")
    let clientId;
    let accessCode;
    const { data: existing } = await db2
      .from("clients")
      .select("id,access_code,email")
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

    await logActivity("admin", "cita_creada", {
      cliente: name,
      fecha: slot.startsAt,
      via: "mostrador",
    });

    if (existing?.email) {
      await sendBookingConfirmation(existing.email, {
        name,
        service: service.name,
        employee: employee.name,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        appointmentId: appt.id,
        price: service.price_eur,
      });
    }

    return Response.json({ ok: true, appointmentId: appt.id, accessCode });
  }

  if (resource === "closures") {
    // Nuevo cierre: { startsOn, endsOn, reason?, employeeId? }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Petición no válida" }, { status: 400 });
    }
    const { startsOn, endsOn } = body || {};
    if (!isValidDateStr(startsOn) || !isValidDateStr(endsOn) || endsOn < startsOn) {
      return Response.json({ error: "Fechas no válidas (inicio ≤ fin)" }, { status: 400 });
    }
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 120) || null : null;

    // Horas opcionales: si faltan, el cierre es de día(s) completo(s)
    const isTime = (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    let startsTime = null;
    let endsTime = null;
    if (body?.startsTime || body?.endsTime) {
      if (!isTime(body?.startsTime) || !isTime(body?.endsTime)) {
        return Response.json({ error: "Horas no válidas (formato HH:MM)" }, { status: 400 });
      }
      if (body.endsTime <= body.startsTime) {
        return Response.json({ error: "La hora de fin debe ser posterior a la de inicio" }, { status: 400 });
      }
      startsTime = body.startsTime;
      endsTime = body.endsTime;
    }

    let employeeId = null;
    if (body?.employeeId) {
      const { data: emp } = await supabaseAdmin()
        .from("employees")
        .select("id")
        .eq("id", body.employeeId)
        .maybeSingle();
      if (!emp) return Response.json({ error: "Empleado no válido" }, { status: 400 });
      employeeId = emp.id;
    }

    const dbC = supabaseAdmin();
    const { data, error } = await dbC
      .from("closures")
      .insert({
        starts_on: startsOn,
        ends_on: endsOn,
        reason,
        employee_id: employeeId,
        starts_time: startsTime,
        ends_time: endsTime,
      })
      .select("id,starts_on,ends_on,reason,employee_id,starts_time,ends_time,employees(name)")
      .single();
    if (error) return Response.json({ error: "No se pudo guardar el cierre" }, { status: 500 });
    await logActivity("admin", "cierre_creado", {
      desde: startsOn,
      hasta: endsOn,
      motivo: reason,
      tramo: startsTime ? `${startsTime}-${endsTime}` : "dia completo",
    });

    // ¿Hay citas confirmadas dentro del cierre? Se avisa (no se tocan)
    const rangeStart = localToUtc(startsOn, startsTime || "00:00").toISOString();
    const rangeEnd = startsTime
      ? localToUtc(endsOn, endsTime).toISOString()
      : new Date(localToUtc(endsOn, "00:00").getTime() + 86400000).toISOString();
    let q = dbC
      .from("appointments")
      .select("id,starts_at,clients(name,phone)")
      .eq("status", "confirmed")
      .gte("starts_at", rangeStart)
      .lt("starts_at", rangeEnd)
      .order("starts_at")
      .limit(50);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data: affected } = await q;

    return Response.json({
      data,
      affected: (affected || []).map((a) => ({
        id: a.id,
        startsAt: a.starts_at,
        client: a.clients?.name,
        phone: a.clients?.phone,
      })),
    });
  }

  if (resource === "product-image") {
    // Foto de un producto: { id, imageBase64, contentType }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Petición no válida" }, { status: 400 });
    }
    const id = body?.id;
    const contentType = ["image/jpeg", "image/png", "image/webp"].includes(body?.contentType)
      ? body.contentType
      : null;
    const b64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    if (!id || !contentType || !b64 || b64.length > 8_000_000) {
      return Response.json(
        { error: "Imagen no válida (JPG/PNG/WebP, máx ~5MB)" },
        { status: 400 }
      );
    }
    const db3 = supabaseAdmin();
    const { data: prod } = await db3
      .from("products")
      .select("id,image_path")
      .eq("id", id)
      .maybeSingle();
    if (!prod) return Response.json({ error: "Producto no encontrado" }, { status: 404 });

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const path = `productos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(b64, "base64");
    const { error: upErr } = await db3.storage.from("gallery").upload(path, buffer, { contentType });
    if (upErr) return Response.json({ error: "No se pudo subir la imagen" }, { status: 500 });
    const { data: pub } = db3.storage.from("gallery").getPublicUrl(path);
    const { error: uErr } = await db3
      .from("products")
      .update({ image_url: pub.publicUrl, image_path: path })
      .eq("id", id);
    if (uErr) return Response.json({ error: "No se pudo guardar la imagen" }, { status: 500 });
    if (prod.image_path) {
      await db3.storage.from("gallery").remove([prod.image_path]);
    }
    return Response.json({ ok: true, imageUrl: pub.publicUrl });
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
    await logActivity("admin", "horario_actualizado", {});
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
    await logActivity(
      "admin",
      status === "delivered" ? "pedido_entregado" : status === "cancelled" ? "pedido_cancelado" : "pedido_reabierto",
      { pedido: id, via: "admin" }
    );
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

  if (resource === "appointments" && body?.startsAt) {
    // Reprogramar/editar una cita: nuevo servicio, día u hora
    const { serviceId, employeeId, date, startsAt } = body;
    if (!serviceId || !employeeId || !isValidDateStr(date)) {
      return Response.json({ error: "Faltan datos" }, { status: 400 });
    }
    const { data: appt } = await db
      .from("appointments")
      .select("id,status,client_id,clients(name,email)")
      .eq("id", id)
      .maybeSingle();
    if (!appt) return Response.json({ error: "Cita no encontrada" }, { status: 404 });
    if (appt.status !== "confirmed") {
      return Response.json({ error: "Reactiva la cita antes de editarla" }, { status: 400 });
    }

    const [{ data: service }, { data: employee }, generalHours] = await Promise.all([
      db.from("services").select("id,name,duration_min").eq("id", serviceId).eq("active", true).single(),
      db.from("employees").select("id,name,hours").eq("id", employeeId).eq("active", true).single(),
      getBusinessHours(),
    ]);
    if (!service || !employee) {
      return Response.json({ error: "Servicio o empleado no válido" }, { status: 400 });
    }
    const hours = sanitizeHours(employee.hours) ?? generalHours;

    const closure2 = await getClosure(db, date, employeeId);
    if (closure2) {
      return Response.json({ error: closureMessage(closure2) }, { status: 409 });
    }

    const dayStart = localToUtc(date, "00:00").toISOString();
    const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
    const { data: busy } = await db
      .from("appointments")
      .select("id,starts_at,ends_at")
      .eq("employee_id", employeeId)
      .eq("status", "confirmed")
      .gte("ends_at", dayStart)
      .lte("starts_at", dayEnd);
    // La propia cita no cuenta como ocupada
    const busyOthers = (busy || []).filter((b) => b.id !== id);

    const blockedRanges2 = await closedRangesAsBusy(db, date, employeeId);
    const slots = buildSlots(date, service.duration_min, [...busyOthers, ...blockedRanges2], hours);
    const slot = slots.find((s) => s.startsAt === startsAt && s.free);
    if (!slot) {
      return Response.json(
        { error: "Ese hueco no está disponible. Elige otra hora." },
        { status: 409 }
      );
    }

    const { error } = await db
      .from("appointments")
      .update({
        service_id: serviceId,
        employee_id: employeeId,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        reminder_sent_at: null, // que vuelva a recibir recordatorio para la nueva hora
      })
      .eq("id", id);
    if (error) {
      if (error.code === "23P01") {
        return Response.json(
          { error: "Ese hueco se acaba de ocupar. Elige otra hora." },
          { status: 409 }
        );
      }
      return Response.json({ error: "No se pudo modificar la cita" }, { status: 500 });
    }

    await logActivity("admin", "cita_modificada", {
      cliente: appt.clients?.name,
      fecha: slot.startsAt,
      via: "admin",
    });

    if (appt.clients?.email) {
      await sendBookingUpdate(appt.clients.email, {
        name: appt.clients?.name || "cliente",
        service: service.name,
        employee: employee.name,
        startsAt: slot.startsAt,
      });
    }

    return Response.json({ ok: true });
  }

  if (resource === "appointments") {
    // Cambios de estado: cancelar / reactivar / marcar "no vino"
    const status = body?.status;
    if (!["confirmed", "cancelled", "no_show"].includes(status)) {
      return Response.json({ error: "Estado no válido" }, { status: 400 });
    }
    const { data: current } = await db
      .from("appointments")
      .select("status,starts_at")
      .eq("id", id)
      .maybeSingle();
    if (!current) return Response.json({ error: "Cita no encontrada" }, { status: 404 });
    if (status === "no_show") {
      if (current.status !== "confirmed") {
        return Response.json({ error: "Solo se puede marcar como no asistida una cita confirmada" }, { status: 400 });
      }
      if (new Date(current.starts_at) > new Date()) {
        return Response.json({ error: "La cita aún no ha pasado" }, { status: 400 });
      }
    }

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
    if (current.status === "confirmed" && (status === "cancelled" || status === "no_show")) {
      await restockAppointment(db, id);
    } else if (current.status !== "confirmed" && status === "confirmed") {
      await reReserveAppointment(db, id);
    }
    await logActivity("admin", status === "cancelled" ? "cita_cancelada" : status === "no_show" ? "cita_no_asistida" : "cita_reactivada", {
      cita: id,
      via: "admin",
    });
    return Response.json({ ok: true });
  }

  const cfg = RESOURCES[resource];
  if (!cfg) return Response.json({ error: "Recurso desconocido" }, { status: 404 });
  const values = pick(body, cfg.updateFields);
  if (values.notes !== undefined) {
    values.notes = typeof values.notes === "string" ? values.notes.trim().slice(0, 2000) || null : null;
  }
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
  const DELETABLE = ["gallery", "reviews", "appointments", "clients", "employees", "services", "products", "closures"];
  if (!DELETABLE.includes(resource)) {
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

  if (resource === "appointments") {
    // Devolver el stock de productos ligados a la cita antes de borrarla
    await restockAppointment(db, id);
  }

  if (resource === "products") {
    const { data: prod } = await db.from("products").select("image_path").eq("id", id).maybeSingle();
    if (prod?.image_path) {
      await db.storage.from("gallery").remove([prod.image_path]);
    }
  }

  if (resource === "clients") {
    // Borrado en cascada e irreversible: exige confirmación explícita
    // también en el servidor (no basta con el diálogo del navegador)
    if (searchParams.get("confirm") !== "1") {
      return Response.json(
        { error: "Borrado no confirmado: falta el parámetro de confirmación" },
        { status: 400 }
      );
    }
    // Borrar la ficha completa: citas, pedidos y reseñas incluidos
    const { data: appts } = await db.from("appointments").select("id").eq("client_id", id);
    for (const a of appts || []) {
      await restockAppointment(db, a.id);
    }
    await db.from("reviews").delete().eq("client_id", id);
    await db.from("appointments").delete().eq("client_id", id);
    await db.from("orders").delete().eq("client_id", id);
  }

  const { error: delErr } = await db.from(resource).delete().eq("id", id);
  const error = delErr;
  if (!error) {
    await logActivity("admin", "elemento_borrado", { tipo: resource, id });
  }
  if (error) {
    if (error.code === "23503") {
      const consejo =
        resource === "employees"
          ? "Este empleado tiene citas en el historial: desactívalo en su lugar."
          : "Está en uso en citas o pedidos: ocúltalo en su lugar.";
      return Response.json({ error: consejo }, { status: 409 });
    }
    return Response.json({ error: "No se pudo borrar" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
