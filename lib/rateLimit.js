import "server-only";

// Límite de intentos sencillo en memoria (por instancia del servidor).
// Protege el login por código y las consultas de clientes contra fuerza bruta.
// En Vercel cada instancia tiene su propio contador; aún así frena en seco
// los ataques básicos sin coste ni dependencias.

const buckets = new Map(); // key -> { fails: number, until: timestamp }

const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutos

function prune() {
  if (buckets.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.until < now) buckets.delete(k);
  }
}

export function isBlocked(key) {
  const b = buckets.get(key);
  if (!b) return false;
  if (Date.now() > b.until) {
    buckets.delete(key);
    return false;
  }
  return b.fails >= MAX_FAILS;
}

export function recordFail(key) {
  prune();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.until) {
    buckets.set(key, { fails: 1, until: now + WINDOW_MS });
  } else {
    b.fails += 1;
  }
}

export function clearFails(key) {
  buckets.delete(key);
}

export function clientKey(request, phone) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "ip-desconocida";
  return `${ip}|${phone}`;
}

export function tooManyResponse() {
  return Response.json(
    { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." },
    { status: 429 }
  );
}
