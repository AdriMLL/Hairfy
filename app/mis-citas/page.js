"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, saveSession, clearSession } from "@/lib/session";

// ---------- utilidades de fecha ----------

function dayLabel(iso) {
  const d = new Date(iso);
  const fmt = (x) =>
    x.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "numeric" });
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (fmt(d) === fmt(today)) return "Hoy";
  if (fmt(d) === fmt(tomorrow)) return "Mañana";
  return d.toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MisCitasPage() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState(null); // { name, appointments, orders }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("proximas"); // proximas | historial | pedidos

  const lookupWith = useCallback(async (p, c) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/my-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, code: c }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo consultar");
        clearSession();
        setSession(null);
      } else {
        setResult(data);
        const s = { name: data.name, phone: p, code: c };
        saveSession(s);
        setSession(s);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = loadSession();
    if (s) lookupWith(s.phone, s.code);
    setReady(true);
  }, [lookupWith]);

  function exit() {
    clearSession();
    setSession(null);
    setResult(null);
    setNotice("");
    setError("");
  }

  // ---------- acciones ----------

  async function action(fn, okMsg) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fn();
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo completar");
      else {
        if (okMsg) setNotice(okMsg);
        await lookupWith(session.phone, session.code);
        return true;
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
    return false;
  }

  async function cancelAppt(id) {
    if (!window.confirm("¿Seguro que quieres cancelar esta cita?")) return;
    await action(
      () =>
        fetch("/api/my-appointments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: session.phone, code: session.code, appointmentId: id }),
        }),
      "Cita cancelada. ¡Te esperamos en otra ocasión!"
    );
  }

  async function cancelOrder(id) {
    if (!window.confirm("¿Cancelar este pedido?")) return;
    await action(
      () =>
        fetch("/api/orders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: session.phone, code: session.code, orderId: id }),
        }),
      "Pedido cancelado."
    );
  }

  // ---------- valorar ----------
  const [reviewFor, setReviewFor] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  async function sendReview(e) {
    e.preventDefault();
    if (!rating) {
      setError("Elige una puntuación de 1 a 5 estrellas");
      return;
    }
    const ok = await action(
      () =>
        fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: session.phone,
            code: session.code,
            appointmentId: reviewFor,
            rating,
            comment,
          }),
        }),
      "¡Gracias por tu valoración! Se publicará en cuanto la revisemos."
    );
    if (ok) {
      setReviewFor(null);
      setRating(0);
      setComment("");
    }
  }

  // ---------- cambiar código ----------
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");

  async function changeCode(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/client-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-code",
          phone: session.phone,
          code: session.code,
          newCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo cambiar el código");
      else {
        const s = { ...session, code: data.accessCode };
        saveSession(s);
        setSession(s);
        setNotice(`Código actualizado: ${data.accessCode}`);
        setShowCode(false);
        setNewCode("");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // ---------- datos derivados ----------
  const now = Date.now();
  const upcoming = (result?.appointments || [])
    .filter((a) => a.status === "confirmed" && new Date(a.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const history = (result?.appointments || [])
    .filter((a) => !(a.status === "confirmed" && new Date(a.startsAt).getTime() > now))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const orders = result?.orders || [];
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  return (
    <>
      <SiteHeader active="mis-citas" />
      <div className="hero">
        <h1>
          Mi <em>espacio</em>
        </h1>
        <p>Tus citas, tus pedidos y tu código, todo en un sitio</p>
      </div>
      <main className="container">
        {!ready ? (
          <div className="card"><p style={{ color: "var(--muted)" }}>Cargando…</p></div>
        ) : !session || !result ? (
          <div className="card">
            {error && <p className="msg-error" style={{ marginTop: 0 }}>{error}</p>}
            <ClientAuth
              onAuth={(s) => lookupWith(s.phone, s.code)}
              intro="Entra con tu teléfono y tu código de cliente. ¿Primera vez? Crea tu ficha en 10 segundos."
            />
          </div>
        ) : (
          <>
            {/* Cabecera del cliente */}
            <div className="card client-head">
              <div>
                <h2 style={{ margin: 0 }}>Hola, {result.name} 👋</h2>
                <div className="chips">
                  <span className="chip">📱 {session.phone}</span>
                  <button className="chip chip-btn" onClick={() => setShowCode((s) => !s)} title="Ver o cambiar mi código">
                    🔑 {session.code}
                  </button>
                </div>
              </div>
              <div className="client-head-actions">
                <a href="/?tab=reservar"><button>📅 Nueva cita</button></a>
                <a href="/?tab=pedidos"><button className="secondary">🛍️ Nuevo pedido</button></a>
                <button className="secondary" onClick={exit}>Salir</button>
              </div>
            </div>

            {showCode && (
              <div className="card">
                <form onSubmit={changeCode}>
                  <h3 style={{ margin: "0 0 6px" }}>Cambiar mi código</h3>
                  <p style={{ color: "var(--muted)", margin: "0 0 4px", fontSize: "0.88rem" }}>
                    Es tu llave para entrar aquí: elige algo fácil de recordar
                    (4-12 letras o números; el "FB-" se pone solo).
                  </p>
                  <input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    required
                    minLength={4}
                    maxLength={12}
                    placeholder="MARIA22"
                    style={{ textTransform: "uppercase", letterSpacing: "2px", maxWidth: 260 }}
                  />
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" className="small" disabled={loading}>Guardar</button>
                    <button type="button" className="secondary small" onClick={() => setShowCode(false)}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            {notice && <p className="msg-ok">{notice}</p>}
            {error && <p className="msg-error">{error}</p>}

            {/* Pestañas */}
            <div className="home-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "proximas"} className={`home-tab ${tab === "proximas" ? "active" : ""}`} onClick={() => setTab("proximas")}>
                Próximas{upcoming.length > 0 ? ` (${upcoming.length})` : ""}
              </button>
              <button role="tab" aria-selected={tab === "historial"} className={`home-tab ${tab === "historial" ? "active" : ""}`} onClick={() => setTab("historial")}>
                Historial
              </button>
              <button role="tab" aria-selected={tab === "pedidos"} className={`home-tab ${tab === "pedidos" ? "active" : ""}`} onClick={() => setTab("pedidos")}>
                Pedidos{pendingOrders > 0 ? ` (${pendingOrders})` : ""}
              </button>
            </div>

            {/* Próximas citas */}
            {tab === "proximas" && (
              <div className="appt-list">
                {upcoming.length === 0 && (
                  <div className="card empty-state">
                    <p>No tienes ninguna cita próxima.</p>
                    <a href="/?tab=reservar"><button>📅 Reservar ahora</button></a>
                  </div>
                )}
                {upcoming.map((a) => (
                  <div key={a.id} className="appt">
                    <div className="appt-info">
                      <div className="when">
                        {dayLabel(a.startsAt)} · {timeLabel(a.startsAt)}
                      </div>
                      <div className="what">
                        {a.service}
                        {a.price != null && (
                          <span style={{ color: "var(--muted)" }}> · {Number(a.price).toFixed(2)} €</span>
                        )}
                      </div>
                      <div className="who">con {a.employee}</div>
                      {a.products?.length > 0 && (
                        <div className="who">🛍️ {a.products.map((p) => `${p.name} x${p.quantity}`).join(", ")}</div>
                      )}
                    </div>
                    <div className="appt-actions">
                      {a.cancellable ? (
                        <button className="danger small" disabled={loading} onClick={() => cancelAppt(a.id)}>
                          Cancelar
                        </button>
                      ) : (
                        <span className="who">Para cancelar, llámanos 📞</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Historial */}
            {tab === "historial" && (
              <div className="appt-list">
                {history.length === 0 && (
                  <div className="card empty-state">
                    <p>Aquí aparecerán tus citas pasadas.</p>
                  </div>
                )}
                {history.map((a) => (
                  <div key={a.id} className={`appt ${a.status === "cancelled" ? "cancelled" : ""}`}>
                    <div className="appt-info">
                      <div className="when">
                        {new Date(a.startsAt).toLocaleDateString("es-ES", {
                          timeZone: "Europe/Madrid",
                          day: "numeric",
                          month: "long",
                        })}{" "}
                        · {timeLabel(a.startsAt)}
                      </div>
                      <div className="what">{a.service}</div>
                      <div className="who">con {a.employee}</div>
                    </div>
                    <div className="appt-actions">
                      {a.status === "cancelled" ? (
                        <span className="badge cancelled">Cancelada</span>
                      ) : a.reviewed ? (
                        <span className="badge">★ {a.myRating}/5</span>
                      ) : a.reviewable && reviewFor !== a.id ? (
                        <button
                          className="secondary small"
                          onClick={() => {
                            setReviewFor(a.id);
                            setRating(0);
                            setComment("");
                          }}
                        >
                          ★ Valorar
                        </button>
                      ) : null}
                    </div>
                    {reviewFor === a.id && (
                      <form onSubmit={sendReview} className="review-form">
                        <div className="star-picker" role="radiogroup" aria-label="Puntuación">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              type="button"
                              key={n}
                              className={rating >= n ? "on" : ""}
                              onClick={() => setRating(n)}
                              aria-label={`${n} estrellas`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <input
                          style={{ marginTop: 8 }}
                          placeholder="Cuéntanos qué tal (opcional)"
                          maxLength={400}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button type="submit" className="small" disabled={loading}>Enviar</button>
                          <button type="button" className="secondary small" onClick={() => setReviewFor(null)}>
                            Ahora no
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pedidos */}
            {tab === "pedidos" && (
              <div className="appt-list">
                {orders.length === 0 && (
                  <div className="card empty-state">
                    <p>Todavía no has hecho ningún pedido.</p>
                    <a href="/?tab=pedidos"><button>🛍️ Ver productos</button></a>
                  </div>
                )}
                {orders.map((o) => (
                  <div key={o.id} className={`appt ${o.status === "cancelled" ? "cancelled" : ""}`}>
                    <div className="appt-info">
                      <div className="when">
                        {new Date(o.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}{" "}
                        · {o.total.toFixed(2)} €
                      </div>
                      <div className="what">{o.items.map((it) => `${it.name} x${it.quantity}`).join(", ")}</div>
                      <div className="who">Se recoge y paga en la peluquería</div>
                    </div>
                    <div className="appt-actions">
                      <span className={`badge ${o.status === "cancelled" ? "cancelled" : ""}`}>
                        {o.status === "pending" ? "Pendiente de recoger" : o.status === "delivered" ? "Entregado" : "Cancelado"}
                      </span>
                      {o.status === "pending" && (
                        <button className="danger small" disabled={loading} onClick={() => cancelOrder(o.id)}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
