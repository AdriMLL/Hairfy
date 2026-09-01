import { BUSINESS } from "./config";

// --- Utilidades de zona horaria (sin librerías externas) ---

function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

// Convierte "YYYY-MM-DD" + "HH:MM" (hora local de la peluquería) a un Date UTC
export function localToUtc(dateStr, timeStr) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const offset = tzOffsetMs(naive, BUSINESS.timezone);
  let utc = new Date(naive.getTime() - offset);
  const offset2 = tzOffsetMs(utc, BUSINESS.timezone);
  if (offset2 !== offset) utc = new Date(naive.getTime() - offset2);
  return utc;
}

export function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

// --- Cálculo de huecos ---

// dateStr: "YYYY-MM-DD"; durationMin: duración del servicio;
// busy: citas existentes del empleado [{ starts_at, ends_at }] (ISO strings);
// hours: horario por día {0..6: [{open,close}]|null} (de la BD o config)
// Devuelve TODOS los huecos del día: [{ time, startsAt, endsAt, free }]
// (free=false si está ocupado; los huecos ya pasados no se incluyen)
export function buildSlots(dateStr, durationMin, busy, hours) {
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const windows = (hours ?? BUSINESS.hours)[dayOfWeek];
  if (!windows) return [];

  const now = Date.now();
  const step = BUSINESS.slotStepMinutes;
  const busyRanges = busy.map((b) => [
    new Date(b.starts_at).getTime(),
    new Date(b.ends_at).getTime(),
  ]);

  const slots = [];
  for (const w of windows) {
    const open = localToUtc(dateStr, w.open).getTime();
    const close = localToUtc(dateStr, w.close).getTime();
    for (let t = open; t + durationMin * 60000 <= close; t += step * 60000) {
      const end = t + durationMin * 60000;
      if (t <= now) continue; // no mostrar huecos pasados
      const overlaps = busyRanges.some(([bs, be]) => t < be && end > bs);
      const d = new Date(t);
      const hh = new Intl.DateTimeFormat("es-ES", {
        timeZone: BUSINESS.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
      slots.push({
        time: hh,
        startsAt: d.toISOString(),
        endsAt: new Date(end).toISOString(),
        free: !overlaps,
      });
    }
  }
  return slots;
}

// Comprueba que una fecha está dentro del rango permitido de reserva
export function isBookableDate(dateStr) {
  const today = new Date();
  const target = new Date(`${dateStr}T12:00:00Z`);
  const diffDays = (target - today) / 86400000;
  return diffDays > -1 && diffDays <= BUSINESS.maxDaysAhead;
}
