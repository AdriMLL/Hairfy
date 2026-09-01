import "server-only";
import { randomInt } from "crypto";

// Código de cliente tipo "FB-482913" (FB = Fennani Barbershop).
// El cliente puede personalizarlo después desde "Mis citas".

export function generateAccessCode() {
  return `FB-${String(randomInt(1000000)).padStart(6, "0")}`;
}

export function normalizeCode(raw) {
  if (typeof raw !== "string") return "";
  let c = raw.toUpperCase().replace(/\s/g, "");
  if (!c) return "";
  if (c.startsWith("FB-")) return c;
  if (c.startsWith("FB")) return `FB-${c.slice(2)}`;
  return `FB-${c}`;
}

// Parte personalizable del código (lo que va después de "FB-")
export function validateCustomCode(raw) {
  if (typeof raw !== "string") return null;
  let c = raw.toUpperCase().replace(/\s/g, "");
  if (c.startsWith("FB-")) c = c.slice(3);
  if (!/^[A-Z0-9]{4,12}$/.test(c)) return null;
  return `FB-${c}`;
}

// Teléfono canónico: SOLO dígitos, sin prefijo 34.
// Así "600 11 22 33", "+34600112233" y "600112233" son el mismo cliente.
export function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0034")) digits = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith("34")) digits = digits.slice(2);
  return digits.slice(0, 15);
}
