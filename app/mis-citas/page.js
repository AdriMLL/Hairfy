"use client";

import { useEffect, useState } from "react";
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

  const [reviewFor, setReviewFor] = useState(null); // id de cita a valorar
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  // --- Pedidos de productos ---
  const [products, setProducts] = useState([]);
  const [showShop, setShowShop] = useState(false);
  const [cart, setCart] = useState({}); // { productId: cantidad }

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m) => setProducts(m.products || []))
      .catch(() => {});
  }, []);

  function changeQty(product, delta) {
    setCart((c) => {
      const current = c[product.id] ?? 0;
      const next = Math.max(0, Math.min(Math.min(5, product.stock), current + delta));
      const copy = { ...c };
      if (next === 0) delete copy[product.id];
      else copy[product.id] = next;
      return copy;
    });
  }

  const cartItems = products
    .filter((p) => cart[p.id])
    .map((p) => ({ ...p, qty: cart[p.id] }));
  const cartTotal = cartItems.reduce((acc, it) => acc + Number(it.price_eur) * it.qty, 0);

  async function sendOrder() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          code,
          items: cartItems.map((it) => ({ productId: it.id, quantity: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo crear el pedido");
      else {
        setNotice("¡Pedido realizado! Recógelo y págalo en la peluquería.");
        setCart({});
        setShowShop(false);
        const m = await fetch("/api/meta").then((r) => r.json());
        setProducts(m.products || []);
        await lookup();
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
            <div className="topbar">
              <h2 style={{ margin: 0 }}>Hola, {result.name} 👋</h2>
              <button
                className="secondary small"
                onClick={() => {
                  setResult(null);
                  setNotice("");
                  setError("");
                  setShowShop(false);
                }}
              >
                Salir
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <a href={`/?name=${encodeURIComponent(result.name)}&phone=${encodeURIComponent(phone)}`}>
                <button>📅 Pedir cita</button>
              </a>
              {products.length > 0 && (
                <button className="secondary" onClick={() => setShowShop((s) => !s)}>
                  🛍️ {showShop ? "Cerrar tienda" : "Hacer pedido"}
                </button>
              )}
            </div>

            {notice && <p className="msg-ok">{notice}</p>}
            {error && <p className="msg-error">{error}</p>}

            {showShop && (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: "0 0 10px" }}>Nuestros productos</h3>
                <div className="option-grid">
                  {products.map((p) => {
                    const qty = cart[p.id] ?? 0;
                    return (
                      <div key={p.id} className={`option-card ${qty > 0 ? "selected" : ""}`}>
                        <span className="name">{p.name}</span>
                        {p.description && <span className="meta">{p.description}</span>}
                        <span className="meta">
                          <span className="price">{Number(p.price_eur).toFixed(2)} €</span>
                          {p.stock <= 3 && (
                            <span style={{ color: "var(--danger)" }}> · ¡quedan {p.stock}!</span>
                          )}
                        </span>
                        <div className="qty-row">
                          <button type="button" className="qty-btn" onClick={() => changeQty(p, -1)} disabled={qty === 0}>
                            −
                          </button>
                          <span className="qty-num">{qty}</span>
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => changeQty(p, 1)}
                            disabled={qty >= Math.min(5, p.stock)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {cartItems.length > 0 && (
                  <>
                    <div className="summary">
                      {cartItems.map((it) => `${it.name} x${it.qty}`).join(" · ")}
                      <br />
                      Total: <strong>{cartTotal.toFixed(2)} €</strong> · se paga al recoger
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button onClick={sendOrder} disabled={loading}>
                        {loading ? "Enviando…" : "Confirmar pedido 🛍️"}
                      </button>
                    </div>
                  </>
                )}
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
