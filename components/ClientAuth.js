"use client";

import { useState } from "react";
import { saveSession } from "@/lib/session";

// Widget de identificación del cliente: entrar con código o crear ficha nueva.
// Al terminar llama a onAuth({ name, phone, code }).
export function ClientAuth({ onAuth, intro }) {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState(null);
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
            : { action: "register", name, phone }
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
        setNewCode(data.accessCode);
        const session = { name: data.name, phone, code: data.accessCode };
        saveSession(session);
        onAuth(session);
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
        <p className="msg-ok">¡Ficha creada, {name}!</p>
        <div className="code-box">
          <small>Tu código de cliente — guárdalo para entrar la próxima vez</small>
          <span className="code">{newCode}</span>
        </div>
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
          Ya tengo código
        </button>
        <button
          type="button"
          className={`pill ${mode === "register" ? "selected" : ""}`}
          onClick={() => { setMode("register"); setError(""); }}
        >
          Soy nuevo
        </button>
      </div>

      {mode === "register" && (
        <>
          <label>Tu nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" placeholder="María García" />
        </>
      )}
      <label>Tu teléfono</label>
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={9} maxLength={20} autoComplete="tel" placeholder="600 123 456" />
      {mode === "login" && (
        <>
          <label>Tu código de cliente</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="FB-000000" style={{ textTransform: "uppercase", letterSpacing: "2px" }} />
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={loading}>
          {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear mi ficha"}
        </button>
      </div>
      {error && <p className="msg-error">{error}</p>}
    </form>
  );
}
