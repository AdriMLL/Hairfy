"use client";

import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { LandingSections } from "@/components/LandingSections";
import { loadSession } from "@/lib/session";

export default function HomePage() {
  const [meta, setMeta] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(loadSession());
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);

  return (
    <>
      <SiteHeader active="inicio" />
      <div className="hero">
        <h1>
          Fennani <em>Barbershop</em>
        </h1>
        <p>Tu barbería en Leganés · Corte, barba y buen trato</p>
        {meta?.business && (
          <a
            className="rating-badge"
            href={meta.business.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ★ {meta.business.googleRating.toFixed(1)} en Google ·{" "}
            {meta.business.googleReviewCount} reseñas
          </a>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
          <a href="/reservar"><button>📅 Reservar cita</button></a>
          <a href="/pedidos"><button className="secondary">🛍️ Hacer un pedido</button></a>
        </div>
        {session ? (
          <p style={{ color: "var(--muted)", marginTop: 14, fontSize: "0.9rem" }}>
            Hola de nuevo, <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong> 👋{" "}
            · <a href="/mis-citas" style={{ color: "var(--gold-strong)" }}>Ver mis citas</a>
          </p>
        ) : (
          <p style={{ color: "var(--muted)", marginTop: 14, fontSize: "0.9rem" }}>
            🕤 Abierto de 9:30 a 21:00 · Martes cerrado · 📞{" "}
            <a href="tel:+34627556151" style={{ color: "var(--gold-strong)" }}>627 55 61 51</a>
          </p>
        )}
      </div>
      <main className="container">
        {(meta?.services?.length ?? 0) > 0 && (
          <section className="landing-section" style={{ marginTop: 10 }}>
            <h2 className="section-title">Servicios y precios</h2>
            <div className="option-grid">
              {meta.services.map((s) => (
                <a key={s.id} href="/reservar" style={{ textDecoration: "none" }}>
                  <div className="option-card" style={{ height: "100%" }}>
                    <span className="name">{s.name}</span>
                    <span className="meta">
                      {s.duration_min} min ·{" "}
                      <span className="price">{Number(s.price_eur).toFixed(2)} €</span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {meta?.business && <LandingSections meta={meta} />}
      </main>
      <SiteFooter />
    </>
  );
}
