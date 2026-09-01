"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

export default function BookingPage() {
  const [meta, setMeta] = useState(null);
  const [service, setService] = useState(null);
  const [employee, setEmployee] = useState(null);
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

  useEffect(() => {
    setSlot(null);
    setSlots(null);
    if (!service || !employee || !date) return;
    const params = new URLSearchParams({
      date,
      employeeId: employee.id,
      serviceId: service.id,
    });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setError("No se pudo consultar la disponibilidad"));
  }, [service, employee, date]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          employeeId: employee.id,
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
          const params = new URLSearchParams({
            date,
            employeeId: employee.id,
            serviceId: service.id,
          });
          const d = await fetch(`/api/availability?${params}`).then((r) => r.json());
          setSlots(d.slots ?? []);
          setSlot(null);
        }
      } else {
        setDone({ startsAt: data.startsAt, accessCode: data.accessCode });
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
        <SiteHeader active="reservar" />
        <main className="container">
          <div className="card" style={{ textAlign: "center" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.6rem" }}>✨ ¡Cita confirmada!</h2>
            <p style={{ fontSize: "1.05rem" }}>
              Te esperamos el <strong style={{ color: "var(--gold-strong)" }}>{when}</strong>
            </p>
            {done.accessCode && (
              <div className="code-box">
                <small>Tu código de cliente — guárdalo para consultar o cancelar tus citas</small>
                <span className="code">{done.accessCode}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/mis-citas">
                <button className="secondary">Ver mis citas</button>
              </a>
              <button onClick={() => window.location.reload()}>Hacer otra reserva</button>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader active="reservar" />
      <div className="hero">
        <h1>
          Tu estilo, <em>a un clic</em>
        </h1>
        <p>Reserva tu cita en menos de un minuto, sin llamadas ni esperas</p>
      </div>
      <main className="container">
        <form className="card" onSubmit={submit}>
          <div className="step-title">
            <span className="step-num">1</span>
            <h2 style={{ margin: 0 }}>Elige tu servicio</h2>
          </div>
          <div className="option-grid">
            {meta?.services?.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`option-card ${service?.id === s.id ? "selected" : ""}`}
                onClick={() => setService(s)}
              >
                <span className="name">{s.name}</span>
                <span className="meta">
                  {s.duration_min} min · <span className="price">{Number(s.price_eur).toFixed(2)} €</span>
                </span>
              </button>
            ))}
            {!meta && <p style={{ color: "var(--muted)" }}>Cargando servicios…</p>}
          </div>

          {service && (
            <>
              <div className="step-title">
                <span className="step-num">2</span>
                <h2 style={{ margin: 0 }}>¿Con quién?</h2>
              </div>
              <div className="pills">
                {meta?.employees?.map((emp) => (
                  <button
                    type="button"
                    key={emp.id}
                    className={`pill ${employee?.id === emp.id ? "selected" : ""}`}
                    onClick={() => setEmployee(emp)}
                  >
                    {emp.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {service && employee && (
            <>
              <div className="step-title">
                <span className="step-num">3</span>
                <h2 style={{ margin: 0 }}>Día y hora</h2>
              </div>
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
                  <label>Hora disponible</label>
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
            </>
          )}

          {slot && (
            <>
              <div className="step-title">
                <span className="step-num">4</span>
                <h2 style={{ margin: 0 }}>Tus datos</h2>
              </div>
              <label htmlFor="name">Nombre</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder="María García"
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
                placeholder="600 123 456"
              />
              <div className="summary">
                <strong>{service.name}</strong> con <strong>{employee.name}</strong> ·{" "}
                {new Date(slot.startsAt).toLocaleString("es-ES", {
                  timeZone: "Europe/Madrid",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {Number(service.price_eur).toFixed(2)} €
              </div>
              <div style={{ marginTop: 18 }}>
                <button type="submit" className="block" disabled={loading}>
                  {loading ? "Reservando…" : "Confirmar reserva ✨"}
                </button>
              </div>
            </>
          )}

          {error && <p className="msg-error">{error}</p>}
        </form>
      </main>
      <SiteFooter />
    </>
  );
}
