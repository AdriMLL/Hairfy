"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Logo } from "@/components/Logo";

function AdminHeader({ children }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <span className="logo-link">
          <Logo />
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Administración</span>
          {children}
        </div>
      </div>
    </header>
  );
}

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
      <AdminHeader />
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
      <AdminHeader>
        <button className="secondary small" onClick={() => supabaseBrowser().auth.signOut()}>
          Cerrar sesión
        </button>
      </AdminHeader>
      <main className="container" style={{ maxWidth: 960 }}>
        <div className="tabs">
          {[
            ["agenda", "Agenda"],
            ["stats", "Estadísticas"],
            ["services", "Servicios"],
            ["products", "Productos"],
            ["employees", "Empleados"],
            ["clients", "Clientes"],
            ["gallery", "Galería"],
            ["reviews", "Reseñas"],
            ["horario", "Horario"],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "agenda" && <Agenda api={api} />}
        {tab === "stats" && <Stats api={api} />}
        {tab === "services" && <Services api={api} />}
        {tab === "products" && <Products api={api} />}
        {tab === "employees" && <Employees api={api} />}
        {tab === "clients" && <Clients api={api} />}
        {tab === "gallery" && <Gallery api={api} />}
        {tab === "reviews" && <Reviews api={api} />}
        {tab === "horario" && <Horario api={api} />}
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
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hora</th><th>Cliente</th><th>Teléfono</th><th>Servicio</th><th>Productos</th><th>Profesional</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} style={a.status === "cancelled" ? { opacity: 0.55 } : undefined}>
                <td>{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}</td>
                <td>{a.clients?.name}</td>
                <td>{a.clients?.phone}</td>
                <td>{a.services?.name}</td>
                <td style={{ color: "var(--muted)" }}>
                  {(a.appointment_products || [])
                    .map((p) => `${p.products?.name} x${p.quantity}`)
                    .join(", ") || "—"}
                </td>
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
        </div>
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

// ---------- Estadísticas ----------

