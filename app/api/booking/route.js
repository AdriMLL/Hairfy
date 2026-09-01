import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSlots, isValidDateStr, isBookableDate, localToUtc } from "@/lib/availability";
import { getBusinessHours } from "@/lib/hours";
import { generateAccessCode, normalizePhone } from "@/lib/code";

export const dynamic = "force-dynamic";

// Valida y normaliza los productos pedidos: [{productId, quantity}]
function parseProducts(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const p of raw.slice(0, 10)) {
    const id = typeof p?.productId === "string" ? p.productId : null;
    const qty = Number.isInteger(p?.quantity) ? p.quantity : 0;
    if (!id || seen.has(id) || qty < 1 || qty > 5) continue;
    seen.add(id);
    out.push({ productId: id, quantity: qty });
  }
  return out;
}

// Devuelve el stock reservado (compensación si algo falla a mitad)
async function restock(db, items) {
  for (const it of items) {
    const { data: prod } = await db
      .from("products")
      .select("stock")
      .eq("id", it.productId)
      .single();
    if (prod) {
      await db
        .from("products")
        .update({ stock: prod.stock + it.quantity })
        .eq("id", it.productId);
    }
  }
}

// POST /api/booking — crea una cita (con productos opcionales).
// Toda la validación ocurre en el servidor.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }

  const { serviceId, employeeId, date, startsAt } = body || {};
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const phone = normalizePhone(body?.phone);
  const wantedProducts = parseProducts(body?.products);

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

  const [{ data: service }, { data: employee }, hours] = await Promise.all([
    db.from("services").select("id,duration_min").eq("id", serviceId).eq("active", true).single(),
    db.from("employees").select("id").eq("id", employeeId).eq("active", true).single(),
    getBusinessHours(),
  ]);
  if (!service || !employee) {
    return Response.json({ error: "Servicio o empleado no válido" }, { status: 400 });
  }

  // Recalcular la disponibilidad en el servidor: el hueco pedido debe estar libre
  const dayStart = localToUtc(date, "00:00").toISOString();
  const dayEnd = new Date(localToUtc(date, "00:00").getTime() + 86400000).toISOString();
  const { data: busy } = await db
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
      { error: "Ese hueco ya no está disponible. Elige otra hora." },
      { status: 409 }
    );
  }

  // Cliente: buscar por teléfono o crearlo (con su código de acceso)
  let clientId;
  let accessCode;
  const { data: existing } = await db
    .from("clients")
    .select("id,access_code")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    clientId = existing.id;
    accessCode = existing.access_code;
    const updates = { name };
    if (!accessCode) {
      accessCode = generateAccessCode();
      updates.access_code = accessCode;
    }
    await db.from("clients").update(updates).eq("id", clientId);
  } else {
    let created = null;
    for (let intento = 0; intento < 3 && !created; intento++) {
      accessCode = generateAccessCode();
      const { data, error: cErr } = await db
        .from("clients")
        .insert({ name, phone, access_code: accessCode })
        .select("id")
        .single();
      if (data) created = data;
      else if (cErr && cErr.code !== "23505") {
        return Response.json({ error: "No se pudo guardar el cliente" }, { status: 500 });
      }
    }
    if (!created) {
      return Response.json({ error: "No se pudo guardar el cliente" }, { status: 500 });
    }
    clientId = created.id;
  }

  // Reservar stock de productos (si hay). Descuento condicional: solo si queda stock.
  const reservedItems = [];
  const productNames = [];
  for (const it of wantedProducts) {
    const { data: prod } = await db
      .from("products")
      .select("id,name,stock,active")
      .eq("id", it.productId)
      .single();
    if (!prod || !prod.active || prod.stock < it.quantity) {
      await restock(db, reservedItems);
      return Response.json(
        { error: `No queda stock suficiente de "${prod?.name || "un producto"}"` },
        { status: 409 }
      );
    }
    const { error: uErr } = await db
      .from("products")
      .update({ stock: prod.stock - it.quantity })
      .eq("id", prod.id)
      .gte("stock", it.quantity);
    if (uErr) {
      await restock(db, reservedItems);
      return Response.json({ error: "No se pudo reservar el producto" }, { status: 500 });
    }
    reservedItems.push(it);
    productNames.push(`${prod.name} x${it.quantity}`);
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
    await restock(db, reservedItems);
    if (aErr.code === "23P01") {
      return Response.json(
        { error: "Ese hueco se acaba de ocupar. Elige otra hora." },
        { status: 409 }
      );
    }
    return Response.json({ error: "No se pudo crear la cita" }, { status: 500 });
  }

  if (reservedItems.length) {
    const rows = reservedItems.map((it) => ({
      appointment_id: appt.id,
      product_id: it.productId,
      quantity: it.quantity,
    }));
    const { error: pErr } = await db.from("appointment_products").insert(rows);
    if (pErr) {
      // La cita queda creada; devolvemos el stock para no bloquearlo
      await restock(db, reservedItems);
      productNames.length = 0;
    }
  }

  return Response.json({
    ok: true,
    appointmentId: appt.id,
    startsAt: appt.starts_at,
    accessCode,
    products: productNames,
  });
}
