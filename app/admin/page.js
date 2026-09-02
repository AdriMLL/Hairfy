"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Logo } from "@/components/Logo";

// El calendario solo puede montarse en el navegador
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

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
  // Día actual en la zona horaria de la peluquería (Madrid)
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// --- Utilidades de fechas de la agenda (siempre en clave YYYY-MM-DD) ---

// Día (en la zona horaria de Madrid) al que pertenece un instante UTC
function madridDay(iso) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}
function fmtTimeMadrid(iso) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit",
  });
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`); // mediodía: inmune a cambios de hora
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(dateStr, -dow);
}
function monthRange(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
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

const NAV = [
  {
    group: "Día a día",
    items: [
      ["agenda", "📅", "Agenda"],
      ["orders", "🛍️", "Pedidos"],
    ],
  },
  {
    group: "Negocio",
    items: [
      ["stats", "📈", "Estadísticas"],
      ["activity", "🧾", "Actividad"],
      ["clients", "👥", "Clientes"],
      ["reviews", "⭐", "Reseñas"],
    ],
  },
  {
    group: "Catálogo",
    items: [
      ["services", "✂️", "Servicios"],
      ["products", "🧴", "Productos"],
      ["gallery", "🖼️", "Galería"],
    ],
  },
  {
    group: "Configuración",
    items: [
      ["employees", "💈", "Empleados"],
      ["horario", "🕘", "Horario"],
    ],
  },
];

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

  // Avisos de cosas pendientes (pedidos por entregar, reseñas por aprobar)
  const [pending, setPending] = useState({ orders: 0, reviews: 0 });
  useEffect(() => {
    let alive = true;
    Promise.all([api("orders"), api("reviews")])
      .then(([o, r]) => {
        if (!alive) return;
        setPending({
          orders: (o.data || []).filter((x) => x.status === "pending").length,
          reviews: (r.data || []).filter((x) => !x.approved).length,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, tab]);

  const badge = (key) =>
    key === "orders" ? pending.orders : key === "reviews" ? pending.reviews : 0;

  return (
    <>
      <AdminHeader>
        <button className="secondary small" onClick={() => supabaseBrowser().auth.signOut()}>
          Cerrar sesión
        </button>
      </AdminHeader>
      <main className="container admin-main">
        {/* Menú móvil: un desplegable en vez del lateral */}
        <select
          className="admin-select"
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          aria-label="Sección del panel"
        >
          {NAV.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map(([key, icon, label]) => (
                <option key={key} value={key}>
                  {icon} {label}
                  {badge(key) > 0 ? ` (${badge(key)})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="admin-layout">
          <aside className="admin-side">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="admin-nav-title">{g.group}</div>
                {g.items.map(([key, icon, label]) => (
                  <button
                    key={key}
                    className={`admin-nav-item ${tab === key ? "active" : ""}`}
                    onClick={() => setTab(key)}
                  >
                    <span aria-hidden="true">{icon}</span> {label}
                    {badge(key) > 0 && <span className="nav-badge">{badge(key)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <div className="admin-content">
            {tab === "agenda" && <Agenda api={api} />}
            {tab === "orders" && <Orders api={api} />}
            {tab === "stats" && <Stats api={api} />}
            {tab === "activity" && <Activity api={api} />}
            {tab === "services" && <Services api={api} />}
            {tab === "products" && <Products api={api} />}
            {tab === "employees" && <Employees api={api} />}
            {tab === "clients" && <Clients api={api} />}
            {tab === "gallery" && <Gallery api={api} />}
            {tab === "reviews" && <Reviews api={api} />}
            {tab === "horario" && (
              <>
                <Horario api={api} />
                <Cierres api={api} />
              </>
            )}
          </div>
        </div>
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
  const [range, setRange] = useState(null); // { from, to } visible en el calendario
  const [appts, setAppts] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState(null); // cita elegida (panel de acciones)
  const [editing, setEditing] = useState(null); // cita en edición
  const [showNew, setShowNew] = useState(false);
  const [newDate, setNewDate] = useState(todayStr());
  const [newTime, setNewTime] = useState(null);

  const load = useCallback(() => {
    if (!range) return;
    api(`appointments?from=${range.from}&to=${range.to}`)
      .then((d) => setAppts(d.data || []))
      .catch((e) => setError(e.message));
  }, [api, range]);
  useEffect(load, [load]);

  // Fecha/hora de Madrid de un instante (para hablar con la API)
  const madridDate = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const madridTime = (d) =>
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);

  const events = useMemo(
    () =>
      appts
        .filter((a) => showCancelled || a.status === "confirmed")
        .map((a) => ({
          id: a.id,
          start: a.starts_at,
          end: a.ends_at,
          title: `${a.clients?.name || "Cliente"} — ${a.services?.name || ""}`,
          editable: a.status === "confirmed",
          classNames: [
            a.status === "cancelled" ? "ev-cancelled" : a.status === "no_show" ? "ev-noshow" : "ev-ok",
            selected?.id === a.id ? "ev-selected" : "",
          ],
          extendedProps: { appt: a },
        })),
    [appts, showCancelled, selected]
  );

  // Cambio de vista o de semana: cargar el rango visible
  function onDatesSet(info) {
    const from = madridDate(info.start);
    const toExclusive = madridDate(info.end);
    setRange({ from, to: addDays(toExclusive, -1) });
  }

  // Arrastrar una cita = reprogramarla (el servidor valida hueco, horario y cierres)
  async function onEventDrop(info) {
    const a = info.event.extendedProps.appt;
    const start = info.event.start;
    setError("");
    setNotice("");
    try {
      await api("appointments", {
        method: "PATCH",
        body: JSON.stringify({
          id: a.id,
          serviceId: a.services?.id,
          employeeId: a.employees?.id,
          date: madridDate(start),
          startsAt: start.toISOString(),
        }),
      });
      setNotice(`Cita de ${a.clients?.name} movida al ${start.toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Si tiene email, se le ha avisado.`);
      load();
    } catch (e) {
      info.revert();
      setError(`No se pudo mover la cita: ${e.message}`);
    }
  }

  // Clic en una cita: panel de acciones
  function onEventClick(info) {
    setSelected(info.event.extendedProps.appt);
    setEditing(null);
    setShowNew(false);
    setNotice("");
    setError("");
  }

  // Clic en un hueco vacío: nueva cita con día (y hora) precargados
  function onDateClick(info) {
    setNewDate(madridDate(info.date));
    setNewTime(info.view.type === "dayGridMonth" ? null : madridTime(info.date));
    setShowNew(true);
    setSelected(null);
    setEditing(null);
    setNotice("");
    setError("");
  }

  async function setStatus(id, status) {
    setError("");
    try {
      await api("appointments", { method: "PATCH", body: JSON.stringify({ id, status }) });
      setSelected(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeAppt(id) {
    if (!window.confirm("¿Borrar esta cita definitivamente? (para mantener el historial, mejor cancélala)")) return;
    setError("");
    try {
      await api(`appointments?id=${id}`, { method: "DELETE" });
      setSelected(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const sel = selected;
  const selPast = sel && new Date(sel.starts_at) < new Date();

  return (
    <div className="card">
      <div className="agenda-toolbar" style={{ marginBottom: 10 }}>
        <button
          onClick={() => {
            setShowNew((s) => !s);
            setNewTime(null);
            setSelected(null);
            setNotice("");
          }}
        >
          {showNew ? "Cerrar" : "➕ Nueva cita"}
        </button>
        <label className="consent-row" style={{ margin: 0, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          <span>Ver canceladas y no-shows</span>
        </label>
        <span className="cal-hint">
          Arrastra una cita para cambiarla de hora o de día · Toca un hueco libre para apuntar una cita
        </span>
      </div>

      {notice && <p className="msg-ok">{notice}</p>}
      {error && <p className="msg-error">{error}</p>}

      {showNew && (
        <NewAppointment
          api={api}
          defaultDate={newDate}
          defaultTime={newTime}
          onDone={(msg) => {
            setShowNew(false);
            setNotice(msg);
            load();
          }}
        />
      )}

      {editing && (
        <EditAppointment
          api={api}
          appt={editing}
          onDone={(msg) => {
            setEditing(null);
            setSelected(null);
            setNotice(msg);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {sel && !editing && (
        <div className="appt-detail">
          <div className="appt-detail-info">
            <strong style={{ fontSize: "1.05rem" }}>{sel.clients?.name}</strong>
            {sel.status === "cancelled" && <span className="badge cancelled">Cancelada</span>}
            {sel.status === "no_show" && <span className="badge noshow">No vino</span>}
            <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 4 }}>
              {new Date(sel.starts_at).toLocaleString("es-ES", {
                timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
              })}
              {" – "}
              {fmtTimeMadrid(sel.ends_at)}
            </div>
            <div style={{ fontSize: "0.92rem", marginTop: 4 }}>
              ✂️ {sel.services?.name} · {Number(sel.services?.price_eur || 0).toFixed(2)} € ·{" "}
              <span style={{ color: "var(--muted)" }}>{sel.employees?.name}</span>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: 4 }}>
              📞 <a href={`tel:${sel.clients?.phone}`} style={{ color: "var(--gold-strong)" }}>{sel.clients?.phone}</a>
              {(sel.appointment_products || []).length > 0 && (
                <> · 🧴 {(sel.appointment_products || []).map((p) => `${p.products?.name} x${p.quantity}`).join(", ")}</>
              )}
            </div>
          </div>
          <div className="appt-detail-actions">
            {sel.status === "confirmed" ? (
              <>
                <button className="secondary small" onClick={() => setEditing(sel)}>✏️ Editar</button>
                <button className="danger small" onClick={() => setStatus(sel.id, "cancelled")}>Cancelar</button>
                {selPast && (
                  <button className="secondary small" onClick={() => setStatus(sel.id, "no_show")}>👻 No vino</button>
                )}
              </>
            ) : (
              <button className="secondary small" onClick={() => setStatus(sel.id, "confirmed")}>Reactivar</button>
            )}
            <button className="secondary small" title="Borrar definitivamente" onClick={() => removeAppt(sel.id)}>🗑</button>
            <button className="secondary small" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
        </div>
      )}

      <div className="fc-wrap">
        <FullCalendar
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={esLocale}
          firstDay={1}
          headerToolbar={{
            left: "prev,today,next",
            center: "title",
            right: "timeGridDay,timeGridWeek,dayGridMonth",
          }}
          buttonText={{ today: "Hoy", day: "Día", week: "Semana", month: "Mes" }}
          slotMinTime="08:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:30:00"
          scrollTime="09:00:00"
          allDaySlot={false}
          nowIndicator
          height="auto"
          expandRows
          dayMaxEventRows={4}
          events={events}
          editable
          eventDurationEditable={false}
          eventOverlap={false}
          longPressDelay={300}
          datesSet={onDatesSet}
          eventDrop={onEventDrop}
          eventClick={onEventClick}
          dateClick={onDateClick}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        />
      </div>
      <p className="cal-legend">
        <span className="lg lg-ok" /> Confirmada · <span className="lg lg-cancelled" /> Cancelada ·{" "}
        <span className="lg lg-noshow" /> No vino — las citas pasadas no se pueden arrastrar (edítalas con ✏️)
      </p>
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

  async function remove(s) {
    if (!window.confirm(`¿Borrar el servicio "${s.name}"?`)) return;
    try {
      await api(`services?id=${s.id}`, { method: "DELETE" });
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
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary small" onClick={() => toggle(s)}>
                    {s.active ? "Ocultar" : "Mostrar"}
                  </button>
                  <button className="danger small" style={{ marginLeft: 6 }} onClick={() => remove(s)}>
                    Borrar
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

// ---------- Nueva cita (creada por el personal) ----------

function NewAppointment({ api, defaultDate, defaultTime, onDone }) {
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate || todayStr());
  const [slots, setSlots] = useState(null);
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Cliente: por defecto se busca entre los existentes; "nuevo" crea ficha
  const [clientMode, setClientMode] = useState("existente"); // existente | nuevo
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // cliente existente elegido
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    Promise.all([api("services"), api("employees"), api("clients")])
      .then(([s, e, c]) => {
        setServices((s.data || []).filter((x) => x.active));
        const activos = (e.data || []).filter((x) => x.active);
        setEmployees(activos);
        if (activos.length === 1) setEmployeeId(activos[0].id);
        setClients(c.data || []);
      })
      .catch((e2) => setError(e2.message));
  }, [api]);

  // El día precargado sigue a la fecha que esté mirando la agenda
  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  // Búsqueda por nombre O teléfono
  const q = search.trim().toLowerCase();
  const qDigits = search.replace(/\D/g, "");
  const suggestions =
    clientMode === "existente" && !selected && q.length >= 2
      ? clients
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (qDigits.length >= 3 && (c.phone || "").includes(qDigits))
          )
          .slice(0, 6)
      : [];

  // En modo "nuevo": avisar si el teléfono ya tiene ficha
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneMatch =
    clientMode === "nuevo" && phoneDigits.length >= 9
      ? clients.find((c) => (c.phone || "").replace(/\D/g, "") === phoneDigits.replace(/^34/, "").replace(/^0034/, "")) ||
        clients.find((c) => (c.phone || "").includes(phoneDigits.slice(-9)))
      : null;

  function pickClient(c) {
    setSelected(c);
    setSearch("");
  }

  useEffect(() => {
    setStartsAt("");
    setSlots(null);
    if (!serviceId || !employeeId || !date) return;
    const params = new URLSearchParams({ date, employeeId, serviceId });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.slots ?? [];
        setSlots(list);
        // Hora precargada (clic en un hueco del calendario)
        if (defaultTime) {
          const m = list.find((sl) => sl.free && sl.time === defaultTime);
          if (m) setStartsAt(m.startsAt);
        }
      })
      .catch(() => setError("No se pudo consultar la disponibilidad"));
  }, [serviceId, employeeId, date, defaultTime]);

  const clientName = clientMode === "existente" ? selected?.name || "" : name;
  const clientPhone = clientMode === "existente" ? selected?.phone || "" : phone;
  const clientReady = clientName.trim().length >= 2 && clientPhone.replace(/\D/g, "").length >= 9;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!clientReady) {
      setError(clientMode === "existente" ? "Elige un cliente de la lista (o pasa a \"Cliente nuevo\")" : "Faltan el nombre o el teléfono");
      return;
    }
    setSaving(true);
    try {
      const res = await api("appointments", {
        method: "POST",
        body: JSON.stringify({ serviceId, employeeId, date, startsAt, name: clientName, phone: clientPhone }),
      });
      onDone(
        clientMode === "existente"
          ? `Cita apuntada para ${clientName}.`
          : `Cita apuntada para ${clientName}. Su código de cliente es ${res.accessCode} (díselo para que pueda ver o cancelar sus citas en la web).`
      );
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  const freeSlots = (slots || []).filter((s) => s.free);

  return (
    <form onSubmit={submit} style={{ marginTop: 14, padding: 16, border: "1px dashed var(--gold-dark)", borderRadius: 12 }}>
      <h3 style={{ margin: "0 0 10px" }}>Apuntar cita (cliente por teléfono o en tienda)</h3>

      <div className="pills" style={{ marginBottom: 6 }}>
        <button
          type="button"
          className={`pill ${clientMode === "existente" ? "selected" : ""}`}
          onClick={() => { setClientMode("existente"); setError(""); }}
        >
          🔍 Cliente existente
        </button>
        <button
          type="button"
          className={`pill ${clientMode === "nuevo" ? "selected" : ""}`}
          onClick={() => { setClientMode("nuevo"); setSelected(null); setError(""); }}
        >
          🆕 Cliente nuevo
        </button>
      </div>

      {clientMode === "existente" && !selected && (
        <div style={{ position: "relative" }}>
          <label>Buscar cliente (nombre o teléfono)</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ej.: María… o 600 12…"
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <div className="suggest-box">
              {suggestions.map((c) => (
                <button type="button" key={c.id} className="suggest-item" onClick={() => pickClient(c)}>
                  <strong>{c.name}</strong>
                  <span style={{ color: "var(--muted)" }}> · {c.phone} · {c.access_code}</span>
                </button>
              ))}
            </div>
          )}
          {q.length >= 2 && suggestions.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "6px 0 0" }}>
              No hay ningún cliente con ese nombre o teléfono.{" "}
              <button type="button" className="linklike" onClick={() => { setClientMode("nuevo"); setName(search.replace(/[\d\s+-]{6,}/g, "").trim()); if (qDigits.length >= 9) setPhone(qDigits); }}>
                Crearlo como cliente nuevo →
              </button>
            </p>
          )}
        </div>
      )}

      {clientMode === "existente" && selected && (
        <div className="selected-client">
          <div>
            <strong>{selected.name}</strong>
            <span style={{ color: "var(--muted)" }}> · 📞 {selected.phone} · 🔑 {selected.access_code}</span>
          </div>
          <button type="button" className="secondary small" onClick={() => setSelected(null)}>
            Cambiar
          </button>
        </div>
      )}

      {clientMode === "nuevo" && (
        <>
          <div className="row">
            <div>
              <label>Nombre del cliente</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="María García" autoComplete="off" />
            </div>
            <div>
              <label>Teléfono</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={9} placeholder="600123456" autoComplete="off" />
            </div>
          </div>
          {phoneMatch && (
            <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: "6px 0 0" }}>
              ⚠️ Ese teléfono ya es de <strong>{phoneMatch.name}</strong>.{" "}
              <button
                type="button"
                className="linklike"
                onClick={() => { setClientMode("existente"); setSelected(phoneMatch); setName(""); setPhone(""); }}
              >
                Usar su ficha →
              </button>
            </p>
          )}
        </>
      )}

      <div className="row">
        <div>
          <label>Servicio</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            <option value="">— Elige —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_min} min
              </option>
            ))}
          </select>
        </div>
        {employees.length > 1 && (
          <div>
            <label>Profesional</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">— Elige —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label>Día</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>
      {slots && (
        <>
          <label>Hora</label>
          {freeSlots.length === 0 ? (
            <p style={{ color: "var(--muted)", margin: "4px 0" }}>
              No quedan huecos libres ese día (o está cerrado).
            </p>
          ) : (
            <div className="slots">
              {slots.map((s) =>
                s.free ? (
                  <button
                    type="button"
                    key={s.startsAt}
                    className={`slot ${startsAt === s.startsAt ? "selected" : ""}`}
                    onClick={() => setStartsAt(s.startsAt)}
                  >
                    {s.time}
                  </button>
                ) : (
                  <span key={s.startsAt} className="slot busy">{s.time}</span>
                )
              )}
            </div>
          )}
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={saving || !startsAt || !clientReady}>
          {saving ? "Guardando…" : "Apuntar cita"}
        </button>
      </div>
      {error && <p className="msg-error">{error}</p>}
    </form>
  );
}

// ---------- Editar cita ----------

function EditAppointment({ api, appt, onDone, onCancel }) {
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(appt.starts_at.slice(0, 10));
  const [slots, setSlots] = useState(null);
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api("services"), api("employees")])
      .then(([s, e]) => {
        const svcs = (s.data || []).filter((x) => x.active);
        const emps = (e.data || []).filter((x) => x.active);
        setServices(svcs);
        setEmployees(emps);
        // Preseleccionar los valores actuales de la cita por nombre
        const svc = svcs.find((x) => x.name === appt.services?.name);
        if (svc) setServiceId(svc.id);
        const emp = emps.find((x) => x.name === appt.employees?.name);
        if (emp) setEmployeeId(emp.id);
        else if (emps.length === 1) setEmployeeId(emps[0].id);
      })
      .catch((e2) => setError(e2.message));
  }, [api, appt]);

  useEffect(() => {
    setStartsAt("");
    setSlots(null);
    if (!serviceId || !employeeId || !date) return;
    const params = new URLSearchParams({
      date,
      employeeId,
      serviceId,
      excludeId: appt.id,
    });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setError("No se pudo consultar la disponibilidad"));
  }, [serviceId, employeeId, date, appt.id]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api("appointments", {
        method: "PATCH",
        body: JSON.stringify({ id: appt.id, serviceId, employeeId, date, startsAt }),
      });
      onDone(
        `Cita de ${appt.clients?.name} modificada. ${appt.clients?.email ? "Se le ha avisado por email." : ""}`
      );
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 14, padding: 16, border: "1px dashed var(--gold-dark)", borderRadius: 12 }}>
      <div className="topbar">
        <h3 style={{ margin: 0 }}>
          ✏️ Editar cita de {appt.clients?.name} (
          {new Date(appt.starts_at).toLocaleString("es-ES", {
            timeZone: "Europe/Madrid",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          )
        </h3>
        <button type="button" className="secondary small" onClick={onCancel}>Cerrar</button>
      </div>
      <div className="row">
        <div>
          <label>Servicio</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            <option value="">— Elige —</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min</option>
            ))}
          </select>
        </div>
        {employees.length > 1 && (
          <div>
            <label>Profesional</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
              <option value="">— Elige —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label>Día</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>
      {slots && (
        <>
          <label>Nueva hora</label>
          <div className="slots">
            {slots.map((s) =>
              s.free ? (
                <button
                  type="button"
                  key={s.startsAt}
                  className={`slot ${startsAt === s.startsAt ? "selected" : ""}`}
                  onClick={() => setStartsAt(s.startsAt)}
                >
                  {s.time}
                </button>
              ) : (
                <span key={s.startsAt} className="slot busy">{s.time}</span>
              )
            )}
          </div>
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={saving || !startsAt}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      {error && <p className="msg-error">{error}</p>}
    </form>
  );
}

// ---------- Pedidos ----------

function Orders({ api }) {
  const { data, error, setError, reload } = useList(api, "orders");

  async function setStatus(id, status) {
    try {
      await api("orders", { method: "PATCH", body: JSON.stringify({ id, status }) });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  const total = (o) =>
    (o.order_items || []).reduce((acc, it) => acc + Number(it.price_eur) * it.quantity, 0);

  return (
    <div className="card">
      <h2>Pedidos de productos</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Los clientes hacen pedidos desde "Mis citas" y los pagan al recogerlos.
        Márcalos como entregados cuando se los lleven.
      </p>
      {error && <p className="msg-error">{error}</p>}
      {data && data.length === 0 && <p style={{ color: "var(--muted)" }}>No hay pedidos todavía.</p>}
      {data && data.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} style={o.status === "cancelled" ? { opacity: 0.55 } : undefined}>
                  <td>{new Date(o.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</td>
                  <td>
                    {o.clients?.name}
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{o.clients?.phone}</div>
                  </td>
                  <td>
                    {(o.order_items || []).map((it) => `${it.products?.name} x${it.quantity}`).join(", ")}
                  </td>
                  <td style={{ color: "var(--gold-strong)", fontWeight: 700 }}>{total(o).toFixed(2)} €</td>
                  <td>
                    <span className={`badge ${o.status === "cancelled" ? "cancelled" : ""}`}>
                      {o.status === "pending" ? "Pendiente" : o.status === "delivered" ? "Entregado" : "Cancelado"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {o.status === "pending" && (
                      <>
                        <button className="small" style={{ marginRight: 6 }} onClick={() => setStatus(o.id, "delivered")}>
                          Entregado
                        </button>
                        <button className="danger small" onClick={() => setStatus(o.id, "cancelled")}>
                          Cancelar
                        </button>
                      </>
                    )}
                    {o.status === "delivered" && (
                      <button className="secondary small" onClick={() => setStatus(o.id, "pending")}>
                        Volver a pendiente
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

// ---------- Actividad (trazabilidad) ----------

const ACTION_LABELS = {
  cita_creada: ["📅", "Cita creada"],
  cita_cancelada: ["❌", "Cita cancelada"],
  cita_reactivada: ["♻️", "Cita reactivada"],
  pedido_creado: ["🛍️", "Pedido creado"],
  pedido_entregado: ["✅", "Pedido entregado"],
  pedido_cancelado: ["❌", "Pedido cancelado"],
  pedido_reabierto: ["↩️", "Pedido reabierto"],
  resena_enviada: ["⭐", "Reseña enviada"],
  ficha_creada: ["👤", "Cliente nuevo"],
  codigo_cambiado: ["🔑", "Código cambiado"],
  horario_actualizado: ["🕘", "Horario actualizado"],
  elemento_borrado: ["🗑", "Elemento borrado"],
  cita_modificada: ["✏️", "Cita modificada"],
  recordatorio_enviado: ["⏰", "Recordatorio enviado"],
  email_actualizado: ["✉️", "Email actualizado"],
};

function Activity({ api }) {
  const { data, error } = useList(api, "activity");

  const fmtDetails = (a) => {
    const d = a.details || {};
    const parts = [];
    if (d.cliente) parts.push(d.cliente);
    if (d.telefono) parts.push(d.telefono);
    if (d.fecha)
      parts.push(
        new Date(d.fecha).toLocaleString("es-ES", {
          timeZone: "Europe/Madrid",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    if (d.total != null) parts.push(`${Number(d.total).toFixed(2)} €`);
    if (d.puntuacion) parts.push(`${d.puntuacion}★`);
    if (d.tipo) parts.push(d.tipo);
    if (d.via) parts.push(`vía ${d.via}`);
    return parts.join(" · ");
  };

  return (
    <div className="card">
      <h2>Actividad reciente</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Registro de todo lo que pasa en la web y en el panel: quién hizo qué y
        cuándo. Las últimas 150 acciones.
      </p>
      {error && <p className="msg-error">{error}</p>}
      {data && data.length === 0 && (
        <p style={{ color: "var(--muted)" }}>Todavía no hay actividad registrada.</p>
      )}
      {data && data.length > 0 && (
        <div className="activity-list">
          {data.map((a) => {
            const [icon, label] = ACTION_LABELS[a.action] || ["•", a.action];
            return (
              <div key={a.id} className="activity-row">
                <span className="activity-icon" aria-hidden="true">{icon}</span>
                <div className="activity-body">
                  <div>
                    <strong>{label}</strong>
                    <span className={`chip actor-chip ${a.actor}`}>{a.actor}</span>
                  </div>
                  <div className="who">{fmtDetails(a) || "—"}</div>
                </div>
                <span className="activity-when">
                  {new Date(a.created_at).toLocaleString("es-ES", {
                    timeZone: "Europe/Madrid",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Estadísticas ----------

function StatTable({ title, rows, render }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 220 }}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Sin datos todavía.</p>
      ) : (
        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td style={{ textAlign: "right", color: "var(--gold-strong)", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {render(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stats({ api }) {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api(`stats?weeks=${weeks}`)
      .then((d) => setData(d.data))
      .catch((e) => setError(e.message));
  }, [api, weeks]);

  if (error) return <div className="card"><p className="msg-error">{error}</p></div>;
  if (!data) return <div className="card"><p>Calculando…</p></div>;

  const t = data.totals;
  const totalRevenue = t.serviceRevenue + t.productRevenue;
  const maxCount = Math.max(1, ...data.weekly.map((w) => w.count));
  const fmtWeek = (iso) =>
    new Date(iso + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  return (
    <>
      <div className="card">
        <div className="topbar">
          <h2 style={{ margin: 0 }}>Resumen del negocio</h2>
          <div className="pills">
            {[4, 8, 12].map((w) => (
              <button
                key={w}
                className={`pill small ${weeks === w ? "selected" : ""}`}
                style={{ padding: "6px 14px" }}
                onClick={() => setWeeks(w)}
              >
                {w} sem.
              </button>
            ))}
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-box">
            <div className="stat-num">{totalRevenue.toFixed(0)} €</div>
            <div className="stat-label">ingresos totales estimados</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.appointments}</div>
            <div className="stat-label">citas confirmadas</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.serviceRevenue.toFixed(0)} €</div>
            <div className="stat-label">en servicios</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.productRevenue.toFixed(0)} €</div>
            <div className="stat-label">en productos ({t.orders} pedidos)</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.avgTicket.toFixed(2)} €</div>
            <div className="stat-label">ticket medio por cita</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.newClients}</div>
            <div className="stat-label">clientes nuevos</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.cancelled}</div>
            <div className="stat-label">citas canceladas</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{t.noShows ?? 0}</div>
            <div className="stat-label">no asistieron (no-show)</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Citas e ingresos por semana</h2>
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

      {data.byEmployee.length > 1 && (
        <div className="card">
          <h2>Citas por profesional</h2>
          <div className="bars">
            {data.byEmployee.map((e) => (
              <div key={e.name} className="bar-row">
                <span className="bar-label">{e.name}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(e.count / Math.max(1, data.byEmployee[0].count)) * 100}%` }}
                  />
                </div>
                <span className="bar-value">{e.count} citas</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ alignItems: "stretch" }}>
        <StatTable title="Servicios más pedidos" rows={data.topServices} render={(r) => r.count} />
        <StatTable title="Clientes que más repiten" rows={data.topClients} render={(r) => r.count} />
        <StatTable
          title="Productos más vendidos"
          rows={data.topProducts}
          render={(r) => `${r.qty} · ${r.revenue.toFixed(0)} €`}
        />
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

  async function uploadImage(id, e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede superar 5MB");
      return;
    }
    setError("");
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api("product-image", {
        method: "POST",
        body: JSON.stringify({ id, imageBase64: b64, contentType: file.type }),
      });
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
            <thead><tr><th>Foto</th><th>Producto</th><th>Precio</th><th>Stock</th><th>Visible</th><th></th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <label htmlFor={`prod-img-${p.id}`} style={{ cursor: "pointer", margin: 0 }} title="Subir o cambiar foto">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.name} className="product-thumb" />
                      ) : (
                        <span
                          className="product-thumb"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", background: "var(--card-2)" }}
                        >
                          📷
                        </span>
                      )}
                    </label>
                    <input
                      id={`prod-img-${p.id}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => uploadImage(p.id, e)}
                    />
                  </td>
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
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="secondary small" onClick={() => patch(p.id, { active: !p.active })}>
                      {p.active ? "Ocultar" : "Mostrar"}
                    </button>
                    <button
                      className="danger small"
                      style={{ marginLeft: 6 }}
                      onClick={async () => {
                        if (!window.confirm(`¿Borrar el producto "${p.name}"?`)) return;
                        try {
                          await api(`products?id=${p.id}`, { method: "DELETE" });
                          reload();
                        } catch (e2) {
                          setError(e2.message);
                        }
                      }}
                    >
                      Borrar
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

// ---------- Festivos y vacaciones (cierres) ----------

function Cierres({ api }) {
  const { data, error, setError, reload } = useList(api, "closures");
  const [employees, setEmployees] = useState([]);
  const [startsOn, setStartsOn] = useState(todayStr());
  const [endsOn, setEndsOn] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [who, setWho] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api("employees")
      .then((e) => setEmployees((e.data || []).filter((emp) => emp.active)))
      .catch(() => {});
  }, [api]);

  async function add(e) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      await api("closures", {
        method: "POST",
        body: JSON.stringify({
          startsOn,
          endsOn: endsOn < startsOn ? startsOn : endsOn,
          reason,
          employeeId: who || undefined,
        }),
      });
      setReason("");
      setOk("Cierre guardado: esos días ya no aceptan reservas.");
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function remove(c) {
    if (!window.confirm("¿Quitar este cierre? Los días volverán a aceptar reservas.")) return;
    try {
      await api(`closures?id=${c.id}`, { method: "DELETE" });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  const fmtDay = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Festivos y vacaciones</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Cierra días sueltos o periodos (festivos, vacaciones…). Los clientes no
        podrán reservar en esos días — de todo el local o solo de un empleado.
      </p>
      <form className="row" onSubmit={add}>
        <div>
          <label>Desde</label>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </div>
        <div>
          <label>Hasta (incluido)</label>
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} required />
        </div>
        <div>
          <label>Motivo (opcional)</label>
          <input value={reason} maxLength={120} placeholder="Vacaciones, festivo…" onChange={(e) => setReason(e.target.value)} />
        </div>
        <div>
          <label>Afecta a</label>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">🏠 Todo el local</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>Solo {emp.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <label style={{ visibility: "hidden" }}>.</label>
          <button type="submit">Cerrar días</button>
        </div>
      </form>
      {ok && <p className="msg-ok">{ok}</p>}
      {error && <p className="msg-error">{error}</p>}
      {data && data.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Afecta a</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDay(c.starts_on)}</td>
                  <td>{fmtDay(c.ends_on)}</td>
                  <td>{c.reason || "—"}</td>
                  <td>{c.employees?.name ? `Solo ${c.employees.name}` : "Todo el local"}</td>
                  <td>
                    <button className="danger small" onClick={() => remove(c)}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No hay cierres programados.</p>
      )}
    </div>
  );
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
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary small" onClick={() => toggle(emp)}>
                    {emp.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    className="danger small"
                    style={{ marginLeft: 6 }}
                    onClick={async () => {
                      if (!window.confirm(`¿Borrar a "${emp.name}"? Si tiene citas en el historial no se podrá (desactívalo).`)) return;
                      try {
                        await api(`employees?id=${emp.id}`, { method: "DELETE" });
                        reload();
                      } catch (e2) {
                        setError(e2.message);
                      }
                    }}
                  >
                    Borrar
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
  const { data, error, setError, reload } = useList(api, "clients");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  async function remove(c) {
    if (
      !window.confirm(
        `¿Borrar la ficha de "${c.name}"? Se borrarán TAMBIÉN todas sus citas, pedidos y reseñas. Esta acción no se puede deshacer.`
      )
    )
      return;
    try {
      await api(`clients?id=${c.id}&confirm=1`, { method: "DELETE" });
      reload();
    } catch (e2) {
      setError(e2.message);
    }
  }

  if (selectedId) {
    return (
      <ClientDetail
        api={api}
        clientId={selectedId}
        onBack={() => {
          setSelectedId(null);
          reload();
        }}
      />
    );
  }

  const filtered = (data || []).filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
  );

  return (
    <div className="card">
      <h2>Clientes</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.9rem" }}>
        Toca un cliente para abrir su ficha completa: historial, gasto, no-shows y notas.
      </p>
      <label htmlFor="client-search">Buscar</label>
      <input id="client-search" placeholder="Nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="msg-error">{error}</p>}
      {data && (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Nombre</th><th>Teléfono</th><th>Código</th><th>Cliente desde</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="row-click" onClick={() => setSelectedId(c.id)}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td style={{ color: "var(--gold-strong)", fontWeight: 600 }}>{c.access_code || "—"}</td>
                  <td>{new Date(c.created_at).toLocaleDateString("es-ES")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="secondary small" onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }}>
                      Ver ficha
                    </button>
                    <button className="danger small" style={{ marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); remove(c); }}>
                      Borrar
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

// ---------- Ficha completa de un cliente ----------

function ClientDetail({ api, clientId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState("");

  const load = useCallback(() => {
    api(`client-detail?id=${clientId}`)
      .then((d) => {
        setData(d.data);
        setNotes(d.data.client.notes || "");
      })
      .catch((e) => setError(e.message));
  }, [api, clientId]);
  useEffect(load, [load]);

  async function saveNotes() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      await api("clients", {
        method: "PATCH",
        body: JSON.stringify({ id: clientId, notes }),
      });
      setOk("Notas guardadas.");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <div className="card">
        <button className="secondary small" onClick={onBack}>← Volver a clientes</button>
        <p style={{ marginTop: 14 }}>{error ? "" : "Cargando ficha…"}</p>
        {error && <p className="msg-error">{error}</p>}
      </div>
    );
  }

  const { client, appointments, orders, totals } = data;
  const totalSpent = totals.serviceSpent + totals.productSpent;
  const fmtDT = (iso) =>
    new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const statusBadge = (st) =>
    st === "cancelled" ? (
      <span className="badge cancelled">Cancelada</span>
    ) : st === "no_show" ? (
      <span className="badge noshow">No vino</span>
    ) : (
      <span className="badge">Confirmada</span>
    );

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ marginBottom: 10 }}>
          <button className="secondary small" onClick={onBack}>← Volver a clientes</button>
        </div>
        <h2 style={{ marginBottom: 4 }}>{client.name}</h2>
        <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: "0.92rem" }}>
          📞 <a href={`tel:${client.phone}`} style={{ color: "var(--gold-strong)" }}>{client.phone}</a>
          {client.email && <> · ✉️ {client.email}</>}
          {" · "}🔑 <span style={{ color: "var(--gold-strong)", fontWeight: 600 }}>{client.access_code || "—"}</span>
          {" · "}Cliente desde {new Date(client.created_at).toLocaleDateString("es-ES")}
          {client.marketing_consent_at && <> · 📣 Acepta promos</>}
        </p>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="stat-num">{totals.visits}</div>
            <div className="stat-label">visitas realizadas</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{totals.upcoming}</div>
            <div className="stat-label">citas próximas</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{totalSpent.toFixed(0)} €</div>
            <div className="stat-label">gasto total estimado</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{totals.noShows}</div>
            <div className="stat-label">no vino (no-show)</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{totals.cancelled}</div>
            <div className="stat-label">canceladas</div>
          </div>
        </div>
        {totals.noShows >= 2 && (
          <p className="msg-error" style={{ marginTop: 10 }}>
            ⚠️ Este cliente ha faltado {totals.noShows} veces sin avisar.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>📝 Notas del barbero</h2>
        <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.88rem" }}>
          Privadas: solo se ven aquí, nunca en la web del cliente. (Corte habitual, preferencias, avisos…)
        </p>
        <textarea
          value={notes}
          maxLength={2000}
          rows={4}
          placeholder="Ej.: degradado nº 2, arreglo de barba con navaja, prefiere por la tarde…"
          onChange={(e) => { setNotes(e.target.value); setOk(""); }}
          style={{ width: "100%", resize: "vertical" }}
        />
        <div style={{ marginTop: 10 }}>
          <button onClick={saveNotes} disabled={saving}>
            {saving ? "Guardando…" : "Guardar notas"}
          </button>
        </div>
        {ok && <p className="msg-ok">{ok}</p>}
        {error && <p className="msg-error">{error}</p>}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Historial de citas ({appointments.length})</h2>
        {appointments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Todavía no tiene citas.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Servicio</th><th>Profesional</th><th>Precio</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} style={a.status !== "confirmed" ? { opacity: 0.6 } : undefined}>
                    <td>{fmtDT(a.starts_at)}</td>
                    <td>
                      {a.services?.name}
                      {(a.appointment_products || []).length > 0 && (
                        <span style={{ color: "var(--muted)" }}>
                          {" "}· 🧴 {(a.appointment_products || []).map((p2) => `${p2.products?.name} x${p2.quantity}`).join(", ")}
                        </span>
                      )}
                    </td>
                    <td>{a.employees?.name}</td>
                    <td>{Number(a.services?.price_eur || 0).toFixed(2)} €</td>
                    <td>{statusBadge(a.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Pedidos ({orders.length})</h2>
        {orders.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Todavía no tiene pedidos.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Artículos</th><th>Total</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const total = (o.order_items || []).reduce(
                    (acc, it) => acc + it.quantity * Number(it.price_eur || 0),
                    0
                  );
                  return (
                    <tr key={o.id} style={o.status === "cancelled" ? { opacity: 0.6 } : undefined}>
                      <td>{fmtDT(o.created_at)}</td>
                      <td>{(o.order_items || []).map((it) => `${it.products?.name} x${it.quantity}`).join(", ")}</td>
                      <td>{total.toFixed(2)} €</td>
                      <td>
                        <span className={`badge ${o.status === "cancelled" ? "cancelled" : ""}`}>
                          {o.status === "pending" ? "Pendiente" : o.status === "delivered" ? "Entregado" : "Cancelado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
