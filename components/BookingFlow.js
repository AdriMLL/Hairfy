"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, saveSession, clearSession } from "@/lib/session";
import { t, locale } from "@/lib/i18n";

// Flujo completo de reserva: identificarse -> servicio -> día/hora -> confirmar.
// Se muestra dentro de la pestaña "Reservar cita" del Inicio.
export function BookingFlow({ meta }) {
  const [service, setService] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const singleEmployee = meta?.employees?.length === 1;
  useEffect(() => {
    if (meta?.employees?.length === 1) setEmployee(meta.employees[0]);
  }, [meta]);

  const stepDay = singleEmployee ? 2 : 3;
  const stepData = stepDay + 1;

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
          code: session.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la reserva");
        if (res.status === 401) {
          // La sesión guardada ya no es válida (código cambiado, etc.)
          clearSession();
          setSession(null);
        }
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
    const when = new Date(done.startsAt).toLocaleString(locale(), {
      timeZone: "Europe/Madrid",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.6rem" }}>{t("book.doneTitle")}</h2>
        <p style={{ fontSize: "1.05rem" }}>
          {t("book.doneWhen")} <strong style={{ color: "var(--gold-strong)" }}>{when}</strong>
        </p>
        {session?.code && (
          <div className="code-box">
            <small>{t("book.codeNote")}</small>
            <span className="code">{session.code}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/mis-citas">
            <button className="secondary">{t("book.seeMine")}</button>
          </a>
          <button onClick={() => window.location.reload()}>{t("book.another")}</button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="card"><p style={{ color: "var(--muted)" }}>{t("loading")}</p></div>;
  }

  if (!session) {
    return (
      <div className="card">
        <ClientAuth
          onAuth={setSession}
          intro={t("auth.introBook")}
        />
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="topbar" style={{ marginBottom: 14 }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          {t("book.as")}{" "}
          <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong>
        </p>
        <button type="button" className="secondary small" onClick={logout}>
          {t("book.notme")}
        </button>
      </div>

      <div className="step-title" style={{ marginTop: 0 }}>
        <span className="step-num">1</span>
        <h2 style={{ margin: 0 }}>{t("book.step1")}</h2>
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
              {s.duration_min} {t("min")} · <span className="price">{Number(s.price_eur).toFixed(2)} €</span>
            </span>
          </button>
        ))}
        {!meta && <p style={{ color: "var(--muted)" }}>{t("loading")}</p>}
      </div>

      {service && !singleEmployee && (
        <>
          <div className="step-title">
            <span className="step-num">2</span>
            <h2 style={{ margin: 0 }}>{t("book.step2")}</h2>
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
            <h2 style={{ margin: 0 }}>{t("book.stepDay")}</h2>
          </div>
          {singleEmployee && (
            <p style={{ color: "var(--muted)", margin: "0 0 4px" }}>
              {t("book.servedBy")} <strong style={{ color: "var(--ink)" }}>{employee.name}</strong>
            </p>
          )}
          <label htmlFor="booking-date">{t("book.day")}</label>
          <input
            id="booking-date"
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          {slots && (
            <>
              <label>{t("book.hours")}</label>
              {slots.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>
                  {t("book.closed")}
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
                      {t("book.allBusy")}
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
            <h2 style={{ margin: 0 }}>{t("book.confirmTitle")}</h2>
          </div>
          <div className="summary">
            <strong>{service.name}</strong> {t("book.with")} <strong>{employee.name}</strong> ·{" "}
            {new Date(slot.startsAt).toLocaleString(locale(), {
              timeZone: "Europe/Madrid",
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
            <br />
            {t("book.price")}: <strong>{Number(service.price_eur).toFixed(2)} €</strong>
          </div>
          <div style={{ marginTop: 18 }}>
            <button type="submit" className="block" disabled={loading}>
              {loading ? t("book.booking") : t("book.confirm")}
            </button>
          </div>
        </>
      )}

      {error && <p className="msg-error">{error}</p>}
    </form>
  );
}
