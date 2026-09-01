"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { t, getLang, setLang, applyLangToDocument, LANGS } from "@/lib/i18n";

export function SiteHeader({ active }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    applyLangToDocument();
    setReady(true);
  }, []);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="logo-link" aria-label="Fennani Barbershop, inicio">
          <Logo />
        </Link>
        <nav className="site-nav">
          <Link href="/" className={active === "inicio" ? "active" : ""}>
            {ready ? t("nav.home") : "Inicio"}
          </Link>
          <Link href="/mis-citas" className={active === "mis-citas" ? "active" : ""}>
            {ready ? t("nav.myspace") : "Mis citas"}
          </Link>
          <select
            className="lang-select"
            aria-label="Idioma"
            value={ready ? getLang() : "es"}
            onChange={(e) => setLang(e.target.value)}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <footer className="site-footer">
      <p>
        ✂️ Peluquería Caballero Fennani Barbershop · C. Pedro de Valdivia, 3,
        Leganés ·{" "}
        <a href="tel:+34627556151" style={{ color: "var(--gold-strong)" }}>
          627 55 61 51
        </a>
      </p>
      <p style={{ marginTop: 6 }}>{ready ? t("footer.hours") : ""}</p>
    </footer>
  );
}