function Stats({ api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("stats")
      .then((d) => setData(d.data))
      .catch((e) => setError(e.message));
  }, [api]);

  if (error) return <div className="card"><p className="msg-error">{error}</p></div>;
  if (!data) return <div className="card"><p>Calculando…</p></div>;

  const maxCount = Math.max(1, ...data.weekly.map((w) => w.count));
  const fmtWeek = (iso) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  return (
    <>
      <div className="card">
        <h2>Últimas {data.weeks} semanas</h2>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="stat-box">
            <div className="stat-num">{data.totalAppointments}</div>
            <div className="stat-label">citas confirmadas</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{data.totalRevenue.toFixed(0)} €</div>
            <div className="stat-label">ingresos estimados (servicios)</div>
          </div>
        </div>
        <div className="bars">
          {data.weekly.map((w) => (
            <div key={w.weekStart} className="bar-row">
              <span className="bar-label">Sem. {fmtWeek(w.weekStart)}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(w.count / maxCount) * 100}%` }} />
              </div>
              <span className="bar-value">{w.count} citas · {w.revenue.toFixed(0)} €</span>
            </div>
          ))}
          {data.weekly.length === 0 && (
            <p style={{ color: "var(--muted)" }}>Aún no hay citas confirmadas en este periodo.</p>
          )}
        </div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ flex: 1 }}>
          <h2>Servicios más pedidos</h2>
          {data.topServices.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Sin datos todavía.</p>
          ) : (
            <table>
              <tbody>
                {data.topServices.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td style={{ textAlign: "right", color: "var(--gold-strong)", fontWeight: 700 }}>
                      {s.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card" style={{ flex: 1 }}>
          <h2>Clientes que más repiten</h2>
          {data.topClients.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Sin datos todavía.</p>
          ) : (
            <table>
              <tbody>
                {data.topClients.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td style={{ textAlign: "right", color: "var(--gold-strong)", fontWeight: 700 }}>
                      {c.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Galería ----------

function Gallery({ api }) {
  const { data, error, setError, reload } = useList(api, "gallery");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede superar 5MB");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api("gallery", {
        method: "POST",
        body: JSON.stringify({ imageBase64: b64, contentType: file.type, caption }),
      });
      setCaption("");
      reload();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("¿Borrar esta foto de la galería?")) return;
    try {
      await api(`gallery?id=${id}`, { method: "DELETE" });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="card">
      <h2>Galería de trabajos</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Sube fotos de cortes y trabajos: aparecen en la página principal junto a
        las fotos del local. JPG, PNG o WebP, máximo 5MB.
      </p>
      <div className="row">
        <div>
          <label>Pie de foto (opcional)</label>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="Degradado + barba" />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <label style={{ visibility: "hidden" }}>.</label>
          <label htmlFor="gallery-file" className="upload-btn">
            {uploading ? "Subiendo…" : "📷 Subir foto"}
          </label>
          <input
            id="gallery-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={upload}
            disabled={uploading}
          />
        </div>
      </div>
      {error && <p className="msg-error">{error}</p>}
      {data && data.length === 0 && (
        <p style={{ color: "var(--muted)", marginTop: 16 }}>Todavía no hay fotos subidas.</p>
      )}
      {data && data.length > 0 && (
        <div className="gallery" style={{ marginTop: 16 }}>
          {data.map((g) => (
            <div key={g.id} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.caption || "Foto de la galería"} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 12, border: "1px solid var(--line)" }} />
              <button
                className="danger small"
                style={{ position: "absolute", top: 8, right: 8 }}
                onClick={() => remove(g.id)}
              >
                Borrar
              </button>
              {g.caption && (
                <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 4 }}>{g.caption}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Reseñas ----------

function Reviews({ api }) {
  const { data, error, setError, reload } = useList(api, "reviews");

  async function setApproved(id, approved) {
    try {
      await api("reviews", { method: "PATCH", body: JSON.stringify({ id, approved }) });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("¿Borrar esta reseña definitivamente?")) return;
    try {
      await api(`reviews?id=${id}`, { method: "DELETE" });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="card">
      <h2>Reseñas de clientes</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Los clientes valoran sus citas desde "Mis citas". Solo se publican en la
        web las que apruebes aquí.
      </p>
      {error && <p className="msg-error">{error}</p>}
      {data && data.length === 0 && (
        <p style={{ color: "var(--muted)" }}>Aún no hay valoraciones.</p>
      )}
      {data && data.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Cliente</th><th>Puntuación</th><th>Comentario</th><th>Cita</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.clients?.name}</td>
                  <td style={{ color: "var(--gold-strong)" }}>{"★".repeat(r.rating)}</td>
                  <td style={{ maxWidth: 280 }}>{r.comment || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td>{r.appointments?.starts_at ? new Date(r.appointments.starts_at).toLocaleDateString("es-ES") : "—"}</td>
                  <td>
                    <span className={`badge ${r.approved ? "" : "cancelled"}`}>
                      {r.approved ? "Publicada" : "Pendiente"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className={r.approved ? "secondary small" : "small"}
                      onClick={() => setApproved(r.id, !r.approved)}
                      style={{ marginRight: 6 }}
                    >
                      {r.approved ? "Ocultar" : "Publicar"}
                    </button>
                    <button className="danger small" onClick={() => remove(r.id)}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Productos ----------

function Products({ api }) {
  const { data, error, setError, reload } = useList(api, "products");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState(5);

  async function add(e) {
    e.preventDefault();
    try {
      await api("products", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || null,
          price_eur: Number(price),
          stock: Number(stock),
        }),
      });
      setName(""); setDescription(""); setPrice(""); setStock(5);
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function patch(id, values) {
    try {
      await api("products", { method: "PATCH", body: JSON.stringify({ id, ...values }) });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="card">
      <h2>Productos en venta</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Los clientes pueden reservarlos al pedir cita y los pagan al recogerlos.
        Solo se muestran en la web si están visibles y con stock.
      </p>
      <form className="row" onSubmit={add}>
        <div>
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label>Descripción (opcional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Precio (€)</label>
          <input type="number" min="0" step="0.1" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div>
          <label>Stock</label>
          <input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button type="submit">Añadir</button>
        </div>
      </form>
      {error && <p className="msg-error">{error}</p>}
      {data && (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Visible</th><th></th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.description && (
                      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.description}</div>
                    )}
                  </td>
                  <td>{Number(p.price_eur).toFixed(2)} €</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="qty-btn" onClick={() => patch(p.id, { stock: Math.max(0, p.stock - 1) })}>−</button>
                      <span className="qty-num">{p.stock}</span>
                      <button className="qty-btn" onClick={() => patch(p.id, { stock: p.stock + 1 })}>+</button>
                    </div>
                  </td>
                  <td>{p.active ? "Sí" : "No"}</td>
                  <td>
                    <button className="secondary small" onClick={() => patch(p.id, { active: !p.active })}>
                      {p.active ? "Ocultar" : "Mostrar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Horario ----------

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const EMPTY_DAY = { open1: "", close1: "", open2: "", close2: "" };

function hoursToForm(value) {
  const form = {};
  for (let d = 0; d <= 6; d++) {
    const ranges = value?.[d] ?? value?.[String(d)] ?? null;
    form[d] = {
      open1: ranges?.[0]?.open ?? "",
      close1: ranges?.[0]?.close ?? "",
      open2: ranges?.[1]?.open ?? "",
      close2: ranges?.[1]?.close ?? "",
    };
  }
  return form;
}

function formToHours(form) {
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const f = form[d];
    const ranges = [];
    if (f.open1 && f.close1) ranges.push({ open: f.open1, close: f.close1 });
    if (f.open2 && f.close2) ranges.push({ open: f.open2, close: f.close2 });
    out[d] = ranges.length ? ranges : null;
  }
  return out;
}

function Horario({ api }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState("general"); // "general" o id de empleado
  const [employees, setEmployees] = useState([]);
  const [generalHours, setGeneralHours] = useState(null);

  useEffect(() => {
    Promise.all([api("settings"), api("employees")])
      .then(([s, e]) => {
        setGeneralHours(s.data?.business_hours ?? null);
        setEmployees((e.data || []).filter((emp) => emp.active));
        setForm(hoursToForm(s.data?.business_hours));
      })
      .catch((e) => setError(e.message));
  }, [api]);

  function switchTarget(value) {
    setTarget(value);
    setOk("");
    setError("");
    if (value === "general") {
      setForm(hoursToForm(generalHours));
    } else {
      const emp = employees.find((e) => e.id === value);
      setForm(hoursToForm(emp?.hours ?? generalHours));
    }
  }

  const targetEmployee = target !== "general" ? employees.find((e) => e.id === target) : null;
  const employeeUsesGeneral = targetEmployee && !targetEmployee.hours;

  async function useGeneral() {
    setSaving(true);
    setError("");
    try {
      await api("employees", {
        method: "PATCH",
        body: JSON.stringify({ id: target, hours: null }),
      });
      const e = await api("employees");
      setEmployees((e.data || []).filter((emp) => emp.active));
      setForm(hoursToForm(generalHours));
      setOk(`${targetEmployee?.name} vuelve a usar el horario general.`);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  function setField(day, field, value) {
    setOk("");
    setForm((f) => ({ ...f, [day]: { ...f[day], [field]: value } }));
  }

  function closeDay(day) {
    setOk("");
    setForm((f) => ({ ...f, [day]: { ...EMPTY_DAY } }));
  }

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      const value = formToHours(form);
      if (target === "general") {
        await api("settings", {
          method: "PATCH",
          body: JSON.stringify({ key: "business_hours", value }),
        });
        setGeneralHours(value);
        setOk("Horario general guardado. Ya se aplica a las nuevas reservas.");
      } else {
        await api("employees", {
          method: "PATCH",
          body: JSON.stringify({ id: target, hours: value }),
        });
        const e = await api("employees");
        setEmployees((e.data || []).filter((emp) => emp.active));
        setOk(`Horario propio de ${targetEmployee?.name} guardado.`);
      }
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="card"><p>Cargando horario…</p>{error && <p className="msg-error">{error}</p>}</div>;

  return (
    <div className="card">
      <h2>Horario de apertura</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Deja un día sin horas para marcarlo como cerrado. El segundo tramo es
        opcional (por ejemplo, mañana y tarde). Cada empleado puede tener su
        propio horario; si no, usa el general.
      </p>
      <label htmlFor="horario-target">Horario de</label>
      <select id="horario-target" value={target} onChange={(e) => switchTarget(e.target.value)} style={{ maxWidth: 320 }}>
        <option value="general">🏠 Horario general del local</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name} {emp.hours ? "· horario propio" : "· usa el general"}
          </option>
        ))}
      </select>
      {targetEmployee && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 8 }}>
          {employeeUsesGeneral
            ? `${targetEmployee.name} usa ahora el horario general. Si guardas cambios aquí, tendrá horario propio.`
            : `${targetEmployee.name} tiene horario propio.`}
          {!employeeUsesGeneral && (
            <button type="button" className="secondary small" style={{ marginLeft: 10 }} onClick={useGeneral} disabled={saving}>
              Volver al horario general
            </button>
          )}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Día</th><th>Tramo 1</th><th>Tramo 2 (opcional)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {DAY_ORDER.map((d) => {
              const f = form[d];
              const closed = !f.open1 && !f.close1 && !f.open2 && !f.close2;
              return (
                <tr key={d}>
                  <td style={{ fontWeight: 600 }}>
                    {DAY_NAMES[d]}
                    {closed && <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Cerrado</div>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" value={f.open1} onChange={(e) => setField(d, "open1", e.target.value)} style={{ width: 110 }} />
                      <span style={{ color: "var(--muted)" }}>–</span>
                      <input type="time" value={f.close1} onChange={(e) => setField(d, "close1", e.target.value)} style={{ width: 110 }} />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="time" value={f.open2} onChange={(e) => setField(d, "open2", e.target.value)} style={{ width: 110 }} />
                      <span style={{ color: "var(--muted)" }}>–</span>
                      <input type="time" value={f.close2} onChange={(e) => setField(d, "close2", e.target.value)} style={{ width: 110 }} />
                    </div>
                  </td>
                  <td>
                    {!closed && (
                      <button className="secondary small" onClick={() => closeDay(d)}>Cerrar día</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16 }}>
        <button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar horario"}</button>
      </div>
      {ok && <p className="msg-ok">{ok}</p>}
      {error && <p className="msg-error">{error}</p>}
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
        <div className="table-scroll">
          <table>
            <thead><tr><th>Nombre</th><th>Teléfono</th><th>Código</th><th>Cliente desde</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td style={{ color: "var(--gold-strong)", fontWeight: 600 }}>{c.access_code || "—"}</td>
                  <td>{new Date(c.created_at).toLocaleDateString("es-ES")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
