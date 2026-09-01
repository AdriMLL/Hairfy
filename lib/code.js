import "server-only";
import { randomInt } from "crypto";

// Código de cliente tipo "HF-7K3M". Sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateAccessCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `HF-${s}`;
}

export function normalizeCode(raw) {
  if (typeof raw !== "string") return "";
  const c = raw.toUpperCase().replace(/\s/g, "");
  return c.startsWith("HF-") ? c : c ? `HF-${c}` : "";
}

export function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^\d+ ]/g, "").trim().slice(0, 20);
}
