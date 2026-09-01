"use client";

import { useEffect, useState } from "react";

// Tienda de productos: elige cantidades y confirma el pedido.
// Requiere la sesión del cliente (phone + code). Los pedidos se pagan al recoger.
export function Shop({ phone, code, onOrdered }) {
  const [products, setProducts] = useState(null);
  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProducts() {
    try {
      const m = await fetch("/api/meta").then((r) => r.json());
      setProducts(m.products || []);
    } catch {
      setError("No se pudieron cargar los productos");
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function changeQty(product, delta) {
    setNotice("");
    setCart((c) => {
      const current = c[product.id] ?? 0;
      const next = Math.max(0, Math.min(Math.min(5, product.stock), current + delta));
      const copy = { ...c };
      if (next === 0) delete copy[product.id];
      else copy[product.id] = next;
      return copy;
    });
  }

  const items = (products || [])
    .filter((p) => cart[p.id])
    .map((p) => ({ ...p, qty: cart[p.id] }));
  const total = items.reduce((acc, it) => acc + Number(it.price_eur) * it.qty, 0);

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
          items: items.map((it) => ({ productId: it.id, quantity: it.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "No se pudo crear el pedido");
      else {
        setNotice("¡Pedido realizado! Recógelo y págalo en la peluquería.");
        setCart({});
        await loadProducts();
        onOrdered?.();
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (products === null) return <p style={{ color: "var(--muted)" }}>Cargando productos…</p>;
  if (products.length === 0)
    return <p style={{ color: "var(--muted)" }}>Ahora mismo no hay productos disponibles.</p>;

  return (
    <div>
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
      {items.length > 0 && (
        <>
          <div className="summary">
            {items.map((it) => `${it.name} x${it.qty}`).join(" · ")}
            <br />
            Total: <strong>{total.toFixed(2)} €</strong> · se paga al recoger en la peluquería
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={sendOrder} disabled={loading}>
              {loading ? "Enviando…" : "Confirmar pedido 🛍️"}
            </button>
          </div>
        </>
      )}
      {notice && <p className="msg-ok">{notice}</p>}
      {error && <p className="msg-error">{error}</p>}
    </div>
  );
}
