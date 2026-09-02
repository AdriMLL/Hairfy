"use client";

import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { LandingSections } from "@/components/LandingSections";
import { BookingFlow } from "@/components/BookingFlow";
import { Shop } from "@/components/Shop";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, clearSession } from "@/lib/session";
import { t } from "@/lib/i18n";

function PedidosTab() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="card"><p style={{ color: "var(--muted)" }}>{t("loading")}</p></div>;
  }
  if (!session) {
    return (
      <div className="card">
        <ClientAuth
          onAuth={setSession}
          intro={t("auth.introShop")}
        />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          {t("shop.orderingAs")}{" "}
          <strong style={{ color: "var(--gold-strong)" }}>{session.name}</strong>
        </p>
        <button
          className="secondary small"
          onClick={() => {
            clearSession();
            setSession(null);
          }}
        >
          {t("book.notme")}
        </button>
      </div>
      <Shop phone={session.phone} code={session.code} />
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 16 }}>
        {t("shop.info")} {t("shop.manage")}{" "}
        <a href="/mis-citas" style={{ color: "var(--gold-strong)" }}>Mis citas</a>.
      </p>
    </div>
  );
}

export default function HomePage() {
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState("nosotros"); // nosotros (por defecto) | reservar | pedidos
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (["reservar", "pedidos", "nosotros"].includes(t)) setTab(t);
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  return (
    <>
      <SiteHeader active="inicio" />
      <div className="hero">
        <h1>
          Fennani <em>Barbershop</em>
        </h1>
        <p>{t("hero.tagline")}</p>
        {meta?.business && (
          <a
            className="rating-badge"
            href={meta.business.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ★ {meta.business.googleRating.toFixed(1)}{" "}
            {t("hero.google", { n: meta.business.googleReviewCount })}
          </a>
        )}
        <p style={{ color: "var(--muted)", marginTop: 14, fontSize: "0.9rem" }}>
          🕤 {t("hero.open")} · 📞{" "}
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
            {t("tab.book")}
          </button>
          <button
            role="tab"
            aria-selected={tab === "nosotros"}
            className={`home-tab ${tab === "nosotros" ? "active" : ""}`}
            onClick={() => setTab("nosotros")}
          >
            {t("tab.about")}
          </button>
          <button
            role="tab"
            aria-selected={tab === "pedidos"}
            className={`home-tab ${tab === "pedidos" ? "active" : ""}`}
            onClick={() => setTab("pedidos")}
          >
            {t("tab.orders")}
          </button>
        </div>

        {tab === "reservar" && <BookingFlow meta={meta} />}
        {tab === "pedidos" && <PedidosTab />}
        {tab === "nosotros" &&
          (meta?.business ? (
            <LandingSections meta={meta} />
          ) : (
            <div className="card"><p style={{ color: "var(--muted)" }}>{t("loading")}</p></div>
          ))}
      </main>
      <SiteFooter />
    </>
  );
}
