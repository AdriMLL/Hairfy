import "server-only";
import { timingSafeEqual, createHash } from "crypto";

// Comparación de secretos en tiempo constante (códigos de cliente, CRON_SECRET).
// Se hashean ambos valores para igualar longitudes sin filtrar información.
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Escapa texto que va dentro de HTML (plantillas de email)
export function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
