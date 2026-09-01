import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAccessCode, normalizeCode, normalizePhone } from "@/lib/code";

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
    const code = normalizeCode(body?.code);
    if (!code) return Response.json({ error: "Escribe tu código" }, { status: 400 });
    const { data: client } = await db
      .from("clients")
      .select("name,access_code")
      .eq("phone", phone)
      .maybeSingle();
    if (!client || !client.access_code || client.access_code !== code) {
      return Response.json({ error: "Teléfono o código incorrectos" }, { status: 401 });
    }
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
    return Response.json({ ok: true, name, accessCode });
  }

  return Response.json({ error: "Acción desconocida" }, { status: 400 });
}
