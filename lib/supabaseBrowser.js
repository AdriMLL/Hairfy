"use client";

import { createClient } from "@supabase/supabase-js";

// Cliente de Supabase para el navegador, con la clave pública (anon).
// Solo se usa para el LOGIN del panel de administración. Las tablas están
// cerradas con RLS, así que esta clave no da acceso a ningún dato.

let client = null;

export function supabaseBrowser() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
