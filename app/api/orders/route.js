import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCode, normalizePhone } from "@/lib/code";
import { isBlocked, recordFail, clearFails, clientKey } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Pedidos de productos (independientes de las citas).
// El cliente se autentica con teléfono + código, igual que en "Mis citas".

async function authClient(request, body) {
  const phone = normalizePhone(body?.phone);
  const code = normalizeCode(body?.code);
  if (!phone || phone.replace(/\D/g, "").length < 9 || !code) return null;
  const key = clientKey(request, phone);
  if (isBlocked(key)) return "blocked";
  const db = supabaseAdmin();
  const { data: client } = await db
    .from("clients")
    .select("id,name,access_code")
    .eq("phone", phone)
    .maybeSingle();
  if (!client || !client.access_code || client.access_code !== code) {
    recordFail(key);
    return null;
  }
  clearFails(key);
  return client;
}

function parseItems(raw) {
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

// POST /api/orders — crea un pedido { phone, code, items: [{productId, quantity}] }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const client = await authClient(request, body);
  if (client === "blocked") {
    return Response.json(
      { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." },
      { status: 429 }
    );
  }
  if (!client) {
    return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
  }
  const items = parseItems(body?.items);
  if (items.length === 0) {
    return Response.json({ error: "El pedido está vacío" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Reservar stock producto a producto (con compensación si algo falla)
  const reserved = [];
  const rows = [];
  for (const it of items) {
    const { data: prod } = await db
      .from("products")
      .select("id,name,price_eur,stock,active")
      .eq("id", it.productId)
      .single();
    if (!prod || !prod.active || prod.stock < it.quantity) {
      await restock(db, reserved);
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
      await restock(db, reserved);
      return Response.json({ error: "No se pudo reservar el producto" }, { status: 500 });
    }
    reserved.push(it);
    rows.push({ product_id: prod.id, quantity: it.quantity, price_eur: prod.price_eur });
  }

  const { data: order, error: oErr } = await db
    .from("orders")
    .insert({ client_id: client.id })
    .select("id,created_at")
    .single();
  if (oErr) {
    await restock(db, reserved);
    return Response.json({ error: "No se pudo crear el pedido" }, { status: 500 });
  }

  const { error: iErr } = await db
    .from("order_items")
    .insert(rows.map((r) => ({ ...r, order_id: order.id })));
  if (iErr) {
    await restock(db, reserved);
    await db.from("orders").delete().eq("id", order.id);
    return Response.json({ error: "No se pudo guardar el pedido" }, { status: 500 });
  }

  await logActivity("cliente", "pedido_creado", {
    cliente: client.name,
    articulos: rows.reduce((acc, r) => acc + r.quantity, 0),
    total: rows.reduce((acc, r) => acc + Number(r.price_eur) * r.quantity, 0),
  });

  return Response.json({ ok: true, orderId: order.id });
}

// PATCH /api/orders — cancela un pedido pendiente { phone, code, orderId }
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }
  const client = await authClient(request, body);
  if (client === "blocked") {
    return Response.json(
      { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." },
      { status: 429 }
    );
  }
  if (!client) {
    return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
  }
  const orderId = body?.orderId;
  if (!orderId) return Response.json({ error: "Falta el pedido" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("id,client_id,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== client.id) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (order.status !== "pending") {
    return Response.json({ error: "Este pedido ya no se puede cancelar" }, { status: 400 });
  }

  const { error } = await db.from("orders").update({ status: "cancelled" }).eq("id", orderId);
  if (error) return Response.json({ error: "No se pudo cancelar" }, { status: 500 });

  const { data: items } = await db
    .from("order_items")
    .select("product_id,quantity")
    .eq("order_id", orderId);
  await restock(
    db,
    (items || []).map((it) => ({ productId: it.product_id, quantity: it.quantity }))
  );

  await logActivity("cliente", "pedido_cancelado", { cliente: client.name, via: "web" });

  return Response.json({ ok: true });
}
