// Configuración de la peluquería. Ajusta estos valores si cambia algo.

export const BUSINESS = {
  name: "Fennani Barbershop",
  fullName: "Peluquería Caballero Fennani Barbershop",
  timezone: "Europe/Madrid",

  // Datos de contacto y Google Maps
  phone: "627 55 61 51",
  phoneLink: "+34627556151",
  address: "C. Pedro de Valdivia, 3, 28911 Leganés, Madrid",
  city: "Leganés",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=PELUQUER%C3%8DA+CABALLERO+FENNANI+BARBERSHOP+Legan%C3%A9s",
  mapsEmbedUrl:
    "https://www.google.com/maps?q=PELUQUERIA+CABALLERO+FENNANI+BARBERSHOP,+C.+Pedro+de+Valdivia+3,+28911+Legan%C3%A9s&output=embed",
  googleRating: 5.0,
  googleReviewCount: 25,

  // Reseñas destacadas de Google (citas reales del perfil)
  googleReviews: [
    {
      author: "Ricardo",
      text: "5 estrellas son pocas para esta persona, cercana y muy buena gente. ¡Creo que encontré al mejor peluquero! Recomiendo tanto para corte de pelo como barba.",
    },
    {
      author: "Paco",
      text: "Vamos toda la familia a cortarnos el pelo. Yashim nos trata siempre fenomenal, lo recomiendo sin dudarlo.",
    },
    {
      author: "Edgar",
      text: "Ya es la segunda vez que voy y todo perfecto. Trato de 10. Recomendable al 100%.",
    },
  ],

  // Fotos del local (perfil de Google Maps)
  photos: [
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnueJV42DvEUaC5wRmSmAKI_kvUdvZ-X-kLab42daA-7xKJDMpwwpOCQmO8Ue9b1tL7n3N26cJU3l8JgwhfcYI-2EoX4yaEpFeY9Xj3EB1pla_MVzriHcRioWx3q-f7jSACv3wzwwUbb8qW=w960-h720-k-no",
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWlsRRy-wNZwhrUqqWZhPskafLjvR0BqOAUfJck9TPezLauLGpDMKAN4MPn201agopFlFKXVemLtCN7iU_OuKUeUrVCzYJWfPbDI94YsIRB09uueunG7dp7HGx9g1_DllMenhgA-Ba0o33Y=w960-h720-k-no",
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWlLGRgQvOm0rWuaPnnKrsg0MjkxEyeMItiLj2zVB0vjNsC1e867Vgz2GyUIKcU_WhxZ3bqhXNS0vx8MQ5v0CpUw2KaZFkRKFnnV1SF6qO4glzIzOpdMiX4ASphfcDM9BOqX51jO6m_6mZo=w960-h720-k-no",
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWk4Txdee7q46zlguRY7vBnr1bnE1kt1pf-l1eNeXxN0h7pevSGfpZTmh1HhRX3EHRxtiRXrzzXPScH538UQZDsw0shZb87BdY0HoxxZGeiVmM0mfiDl1IMVBjMGISjO_2hl3tQuOE7Nx8ve=w960-h720-k-no",
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWns8ZVfvdLXC8biSZVBoH3YEjgErTAw6gy3YyfnHqxpcj94Sf8SvIOwz8EtH4wh1heGuLXC923H_tuDOjsdy7dRlaKGDcz6GvmI70FToyh5jWMtLqiMGPXIHd-h0UTmtzawmd8MPKWJGx8=w960-h720-k-no",
    "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWlvsfQNKBJrlhKABGyHwoejxOaW4-2k5b5yi9ZIXMCEt2e5nGSShHOGf4YdeaHWz2O_yN7zCbrC-fo2vopaLVoVhaXyS365DVLq1wnoX-xixfVlBP8WTHg19U12i8oOBAAjJbnWx42nmoRX=w960-h720-k-no",
  ],

  // Horario POR DEFECTO (0=domingo ... 6=sábado). El horario real se
  // gestiona desde Admin -> Horario (tabla settings); esto es solo respaldo.
  hours: {
    0: [{ open: "09:30", close: "21:00" }], // domingo
    1: [{ open: "09:30", close: "21:00" }], // lunes
    2: null, // martes cerrado
    3: [{ open: "09:30", close: "21:00" }], // miércoles
    4: [{ open: "09:30", close: "21:00" }], // jueves
    5: [{ open: "09:30", close: "21:00" }], // viernes
    6: [{ open: "09:30", close: "21:00" }], // sábado
  },
  // Cada cuántos minutos empieza un hueco de cita
  slotStepMinutes: 30,
  // Con cuántos días de antelación se puede reservar como máximo
  maxDaysAhead: 30,
  // Hasta cuántas horas antes puede el cliente cancelar online
  cancelMinHours: 2,
};
