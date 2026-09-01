import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

// Comprueba que la petición trae un token de sesión válido de Supabase Auth.
// Solo el personal de la peluquería tiene usuario (los creas tú en Supabase),
// así que cualquier usuario autenticado es "admin".

export async function requireAdmin(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export function unauthorized() {
  return Response.json({ error: "No autorizado" }, { status: 401 });
}
