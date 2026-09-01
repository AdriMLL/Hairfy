import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente de Supabase con la clave service_role. SOLO se usa en el servidor
// (rutas /api). Salta las reglas RLS, por eso las tablas pueden estar
// completamente cerradas al público.

let client = null;

export function supabaseAdmin() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Faltan las variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Next.js cachea los fetch() por defecto; los datos de la peluquería
        // deben leerse SIEMPRE frescos (citas, stock, horario...).
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}
