import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAccessCode, normalizeCode, normalizePhone, validateCustomCode } from "@/lib/code";
import { authBlocked, authFail, authOk, overActionLimit, clientIp, tooManyResponse } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/security";
import { sendCodeRecovery, sendWelcome } from "@/lib/email";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Identificación de clientes en la web pública.
// - login: teléfono + código (clientes que ya tienen ficha)
// - register: nombre + teléfono + email opcional (crea la ficha y su código)
// - change-code / change-email: el cliente gestiona sus datos

function sanitizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase().slice(0, 120);
  if (!e) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }

  // Honeypot anti-bots: el campo "website" está oculto en el formulario;
  // solo un bot lo rellena. Respondemos con un error genérico.
  if (typeof body?.website === "string" && body.website.trim() !== "") {
    return Response.json({ error: "No se pudo completar" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const phone = normalizePhone(body?.phone);
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    return Response.json({ error: "Escribe un teléfono válido" }, { status: 400 });
  }

  if (body?.action === "login") {
    if (await authBlocked(db, request, phone)) return tooManyResponse();
    const code = normalizeCode(body?.code);
    if (!code) return Response.json({ error: "Escribe tu código" }, { status: 400 });
    const { data: client } = await db
      .from("clients")
      .select("name,access_code,email")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !safeEqual(client.access_code, code)) {
      await authFail(db, request, phone);
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
    await authOk(db, request, phone);
    return Response.json({ ok: true, name: client.name, email: client.email });
  }

  if (body?.action === "register") {
    // Anti-spam: máximo 5 fichas nuevas por IP y hora
    if (await overActionLimit(db, `reg:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
      return tooManyResponse();
    }
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (name.length < 2) {
      return Response.json({ error: "Escribe tu nombre" }, { status: 400 });
    }
    if (body?.acceptTerms !== true) {
      return Response.json(
        { error: "Debes aceptar los términos de uso y la política de privacidad" },
        { status: 400 }
      );
    }
    const email = sanitizeEmail(body?.email);
    if (body?.email && !email) {
      return Response.json({ error: "El email no parece válido" }, { status: 400 });
    }
    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      return Response.json(
        {
          error:
            "Ese teléfono ya tiene ficha. Entra con tu código (si lo has perdido, llámanos y te lo recordamos).",
        },
        { status: 409 }
      );
    }
    let accessCode = null;
    for (let intento = 0; intento < 3 && !accessCode; intento++) {
      const candidate = generateAccessCode();
      const { data } = await db
        .from("clients")
        .insert({
          name,
          phone,
          access_code: candidate,
          email,
          accepted_terms_at: new Date().toISOString(),
          // Consentimiento de promos: opcional y solo tiene sentido con email
          marketing_consent_at:
            body?.marketingConsent === true && email ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (data) accessCode = candidate;
    }
    if (!accessCode) {
      return Response.json({ error: "No se pudo crear la ficha" }, { status: 500 });
    }
    await logActivity("cliente", "ficha_creada", { cliente: name, telefono: phone, via: "web" });
    // Bienvenida con el código por escrito (solo si dio email)
    if (email) {
      await sendWelcome(email, { name, code: accessCode });
    }
    return Response.json({ ok: true, name, accessCode, email });
  }

  if (body?.action === "recover-code") {
    // "He olvidado mi código": si la ficha tiene email, se lo reenviamos.
    // La respuesta es SIEMPRE la misma (exista o no la ficha) para no
    // permitir averiguar qué teléfonos están registrados.
    if (await overActionLimit(db, `rec:${clientIp(request)}|${phone}`, 3, 60 * 60 * 1000)) {
      return tooManyResponse();
    }
    const { data: client } = await db
      .from("clients")
      .select("name,access_code,email")
      .eq("phone", phone)
      .maybeSingle();
    if (client?.email && client?.access_code) {
      await sendCodeRecovery(client.email, { name: client.name, code: client.access_code });
      await logActivity("sistema", "codigo_reenviado", { cliente: client.name });
    }
    return Response.json({ ok: true });
  }

  if (body?.action === "change-email") {
    // El cliente añade o cambia su email (para confirmaciones y recordatorios)
    if (await authBlocked(db, request, phone)) return tooManyResponse();
    const current = normalizeCode(body?.code);
    const { data: client } = await db
      .from("clients")
      .select("id,name,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !safeEqual(client.access_code, current)) {
      await authFail(db, request, phone);
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
    await authOk(db, request, phone);
    const email = sanitizeEmail(body?.email);
    if (body?.email && !email) {
      return Response.json({ error: "El email no parece válido" }, { status: 400 });
    }
    const { error } = await db.from("clients").update({ email }).eq("id", client.id);
    if (error) return Response.json({ error: "No se pudo guardar el email" }, { status: 500 });
    await logActivity("cliente", "email_actualizado", { cliente: client.name });
    return Response.json({ ok: true, email });
  }

  if (body?.action === "change-code") {
    // El cliente personaliza su código (letras y números, 4-12 caracteres)
    if (await authBlocked(db, request, phone)) return tooManyResponse();
    const current = normalizeCode(body?.code);
    const { data: client } = await db
      .from("clients")
      .select("id,name,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !safeEqual(client.access_code, current)) {
      await authFail(db, request, phone);
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
    await authOk(db, request, phone);
    const newCode = validateCustomCode(body?.newCode);
    if (!newCode) {
      return Response.json(
        { error: "El código debe tener de 4 a 12 letras o números (sin espacios)" },
        { status: 400 }
      );
    }
    const { error } = await db
      .from("clients")
      .update({ access_code: newCode })
      .eq("id", client.id);
    if (error) {
      if (error.code === "23505") {
        return Response.json({ error: "Ese código ya está en uso, prueba otro" }, { status: 409 });
      }
      return Response.json({ error: "No se pudo cambiar el código" }, { status: 500 });
    }
    await logActivity("cliente", "codigo_cambiado", { cliente: client.name, telefono: phone });
    return Response.json({ ok: true, name: client.name, accessCode: newCode });
  }

  return Response.json({ error: "Acción desconocida" }, { status: 400 });
}
