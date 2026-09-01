import "server-only";

// Límite de intentos y de acciones, en dos capas:
//  1) Memoria de la instancia (rápida, gratis).
//  2) Tabla `rate_limits` en Supabase (compartida entre TODAS las instancias
//     de Vercel), para que rotar IPs o esperar a un reinicio no diluya el límite.
// Si la tabla no existe o falla, se degrada a solo-memoria sin romper nada.
//
// Cubre dos cosas distintas:
//  - Fallos de autenticación (fuerza bruta del código):
//      por IP+teléfono  → 8 fallos / 10 min
//      por teléfono     → 30 fallos / 60 min (independiente de la IP)
//  - Acciones abusivas aunque sean "correctas" (spam de registros/reservas):
//      overActionLimit() cuenta acciones por clave (p. ej. por IP).

const memory = new Map(); // key -> { count, until }

const FAIL_MAX_IP = 8;
const FAIL_WINDOW_IP = 10 * 60 * 1000;
const FAIL_MAX_PHONE = 30;
const FAIL_WINDOW_PHONE = 60 * 60 * 1000;

function pruneMemory() {
  if (memory.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.until < now) memory.delete(k);
  }
}

function memBump(key, windowMs) {
  pruneMemory();
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now > b.until) {
    memory.set(key, { count: 1, until: now + windowMs });
    return 1;
  }
  b.count += 1;
  return b.count;
}

function memCount(key) {
  const b = memory.get(key);
  if (!b || Date.now() > b.until) return 0;
  return b.count;
}

// --- Capa compartida (Supabase). Todas fail-open: si algo falla, no bloquean. ---

async function dbBump(db, key, windowMs) {
  try {
    const now = new Date();
    const { data: row } = await db
      .from("rate_limits")
      .select("count,until")
      .eq("key", key)
      .maybeSingle();
    if (!row || new Date(row.until) < now) {
      const until = new Date(now.getTime() + windowMs).toISOString();
      await db.from("rate_limits").upsert({ key, count: 1, until });
      return 1;
    }
    const next = row.count + 1;
    await db.from("rate_limits").update({ count: next }).eq("key", key);
    return next;
  } catch {
    return 0;
  }
}

async function dbCount(db, key) {
  try {
    const { data: row } = await db
      .from("rate_limits")
      .select("count,until")
      .eq("key", key)
      .maybeSingle();
    if (!row || new Date(row.until) < new Date()) return 0;
    return row.count;
  } catch {
    return 0;
  }
}

async function dbClear(db, keys) {
  try {
    await db.from("rate_limits").delete().in("key", keys);
  } catch {
    /* fail-open */
  }
}

// --- API de autenticación (login / código) ---

export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "ip-desconocida"
  );
}

function failKeys(request, phone) {
  const ip = clientIp(request);
  return { ipKey: `f:${ip}|${phone}`, phoneKey: `fp:${phone}` };
}

// ¿Está bloqueado este intento? (memoria + tabla compartida)
export async function authBlocked(db, request, phone) {
  const { ipKey, phoneKey } = failKeys(request, phone);
  if (memCount(ipKey) >= FAIL_MAX_IP) return true;
  if (memCount(phoneKey) >= FAIL_MAX_PHONE) return true;
  const [a, b] = await Promise.all([dbCount(db, ipKey), dbCount(db, phoneKey)]);
  return a >= FAIL_MAX_IP || b >= FAIL_MAX_PHONE;
}

// Registra un fallo de autenticación en ambas capas
export async function authFail(db, request, phone) {
  const { ipKey, phoneKey } = failKeys(request, phone);
  memBump(ipKey, FAIL_WINDOW_IP);
  memBump(phoneKey, FAIL_WINDOW_PHONE);
  await Promise.all([
    dbBump(db, ipKey, FAIL_WINDOW_IP),
    dbBump(db, phoneKey, FAIL_WINDOW_PHONE),
  ]);
}

// Login correcto: limpia los contadores de esa IP+teléfono
export async function authOk(db, request, phone) {
  const { ipKey, phoneKey } = failKeys(request, phone);
  memory.delete(ipKey);
  memory.delete(phoneKey);
  await dbClear(db, [ipKey, phoneKey]);
}

// --- Límite de acciones (anti-spam) ---
// Cuenta la acción y devuelve true si se pasó del máximo en la ventana.
export async function overActionLimit(db, key, max, windowMs) {
  const local = memBump(`a:${key}`, windowMs);
  if (local > max) return true;
  const shared = await dbBump(db, `a:${key}`, windowMs);
  return shared > max;
}

export function tooManyResponse() {
  return Response.json(
    { error: "Demasiados intentos. Espera unos minutos y vuelve a probar." },
    { status: 429 }
  );
}
