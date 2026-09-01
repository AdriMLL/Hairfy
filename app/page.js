"use client";

import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { LandingSections } from "@/components/LandingSections";
import { BookingFlow } from "@/components/BookingFlow";
import { Shop } from "@/components/Shop";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, clearSession } from "@/lib/session";

function PedidosTab() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="card"><p style={{ color: "var(--muted)" }}>Cargando…</p></div>;
  }
  if (!session) {
    return (
      <div className="card">
        <ClientAuth
          onAuth={setSession}
          intro="Para hacer pedidos, identifícate: así quedan guardados a tu nombre y los recoges sin esperas."
        />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Pidiendo como{" "}
          <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong>
        </p>
        <button
          className="secondary small"
          onClick={() => {
            clearSession();
            setSession(null);
          }}
        >
          No soy yo
        </button>
      </div>
      <Shop phone={session.phone} code={session.code} />
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 16 }}>
        Los pedidos se recogen y pagan en la peluquería. Puedes verlos o
        cancelarlos en{" "}
        <a href="/mis-citas" style={{ color: "var(--gold-strong)" }}>Mis citas</a>.
      </p>
    </div>
  );
}

export default function HomePage() {
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState("reservar"); // reservar | pedidos

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "pedidos") setTab("pedidos");
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
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: "0.9rem" }}>
          🕤 Abierto de 9:30 a 21:00 · Martes cerrado · 📞{" "}
          <a href="tel:+34627556151" style={{ color: "var(--gold-strong)" }}>627 55 61 51</a>
        </p>
      </div>
      <main className="container">
        <div className="home-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "reservar"}
            className={`home-tab ${tab === "reservar" ? "active" : ""}`}
            onClick={() => setTab("reservar")}
          >
            📅 Reservar cita
          </button>
          <button
            role="tab"
            aria-selected={tab === "pedidos"}
            className={`home-tab ${tab === "pedidos" ? "active" : ""}`}
            onClick={() => setTab("pedidos")}
          >
            🛍️ Pedidos
          </button>
        </div>

        {tab === "reservar" ? <BookingFlow meta={meta} /> : <PedidosTab />}

        {meta?.business && <LandingSections meta={meta} />}
      </main>
      <SiteFooter />
    </>
  );
}
