"use client";

import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Shop } from "@/components/Shop";
import { ClientAuth } from "@/components/ClientAuth";
import { loadSession, clearSession } from "@/lib/session";

export default function PedidosPage() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  return (
    <>
      <SiteHeader active="pedidos" />
      <div className="hero">
        <h1>
          Nuestros <em>productos</em>
        </h1>
        <p>Haz tu pedido online y recógelo en la peluquería (se paga allí)</p>
      </div>
      <main className="container">
        <div className="card">
          {!ready ? (
            <p style={{ color: "var(--muted)" }}>Cargando…</p>
          ) : session ? (
            <>
              <div className="topbar" style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>
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
                Puedes ver y cancelar tus pedidos en{" "}
                <a href="/mis-citas" style={{ color: "var(--gold-strong)" }}>Mis citas</a>.
              </p>
            </>
          ) : (
            <ClientAuth
              onAuth={setSession}
              intro="Para hacer pedidos, identifícate: así quedan guardados a tu nombre y los recoges sin esperas."
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
