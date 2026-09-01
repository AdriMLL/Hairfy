"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [session, setSession] = useState(undefined); // undefined = cargando

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <main className="container"><p>Cargando…</p></main>;
  }
  return session ? <Dashboard session={session} /> : <Login />;
}

// ---------- Login ----------

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) setError("Email o contraseña incorrectos");
    setLoading(false);
  }

  return (
    <>
      <header className="site"><h1>Hairfy · Administración</h1></header>
      <main className="container" style={{ maxWidth: 420 }}>
        <form className="card" onSubmit={submit}>
          <h2>Iniciar sesión</h2>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
          </div>
          {error && <p className="msg-error">{error}</p>}
        </form>
      </main>
    </>
  );
}

// ---------- Panel ----------

function Dashboard({ session }) {
  const [tab, setTab] = useState("agenda");

  const api = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`/api/admin/${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      return data;
    },
    [session]
  );

  return (
    <>
      <header className="site">
        <div className="container topbar" style={{ padding: 0 }}>
          <h1>Hairfy · Administración</h1>
          <button className="secondary small" onClick={() => supabaseBrowser().auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="container">
        <div className="tabs">
          {[
            ["agenda", "Agenda"],
            ["services", "Servicios"],
            ["employees", "Empleados"],
            ["clients", "Clientes"],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "agenda" && <Agenda api={api} />}
        {tab === "services" && <Services api={api} />}
        {tab === "employees" && <Employees api={api} />}
        {tab === "clients" && <Clients api={api} />}
      </main>
    </>
  );
}

function useList(api, path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api(path)
      .then((d) => setData(d.data))
      .catch((e) => setError(e.message));
  }, [api, path]);
  useEffect(reload, [reload]);
  return { data, error, setError, reload };
}

// ---------- Agenda ----------

function Agenda({ api }) {
  const [date, setDate] = useState(todayStr());
  const { data, error, setError, reload } = useList(api, `appointments?date=${date}`);

  async function setStatus(id, status) {
    try {
      await api("appointments", { method: "PATCH", body: JSON.stringify({ id, status }) });
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString("es-ES", {
      timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="card">
      <div className="row">
        <div>
          <label htmlFor="agenda-date">Día</label>
          <input id="agenda-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {error && <p className="msg-error">{error}</p>}
      {!data ? (
        <p>Cargando…</p>
      ) : data.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 16 }}>No hay citas este día.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Hora</th><th>Cliente</th><th>Teléfono</th><th>Servicio</th><th>Profesional</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} style={a.status === "cancelled" ? { opacity: 0.55 } : undefined}>
                <td>{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}</td>
                <td>{a.clients?.name}</td>
                <td>{a.clients?.phone}</td>
                <td>{a.services?.name}</td>
                <td>{a.employees?.name}</td>
                <td>
                  <span className={`badge ${a.status === "cancelled" ? "cancelled" : ""}`}>
                    {a.status === "cancelled" ? "Cancelada" : "Confirmada"}
                  </span>
                </td>
                <td>
                  {a.status === "confirmed" ? (
                    <button className="danger small" onClick={() => setStatus(a.id, "cancelled")}>
                      Cancelar
                    </button>
                  ) : (
                    <button className="secondary small" onClick={() => setStatus(a.id, "confirmed")}>
                      Reactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Servicios ----------

function Services({ api }) {
  const { data, error, setError, reload } = useList(api, "services");
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState("");

  async function add(e) {
    e.preventDefault();
    try {
      await api("services", {
        method: "POST",
        body: JSON.stringify({ name, duration_min: Number(duration), price_eur: Number(price) }),
      });
      setName(""); setPrice("");
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function toggle(s) {
    try {
      await api("services", { method: "PATCH", body: JSON.stringify({ id: s.id, active: !s.active }) });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="card">
      <h2>Servicios</h2>
      <form className="row" onSubmit={add}>
        <div>
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>Duración (min)</label>
          <input type="number" min="5" max="480" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required />
        </div>
        <div>
          <label>Precio (€)</label>
          <input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button type="submit">Añadir</button>
        </div>
      </form>
      {error && <p className="msg-error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>Nombre</th><th>Duración</th><th>Precio</th><th>Visible</th><th></th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.duration_min} min</td>
                <td>{Number(s.price_eur).toFixed(2)} €</td>
                <td>{s.active ? "Sí" : "No"}</td>
                <td>
                  <button className="secondary small" onClick={() => toggle(s)}>
                    {s.active ? "Ocultar" : "Mostrar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Empleados ----------

function Employees({ api }) {
  const { data, error, setError, reload } = useList(api, "employees");
  const [name, setName] = useState("");

  async function add(e) {
    e.preventDefault();
    try {
      await api("employees", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function toggle(emp) {
    try {
      await api("employees", { method: "PATCH", body: JSON.stringify({ id: emp.id, active: !emp.active }) });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="card">
      <h2>Empleados</h2>
      <form className="row" onSubmit={add}>
        <div>
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button type="submit">Añadir</button>
        </div>
      </form>
      {error && <p className="msg-error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>Nombre</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {data.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>{emp.active ? "Sí" : "No"}</td>
                <td>
                  <button className="secondary small" onClick={() => toggle(emp)}>
                    {emp.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Clientes ----------

function Clients({ api }) {
  const { data, error } = useList(api, "clients");
  const [q, setQ] = useState("");

  const filtered = (data || []).filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  );

  return (
    <div className="card">
      <h2>Clientes</h2>
      <label htmlFor="client-search">Buscar</label>
      <input id="client-search" placeholder="Nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="msg-error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Cliente desde</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>{new Date(c.created_at).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
