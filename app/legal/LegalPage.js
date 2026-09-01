"use client";

import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

// Envoltorio común de las páginas legales (términos, privacidad, aviso legal)
export function LegalPage({ title, updated, children }) {
  return (
    <>
      <SiteHeader />
      <main className="container legal">
        <div className="card">
          <h1 style={{ marginTop: 0, fontSize: "1.7rem" }}>{title}</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: -6 }}>
            Última actualización: {updated}
          </p>
          {children}
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 28 }}>
            ¿Dudas sobre este documento? Escríbenos a{" "}
            <a href="mailto:fennanibarbershop@gmail.com" style={{ color: "var(--gold-strong)" }}>
              fennanibarbershop@gmail.com
            </a>{" "}
            o llámanos al <a href="tel:+34627556151" style={{ color: "var(--gold-strong)" }}>627 55 61 51</a>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
