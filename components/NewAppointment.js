"use client";

import { useEffect, useState } from "react";

// Formulario del personal para apuntar una cita (cliente por teléfono o en tienda).
// Dos pasos claros: 1) quién es el cliente, 2) servicio, día y hora.

function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

export function NewAppointment({ api, defaultDate, defaultTime, onDone }) {
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
      ? clients.find((c) => (c.phone || "").includes(phoneDigits.slice(-9)))
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
      setError(
        clientMode === "existente"
          ? 'Elige un cliente de la lista (o pasa a "Cliente nuevo")'
          : "Faltan el nombre o el teléfono"
      );
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

  const service = services.find((s) => s.id === serviceId);
  const freeSlots = (slots || []).filter((s) => s.free);

  return (
    <form onSubmit={submit} className="na">
      <div className="na-head">
        <h3>Apuntar cita</h3>
        <p>Para clientes que llaman por teléfono o vienen a la tienda</p>
      </div>

      {/* Paso 1: cliente */}
      <div className="na-section">
        <div className="na-step">
          <span className="na-num">1</span>
          <span className="na-title">¿Quién es el cliente?</span>
        </div>

        <div className="pills na-pills">
          <button
            type="button"
            className={`pill ${clientMode === "existente" ? "selected" : ""}`}
            onClick={() => { setClientMode("existente"); setError(""); }}
          >
            🔍 Ya es cliente
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
          <div className="na-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busca por nombre o teléfono…"
              aria-label="Buscar cliente"
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
              <p className="na-hint">
                No hay ningún cliente con ese nombre o teléfono.{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    setClientMode("nuevo");
                    setName(search.replace(/[\d\s+-]{6,}/g, "").trim());
                    if (qDigits.length >= 9) setPhone(qDigits);
                  }}
                >
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
            <div className="na-grid">
              <div>
                <label htmlFor="na-name">Nombre</label>
                <input id="na-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="María García" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="na-phone">Teléfono</label>
                <input id="na-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={9} placeholder="600 123 456" autoComplete="off" />
              </div>
            </div>
            {phoneMatch && (
              <p className="na-hint" style={{ color: "var(--danger)" }}>
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
      </div>

      {/* Paso 2: servicio, día y hora */}
      <div className="na-section">
        <div className="na-step">
          <span className="na-num">2</span>
          <span className="na-title">Servicio, día y hora</span>
        </div>

        <div className="na-grid">
          <div className="na-service">
            <label htmlFor="na-service">Servicio</label>
            <select id="na-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              <option value="">Elige un servicio…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.duration_min} min · {Number(s.price_eur).toFixed(2)} €
                </option>
              ))}
            </select>
          </div>
          {employees.length > 1 && (
            <div>
              <label htmlFor="na-emp">Profesional</label>
              <select id="na-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                <option value="">Elige…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="na-date">Día</label>
            <input id="na-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        {!serviceId && <p className="na-hint">Elige el servicio para ver las horas libres del día.</p>}

        {slots && (
          <div style={{ marginTop: 10 }}>
            <label style={{ margin: "0 0 6px" }}>Hora {startsAt && service ? `· ${service.name}` : ""}</label>
            {freeSlots.length === 0 ? (
              <p className="na-hint">No quedan huecos libres ese día (o está cerrado). Prueba otro día.</p>
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
          </div>
        )}
      </div>

      <div className="na-footer">
        <button type="submit" className="na-submit" disabled={saving || !startsAt || !clientReady}>
          {saving
            ? "Guardando…"
            : startsAt && clientReady && service
            ? `Apuntar: ${clientName.split(" ")[0]} · ${(slots || []).find((s) => s.startsAt === startsAt)?.time} ✂️`
            : "Apuntar cita"}
        </button>
        {error && <p className="msg-error" style={{ margin: 0 }}>{error}</p>}
      </div>
    </form>
  );
}
