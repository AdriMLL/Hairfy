import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAccessCode, normalizeCode, normalizePhone, validateCustomCode } from "@/lib/code";
import { isBlocked, recordFail, clearFails, clientKey, tooManyResponse } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Identificación de clientes en la web pública.
// - login: teléfono + código (clientes que ya tienen ficha)
// - register: nombre + teléfono (clientes nuevos; se crea la ficha y su código)

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Petición no válida" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const phone = normalizePhone(body?.phone);
  if (!phone || phone.replace(/\D/g, "").length < 9) {
    return Response.json({ error: "Escribe un teléfono válido" }, { status: 400 });
  }

  if (body?.action === "login") {
    const key = clientKey(request, phone);
    if (isBlocked(key)) return tooManyResponse();
    const code = normalizeCode(body?.code);
    if (!code) return Response.json({ error: "Escribe tu código" }, { status: 400 });
    const { data: client } = await db
      .from("clients")
      .select("name,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !client.access_code || client.access_code !== code) {
      recordFail(key);
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
    clearFails(key);
    return Response.json({ ok: true, name: client.name });
  }

  if (body?.action === "register") {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (name.length < 2) {
      return Response.json({ error: "Escribe tu nombre" }, { status: 400 });
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
        .insert({ name, phone, access_code: candidate })
        .select("id")
        .single();
      if (data) accessCode = candidate;
    }
    if (!accessCode) {
      return Response.json({ error: "No se pudo crear la ficha" }, { status: 500 });
    }
    await logActivity("cliente", "ficha_creada", { cliente: name, telefono: phone, via: "web" });
    return Response.json({ ok: true, name, accessCode });
  }

  if (body?.action === "change-code") {
    // El cliente personaliza su código (letras y números, 4-12 caracteres)
    const key = clientKey(request, phone);
    if (isBlocked(key)) return tooManyResponse();
    const current = normalizeCode(body?.code);
    const { data: client } = await db
      .from("clients")
      .select("id,name,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !client.access_code || client.access_code !== current) {
      recordFail(key);
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
    clearFails(key);
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
