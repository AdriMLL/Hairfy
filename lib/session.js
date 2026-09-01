"use client";

// Sesión ligera del cliente en este navegador (nombre, teléfono y código).
// Se guarda al reservar, registrarse o entrar en "Mis citas", para no tener
// que volver a escribir los datos (y evitar fichas duplicadas).

const KEY = "fennani_cliente";

export function loadSession() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && typeof s.phone === "string" && typeof s.code === "string") return s;
  } catch {
    // almacenamiento no disponible: seguimos sin sesión
  }
  return null;
}

export function saveSession(session) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        name: String(session.name || ""),
        phone: String(session.phone || ""),
        code: String(session.code || ""),
      })
    );
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignorar
  }
}
