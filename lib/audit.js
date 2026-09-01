import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

// Registro de actividad (trazabilidad): cada acción relevante queda anotada
// con quién la hizo, qué pasó y sus detalles. Se consulta en Admin → Actividad.
// Es "best effort": si el registro falla, la acción principal no se rompe.

export async function logActivity(actor, action, details = {}) {
  try {
    await supabaseAdmin().from("activity_log").insert({
      actor, // 'cliente' | 'admin' | 'sistema'
      action, // p.ej. 'cita_creada', 'pedido_cancelado'
      details,
    });
  } catch {
    // nunca bloquear la operación principal por el log
  }
}
