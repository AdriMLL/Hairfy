"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, saveSession, clearSession } from "@/lib/session";

export default function ReservarPage() {
  const [meta, setMeta] = useState(null);
  const [service, setService] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m) => {
        setMeta(m);
        if (m?.employees?.length === 1) setEmployee(m.employees[0]);
      })
      .catch(() => setError("No se pudo cargar la información"));
  }, []);

  const singleEmployee = meta?.employees?.length === 1;
  const stepDay = singleEmployee ? 2 : 3;
  const stepData = stepDay + 1;

  // Para reservar hay que identificarse primero (como en Pedidos)
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  function logout() {
    clearSession();
    setSession(null);
  }

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
          name: session.name,
          phone: session.phone,
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
        if (data.accessCode && data.accessCode !== session.code) {
          saveSession({ ...session, code: data.accessCode });
          setSession({ ...session, code: data.accessCode });
        }
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
        <SiteHeader active="reservar" />
        <main className="container">
          <div className="card" style={{ textAlign: "center" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.6rem" }}>✨ ¡Cita confirmada!</h2>
            <p style={{ fontSize: "1.05rem" }}>
              Te esperamos el <strong style={{ color: "var(--gold-strong)" }}>{when}</strong>
            </p>
            {session?.code && (
              <div className="code-box">
                <small>Tu código de cliente — con él consultas o cancelas tus citas</small>
                <span className="code">{session.code}</span>
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
          Reserva tu <em>cita</em>
        </h1>
        <p>En menos de un minuto, sin llamadas ni esperas</p>
        {session && (
          <p style={{ color: "var(--muted)", marginTop: 12, fontSize: "0.9rem" }}>
            Hola, <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong> 👋{" "}
            <button type="button" className="secondary small" style={{ marginLeft: 6 }} onClick={logout}>
              No soy yo
            </button>
          </p>
        )}
      </div>
      <main className="container">
        {!ready ? (
          <div className="card"><p style={{ color: "var(--muted)" }}>Cargando…</p></div>
        ) : !session ? (
          <div className="card">
            <ClientAuth
              onAuth={setSession}
              intro="Antes de reservar, dinos quién eres: si ya tienes código entra con él, y si es tu primera vez crea tu ficha en 10 segundos."
            />
          </div>
        ) : (
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

          {service && !singleEmployee && (
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
                <span className="step-num">{stepDay}</span>
                <h2 style={{ margin: 0 }}>Día y hora</h2>
              </div>
              {singleEmployee && (
                <p style={{ color: "var(--muted)", margin: "0 0 4px" }}>
                  Te atenderá <strong style={{ color: "var(--ink)" }}>{employee.name}</strong>
                </p>
              )}
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
                  <label>Hora — las tachadas ya están reservadas</label>
                  {slots.length === 0 ? (
                    <p style={{ color: "var(--muted)" }}>
                      Ese día está cerrado o ya no quedan horas. Prueba otro día.
                    </p>
                  ) : (
                    <>
                      <div className="slots">
                        {slots.map((s) =>
                          s.free ? (
                            <button
                              type="button"
                              key={s.startsAt}
                              className={`slot ${slot?.startsAt === s.startsAt ? "selected" : ""}`}
                              onClick={() => setSlot(s)}
                            >
                              {s.time}
                            </button>
                          ) : (
                            <span key={s.startsAt} className="slot busy" title="Hora reservada">
                              {s.time}
                            </span>
                          )
                        )}
                      </div>
                      {slots.every((s) => !s.free) && (
                        <p style={{ color: "var(--muted)", marginTop: 10 }}>
                          Todas las horas de ese día están reservadas. Prueba otro día.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {slot && (
            <>
              <div className="step-title">
                <span className="step-num">{stepData}</span>
                <h2 style={{ margin: 0 }}>Confirma tu reserva</h2>
              </div>
              <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                Reservando como{" "}
                <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong>{" "}
                ({session.phone})
              </p>
              <div className="summary">
                <strong>{service.name}</strong> con <strong>{employee.name}</strong> ·{" "}
                {new Date(slot.startsAt).toLocaleString("es-ES", {
                  timeZone: "Europe/Madrid",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <br />
                Precio: <strong>{Number(service.price_eur).toFixed(2)} €</strong>
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
        )}
      </main>
      <SiteFooter />
    </>
  );
}
