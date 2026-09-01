"use client";

import { useState } from "react";
import { saveSession } from "@/lib/session";
import { t } from "@/lib/i18n";

// Widget de identificación del cliente: entrar con código o crear ficha nueva.
// Al terminar llama a onAuth({ name, phone, code }).
export function ClientAuth({ onAuth, intro }) {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState(null);
  const [pendingSession, setPendingSession] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/client-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { action: "login", phone, code }
            : { action: "register", name, phone, email }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo completar");
      } else if (mode === "login") {
        const session = { name: data.name, phone, code };
        saveSession(session);
        onAuth(session);
      } else {
        // Ficha creada: enseñamos el código antes de continuar
        const session = { name: data.name, phone, code: data.accessCode };
        saveSession(session);
        setNewCode(data.accessCode);
        setPendingSession(session);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (newCode) {
    return (
      <div>
        <p className="msg-ok">{t("auth.created", { name })}</p>
        <div className="code-box">
          <small>{t("auth.keepCode")}</small>
          <span className="code">{newCode}</span>
        </div>
        <button className="block" onClick={() => onAuth(pendingSession)}>
          {t("auth.continue")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {intro && <p style={{ color: "var(--muted)", marginTop: 0 }}>{intro}</p>}
      <div className="pills" style={{ marginBottom: 4 }}>
        <button
          type="button"
          className={`pill ${mode === "login" ? "selected" : ""}`}
          onClick={() => { setMode("login"); setError(""); }}
        >
          {t("auth.haveCode")}
        </button>
        <button
          type="button"
          className={`pill ${mode === "register" ? "selected" : ""}`}
          onClick={() => { setMode("register"); setError(""); }}
        >
          {t("auth.new")}
        </button>
      </div>

      {mode === "register" && (
        <>
          <label>{t("auth.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" placeholder="María García" />
        </>
      )}
      <label>{t("auth.phone")}</label>
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={9} maxLength={20} autoComplete="tel" placeholder="600 123 456" />
      {mode === "register" && (
        <>
          <label>{t("auth.email")}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" placeholder="maria@email.com" />
        </>
      )}
      {mode === "login" && (
        <>
          <label>{t("auth.code")}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="FB-000000" style={{ textTransform: "uppercase", letterSpacing: "2px" }} />
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={loading}>
          {loading ? t("auth.wait") : mode === "login" ? t("auth.enter") : t("auth.create")}
        </button>
      </div>
      {error && <p className="msg-error">{error}</p>}
    </form>
  );
}
