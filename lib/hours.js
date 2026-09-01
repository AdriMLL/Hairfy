import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import { BUSINESS } from "./config";

// Horario de apertura: se lee de la tabla `settings` (editable desde el
// panel admin). Si no existe o es inválido, se usa el de lib/config.js.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanitizeHours(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const v = raw[d] ?? raw[String(d)] ?? null;
    if (!Array.isArray(v) || v.length === 0) {
      out[d] = null;
      continue;
    }
    const ranges = [];
    for (const r of v.slice(0, 3)) {
      if (
        r &&
        typeof r.open === "string" &&
        typeof r.close === "string" &&
        TIME_RE.test(r.open) &&
        TIME_RE.test(r.close) &&
        r.open < r.close
      ) {
        ranges.push({ open: r.open, close: r.close });
      } else {
        return null; // horario inválido -> se rechaza entero
      }
    }
    out[d] = ranges.length ? ranges : null;
  }
  return out;
}

export async function getBusinessHours() {
  try {
    const { data } = await supabaseAdmin()
      .from("settings")
      .select("value")
      .eq("key", "business_hours")
      .maybeSingle();
    const clean = sanitizeHours(data?.value);
    if (clean) return clean;
  } catch {
    // ignorar y usar el horario por defecto
  }
  return BUSINESS.hours;
}
