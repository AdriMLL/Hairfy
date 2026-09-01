"use client";

import { useCallback, useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, saveSession, clearSession } from "@/lib/session";
import { t, locale } from "@/lib/i18n";

// ---------- utilidades de fecha ----------

function dayLabel(iso) {
  const d = new Date(iso);
  const fmt = (x) =>
    x.toLocaleDateString(locale(), { timeZone: "Europe/Madrid", day: "numeric", month: "numeric" });
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (fmt(d) === fmt(today)) return t("my.today");
  if (fmt(d) === fmt(tomorrow)) return t("my.tomorrow");
  return d.toLocaleDateString(locale(), {
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

  // ---------- cambiar código / email ----------
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  async function changeEmail(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/client-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change-email",
          phone: session.phone,
          code: session.code,
          email: newEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo guardar el email");
      else {
        setResult((r) => ({ ...r, email: data.email }));
        setNotice(
          data.email
            ? `Email guardado: ${data.email}. Recibirás confirmaciones y recordatorios de tus citas.`
            : "Email eliminado."
        );
        setShowEmail(false);
        setNewEmail("");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

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

  if (!ready) return null;

  return (
    <>
      <SiteHeader active="mis-citas" />
      <div className="hero">
        <h1>
          {t("my.title1")} <em>{t("my.title2")}</em>
        </h1>
        <p>{t("my.sub")}</p>
      </div>
      <main className="container">
        {!ready ? (
          <div className="card"><p style={{ color: "var(--muted)" }}>{t("loading")}</p></div>
        ) : !session || !result ? (
          <div className="card">
            {error && <p className="msg-error" style={{ marginTop: 0 }}>{error}</p>}
            <ClientAuth
              onAuth={(s) => lookupWith(s.phone, s.code)}
              intro={t("auth.introBook")}
            />
          </div>
        ) : (
          <>
            {/* Cabecera del cliente */}
            <div className="card client-head">
              <div>
                <h2 style={{ margin: 0 }}>{t("my.hello", { name: result.name })}</h2>
                <div className="chips">
                  <span className="chip">📱 {session.phone}</span>
                  <button className="chip chip-btn" onClick={() => { setShowCode((s) => !s); setShowEmail(false); }} title="Ver o cambiar mi código">
                    🔑 {session.code}
                  </button>
                  <button
                    className="chip chip-btn"
                    onClick={() => {
                      setShowEmail((s) => !s);
                      setShowCode(false);
                      setNewEmail(result.email || "");
                    }}
                    title="Email para confirmaciones y recordatorios"
                  >
                    ✉️ {result.email || t("my.addEmail")}
                  </button>
                </div>
              </div>
              <div className="client-head-actions">
                <a href="/?tab=reservar"><button>{t("my.newAppt")}</button></a>
                <a href="/?tab=pedidos"><button className="secondary">{t("my.newOrder")}</button></a>
                <button className="secondary" onClick={exit}>{t("my.exit")}</button>
              </div>
            </div>

            {showCode && (
              <div className="card">
                <form onSubmit={changeCode}>
                  <h3 style={{ margin: "0 0 6px" }}>{t("my.codeTitle")}</h3>
                  <p style={{ color: "var(--muted)", margin: "0 0 4px", fontSize: "0.88rem" }}>
                    {t("my.codeHelp")}
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
                    <button type="submit" className="small" disabled={loading}>{t("my.save")}</button>
                    <button type="button" className="secondary small" onClick={() => setShowCode(false)}>{t("my.cancel")}</button>
                  </div>
                </form>
              </div>
            )}

            {showEmail && (
              <div className="card">
                <form onSubmit={changeEmail}>
                  <h3 style={{ margin: "0 0 6px" }}>{t("my.emailTitle")}</h3>
                  <p style={{ color: "var(--muted)", margin: "0 0 4px", fontSize: "0.88rem" }}>
                    {t("my.emailHelp")}
                  </p>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    maxLength={120}
                    placeholder="tu@email.com"
                    style={{ maxWidth: 320 }}
                  />
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" className="small" disabled={loading}>{t("my.save")}</button>
                    <button type="button" className="secondary small" onClick={() => setShowEmail(false)}>{t("my.cancel")}</button>
                  </div>
                </form>
              </div>
            )}

            {notice && <p className="msg-ok">{notice}</p>}
            {error && <p className="msg-error">{error}</p>}

            {/* Pestañas */}
            <div className="home-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "proximas"} className={`home-tab ${tab === "proximas" ? "active" : ""}`} onClick={() => setTab("proximas")}>
                {t("my.tabUpcoming")}{upcoming.length > 0 ? ` (${upcoming.length})` : ""}
              </button>
              <button role="tab" aria-selected={tab === "historial"} className={`home-tab ${tab === "historial" ? "active" : ""}`} onClick={() => setTab("historial")}>
                {t("my.tabHistory")}
              </button>
              <button role="tab" aria-selected={tab === "pedidos"} className={`home-tab ${tab === "pedidos" ? "active" : ""}`} onClick={() => setTab("pedidos")}>
                {t("my.tabOrders")}{pendingOrders > 0 ? ` (${pendingOrders})` : ""}
              </button>
            </div>

            {/* Próximas citas */}
            {tab === "proximas" && (
              <div className="appt-list">
                {upcoming.length === 0 && (
                  <div className="card empty-state">
                    <p>{t("my.emptyUpcoming")}</p>
                    <a href="/?tab=reservar"><button>{t("my.bookNow")}</button></a>
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
                      <div className="who">{t("my.with")} {a.employee}</div>
                      {a.products?.length > 0 && (
                        <div className="who">🛍️ {a.products.map((p) => `${p.name} x${p.quantity}`).join(", ")}</div>
                      )}
                    </div>
                    <div className="appt-actions">
                      {a.cancellable ? (
                        <button className="danger small" disabled={loading} onClick={() => cancelAppt(a.id)}>
                          {t("my.cancel")}
                        </button>
                      ) : (
                        <span className="who">{t("my.callToCancel")}</span>
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
                    <p>{t("my.emptyHistory")}</p>
                  </div>
                )}
                {history.map((a) => (
                  <div key={a.id} className={`appt ${a.status === "cancelled" ? "cancelled" : ""}`}>
                    <div className="appt-info">
                      <div className="when">
                        {new Date(a.startsAt).toLocaleDateString(locale(), {
                          timeZone: "Europe/Madrid",
                          day: "numeric",
                          month: "long",
                        })}{" "}
                        · {timeLabel(a.startsAt)}
                      </div>
                      <div className="what">{a.service}</div>
                      <div className="who">{t("my.with")} {a.employee}</div>
                    </div>
                    <div className="appt-actions">
                      {a.status === "cancelled" ? (
                        <span className="badge cancelled">{t("my.cancelled")}</span>
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
                          {t("my.rate")}
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
                          placeholder={t("my.ratePlaceholder")}
                          maxLength={400}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button type="submit" className="small" disabled={loading}>{t("my.rateSend")}</button>
                          <button type="button" className="secondary small" onClick={() => setReviewFor(null)}>
                            {t("my.rateNotNow")}
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
                    <p>{t("my.emptyOrders")}</p>
                    <a href="/?tab=pedidos"><button>{t("my.seeProducts")}</button></a>
                  </div>
                )}
                {orders.map((o) => (
                  <div key={o.id} className={`appt ${o.status === "cancelled" ? "cancelled" : ""}`}>
                    <div className="appt-info">
                      <div className="when">
                        {new Date(o.createdAt).toLocaleDateString(locale(), { day: "numeric", month: "long" })}{" "}
                        · {o.total.toFixed(2)} €
                      </div>
                      <div className="what">{o.items.map((it) => `${it.name} x${it.quantity}`).join(", ")}</div>
                      <div className="who">{t("my.orderPickup")}</div>
                    </div>
                    <div className="appt-actions">
                      <span className={`badge ${o.status === "cancelled" ? "cancelled" : ""}`}>
                        {o.status === "pending" ? t("my.orderPending") : o.status === "delivered" ? t("my.orderDelivered") : t("my.orderCancelled")}
                      </span>
                      {o.status === "pending" && (
                        <button className="danger small" disabled={loading} onClick={() => cancelOrder(o.id)}>
                          {t("my.cancel")}
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
