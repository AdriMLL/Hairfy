// Configuración de la peluquería. Ajusta estos valores a tu horario real.

export const BUSINESS = {
  name: "Hairfy",
  timezone: "Europe/Madrid",
  // Horario por día de la semana (0 = domingo ... 6 = sábado).
  // null = cerrado. Horas en formato "HH:MM" (hora local de la peluquería).
  hours: {
    0: null, // domingo
    1: null, // lunes
    2: [{ open: "09:30", close: "13:30" }, { open: "16:00", close: "20:00" }], // martes
    3: [{ open: "09:30", close: "13:30" }, { open: "16:00", close: "20:00" }], // miércoles
    4: [{ open: "09:30", close: "13:30" }, { open: "16:00", close: "20:00" }], // jueves
    5: [{ open: "09:30", close: "13:30" }, { open: "16:00", close: "20:00" }], // viernes
    6: [{ open: "09:00", close: "14:00" }], // sábado
  },
  // Cada cuántos minutos empieza un hueco de cita
  slotStepMinutes: 30,
  // Con cuántos días de antelación se puede reservar como máximo
  maxDaysAhead: 30,
};
