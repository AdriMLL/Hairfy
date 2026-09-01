"use client";

import { useEffect, useMemo, useState } from "react";

export default function BookingPage() {
  const [meta, setMeta] = useState(null);
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError("No se pudo cargar la información"));
  }, []);

  const { minDate, maxDate } = useMemo(() => {
    const fmt = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const max = new Date(now.getTime() + (meta?.maxDaysAhead ?? 30) * 86400000);
    return { minDate: fmt(now), maxDate: fmt(max) };
  }, [meta]);

  // Cargar huecos cuando hay servicio + empleado + fecha
  useEffect(() => {
    setSlot(null);
    setSlots(null);
    if (!serviceId || !employeeId || !date) return;
    const params = new URLSearchParams({ date, employeeId, serviceId });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setError("No se pudo consultar la disponibilidad"));
  }, [serviceId, employeeId, date]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          employeeId,
          date,
          startsAt: slot.startsAt,
          name,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la reserva");
        if (res.status === 409) {
          // El hueco se ocupó: recargar disponibilidad
          const params = new URLSearchParams({ date, employeeId, serviceId });
          const d = await fetch(`/api/availability?${params}`).then((r) => r.json());
          setSlots(d.slots ?? []);
          setSlot(null);
        }
      } else {
        setDone({ startsAt: data.startsAt });
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const when = new Date(done.startsAt).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <>
        <header className="site">
          <h1>{meta?.businessName ?? "Hairfy"}</h1>
        </header>
        <main className="container">
          <div className="card">
            <h2>✅ ¡Cita confirmada!</h2>
            <p>
              Te esperamos el <strong>{when}</strong>.
            </p>
            <p style={{ color: "var(--muted)" }}>
              Si no puedes venir, llámanos para cancelar o cambiar la cita.
            </p>
            <button onClick={() => window.location.reload()}>Hacer otra reserva</button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="site">
        <h1>{meta?.businessName ?? "Hairfy"}</h1>
        <p>Reserva tu cita online</p>
      </header>
      <main className="container">
        <form className="card" onSubmit={submit}>
          <h2>1. Elige tu cita</h2>

          <label htmlFor="service">Servicio</label>
          <select
            id="service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            required
          >
            <option value="">— Elige un servicio —</option>
            {meta?.services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_min} min · {Number(s.price_eur).toFixed(2)} €
              </option>
            ))}
          </select>

          <label htmlFor="employee">Profesional</label>
          <select
            id="employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
          >
            <option value="">— Elige profesional —</option>
            {meta?.employees?.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>

          <label htmlFor="date">Día</label>
          <input
            id="date"
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          {slots && (
            <>
              <label>Hora</label>
              {slots.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>
                  No quedan huecos ese día (o está cerrado). Prueba otro día.
                </p>
              ) : (
                <div className="slots">
                  {slots.map((s) => (
                    <button
                      type="button"
                      key={s.startsAt}
                      className={`slot ${slot?.startsAt === s.startsAt ? "selected" : ""}`}
                      onClick={() => setSlot(s)}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {slot && (
            <>
              <h2 style={{ marginTop: 24 }}>2. Tus datos</h2>
              <label htmlFor="name">Nombre</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
              <label htmlFor="phone">Teléfono</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                minLength={9}
                maxLength={20}
                autoComplete="tel"
              />
              <div style={{ marginTop: 16 }}>
                <button type="submit" disabled={loading}>
                  {loading ? "Reservando…" : "Confirmar reserva"}
                </button>
              </div>
            </>
          )}

          {error && <p className="msg-error">{error}</p>}
        </form>
      </main>
    </>
  );
}
