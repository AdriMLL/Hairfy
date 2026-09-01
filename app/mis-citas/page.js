"use client";

import { useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MisCitasPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null); // { name, appointments }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function lookup(e) {
    e?.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/my-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo consultar");
      else setResult(data);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id) {
    if (!window.confirm("¿Seguro que quieres cancelar esta cita?")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/my-appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, appointmentId: id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo cancelar");
      else {
        setNotice("Cita cancelada. ¡Te esperamos en otra ocasión!");
        await lookup();
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const upcoming = result?.appointments?.filter(
    (a) => new Date(a.startsAt) > new Date() && a.status === "confirmed"
  );

  return (
    <>
      <SiteHeader active="mis-citas" />
      <div className="hero">
        <h1>
          Mis <em>citas</em>
        </h1>
        <p>Consulta tus próximas citas o cancélalas si no puedes venir</p>
      </div>
      <main className="container">
        {!result ? (
          <form className="card" onSubmit={lookup}>
            <label htmlFor="phone">Tu teléfono</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="600 123 456"
              required
              autoComplete="tel"
            />
            <label htmlFor="code">Tu código de cliente</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="HF-XXXX"
              required
              style={{ textTransform: "uppercase", letterSpacing: "2px" }}
            />
            <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>
              El código aparece al confirmar cada reserva. ¿Lo has perdido?
              Llámanos y te lo recordamos.
            </p>
            <button type="submit" className="block" disabled={loading}>
              {loading ? "Buscando…" : "Ver mis citas"}
            </button>
            {error && <p className="msg-error">{error}</p>}
          </form>
        ) : (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Hola, {result.name} 👋</h2>
            {notice && <p className="msg-ok">{notice}</p>}
            {error && <p className="msg-error">{error}</p>}

            {result.appointments.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No tienes citas registradas en los últimos 30 días. ¿Reservamos
                una?
              </p>
            ) : (
              <>
                {upcoming?.length === 0 && (
                  <p style={{ color: "var(--muted)" }}>
                    No tienes citas próximas confirmadas.
                  </p>
                )}
                <div className="appt-list">
                  {result.appointments.map((a) => (
                    <div
                      key={a.id}
                      className={`appt ${a.status === "cancelled" ? "cancelled" : ""}`}
                    >
                      <div>
                        <div className="when">{fmtWhen(a.startsAt)}</div>
                        <div className="what">
                          {a.service}
                          {a.price != null && (
                            <span style={{ color: "var(--muted)" }}>
                              {" "}
                              · {Number(a.price).toFixed(2)} €
                            </span>
                          )}
                        </div>
                        <div className="who">con {a.employee}</div>
                        {a.products?.length > 0 && (
                          <div className="who">
                            🛍️ {a.products.map((p) => `${p.name} x${p.quantity}`).join(", ")}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span
                          className={`badge ${a.status === "cancelled" ? "cancelled" : ""}`}
                        >
                          {a.status === "cancelled" ? "Cancelada" : "Confirmada"}
                        </span>
                        {a.cancellable && (
                          <button
                            className="danger small"
                            disabled={loading}
                            onClick={() => cancel(a.id)}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/">
                <button className="secondary">Reservar otra cita</button>
              </a>
              <button
                className="secondary"
                onClick={() => {
                  setResult(null);
                  setNotice("");
                  setError("");
                }}
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
