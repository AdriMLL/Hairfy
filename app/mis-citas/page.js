"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Shop } from "@/components/Shop";
import { loadSession, saveSession, clearSession } from "@/lib/session";

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

  const lookupWith = useCallback(async (p, c) => {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/my-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, code: c }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo consultar");
      else {
        setResult(data);
        saveSession({ name: data.name, phone: p, code: c });
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function lookup(e) {
    e?.preventDefault();
    await lookupWith(phone, code);
  }

  // Si ya se identificó antes en este navegador, entramos directamente
  useEffect(() => {
    const s = loadSession();
    if (s) {
      setPhone(s.phone);
      setCode(s.code);
      lookupWith(s.phone, s.code);
    }
  }, [lookupWith]);

  const [reviewFor, setReviewFor] = useState(null); // id de cita a valorar
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [showShop, setShowShop] = useState(false);
  const [showCodeChange, setShowCodeChange] = useState(false);
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
        body: JSON.stringify({ action: "change-code", phone, code, newCode }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo cambiar el código");
      else {
        setCode(data.accessCode);
        saveSession({ name: data.name, phone, code: data.accessCode });
        setNotice(`Código actualizado: ${data.accessCode}. Úsalo a partir de ahora.`);
        setShowCodeChange(false);
        setNewCode("");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder(orderId) {
    if (!window.confirm("¿Cancelar este pedido?")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, orderId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo cancelar el pedido");
      else {
        setNotice("Pedido cancelado.");
        await lookup();
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function sendReview(e) {
    e.preventDefault();
    if (!rating) {
      setError("Elige una puntuación de 1 a 5 estrellas");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, appointmentId: reviewFor, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo enviar la valoración");
      else {
        setNotice("¡Gracias por tu valoración! Se publicará en cuanto la revisemos.");
        setReviewFor(null);
        setRating(0);
        setComment("");
        await lookup();
      }
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
              placeholder="FB-000000"
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
            <div className="topbar">
              <h2 style={{ margin: 0 }}>Hola, {result.name} 👋</h2>
              <button
                className="secondary small"
                onClick={() => {
                  clearSession();
                  setResult(null);
                  setPhone("");
                  setCode("");
                  setNotice("");
                  setError("");
                  setShowShop(false);
                }}
              >
                Salir
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <a href="/?tab=reservar">
                <button>📅 Pedir cita</button>
              </a>
              <button className="secondary" onClick={() => setShowShop((s) => !s)}>
                🛍️ {showShop ? "Cerrar tienda" : "Hacer pedido"}
              </button>
              <button className="secondary" onClick={() => setShowCodeChange((s) => !s)}>
                🔑 Mi código
              </button>
            </div>

            {showCodeChange && (
              <form onSubmit={changeCode} style={{ marginTop: 16, padding: 14, border: "1px dashed var(--gold-dark)", borderRadius: 12 }}>
                <p style={{ margin: "0 0 4px" }}>
                  Tu código actual: <strong style={{ color: "var(--gold-strong)", letterSpacing: 2 }}>{code}</strong>
                </p>
                <label htmlFor="new-code">Nuevo código (4-12 letras o números; el "FB-" se pone solo)</label>
                <input
                  id="new-code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  minLength={4}
                  maxLength={12}
                  placeholder="MARIA22"
                  style={{ textTransform: "uppercase", letterSpacing: "2px", maxWidth: 260 }}
                />
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button type="submit" className="small" disabled={loading}>Guardar código</button>
                  <button type="button" className="secondary small" onClick={() => setShowCodeChange(false)}>Cancelar</button>
                </div>
              </form>
            )}

            {notice && <p className="msg-ok">{notice}</p>}
            {error && <p className="msg-error">{error}</p>}

            {showShop && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: "0 0 10px" }}>Nuestros productos</h3>
                <Shop phone={phone} code={code} onOrdered={() => lookupWith(phone, code)} />
              </div>
            )}

            <h3 style={{ margin: "24px 0 4px" }}>Mis citas</h3>
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
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {a.reviewed ? (
                          <span className="badge">★ {a.myRating}/5 · Valorada</span>
                        ) : (
                          <span
                            className={`badge ${a.status === "cancelled" ? "cancelled" : ""}`}
                          >
                            {a.status === "cancelled" ? "Cancelada" : "Confirmada"}
                          </span>
                        )}
                        {a.cancellable && (
                          <button
                            className="danger small"
                            disabled={loading}
                            onClick={() => cancel(a.id)}
                          >
                            Cancelar
                          </button>
                        )}
                        {a.reviewable && reviewFor !== a.id && (
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
                        )}
                      </div>
                      {reviewFor === a.id && (
                        <form onSubmit={sendReview} style={{ width: "100%", marginTop: 10 }}>
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
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button type="submit" className="small" disabled={loading}>
                              Enviar valoración
                            </button>
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => setReviewFor(null)}
                            >
                              Ahora no
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {(result.orders?.length ?? 0) > 0 && (
              <>
                <h3 style={{ margin: "26px 0 4px" }}>Mis pedidos</h3>
                <div className="appt-list">
                  {result.orders.map((o) => (
                    <div key={o.id} className={`appt ${o.status === "cancelled" ? "cancelled" : ""}`}>
                      <div>
                        <div className="when">
                          {new Date(o.createdAt).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "long",
                          })}{" "}
                          · {o.total.toFixed(2)} €
                        </div>
                        <div className="what">
                          {o.items.map((it) => `${it.name} x${it.quantity}`).join(", ")}
                        </div>
                        <div className="who">Se recoge y paga en la peluquería</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={`badge ${o.status === "cancelled" ? "cancelled" : ""}`}>
                          {o.status === "pending"
                            ? "Pendiente de recoger"
                            : o.status === "delivered"
                              ? "Entregado"
                              : "Cancelado"}
                        </span>
                        {o.status === "pending" && (
                          <button
                            className="danger small"
                            disabled={loading}
                            onClick={() => cancelOrder(o.id)}
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
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
