"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

export default function BookingPage() {
  const [meta, setMeta] = useState(null);
  const [service, setService] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m) => {
        setMeta(m);
        // Un solo profesional: se asigna solo y no se pregunta
        if (m?.employees?.length === 1) setEmployee(m.employees[0]);
      })
      .catch(() => setError("No se pudo cargar la información"));
  }, []);

  const singleEmployee = meta?.employees?.length === 1;

  // Numeración dinámica de pasos
  const stepDay = singleEmployee ? 2 : 3;
  const stepData = stepDay + 1;

  // Si viene desde "Mis citas", rellenamos sus datos automáticamente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("name")) setName(params.get("name"));
    if (params.get("phone")) setPhone(params.get("phone"));
  }, []);

  const { minDate, maxDate } = useMemo(() => {
    const fmt = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const max = new Date(now.getTime() + (meta?.maxDaysAhead ?? 30) * 86400000);
    return { minDate: fmt(now), maxDate: fmt(max) };
  }, [meta]);

  useEffect(() => {
    setSlot(null);
    setSlots(null);
    if (!service || !employee || !date) return;
    const params = new URLSearchParams({
      date,
      employeeId: employee.id,
      serviceId: service.id,
    });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setError("No se pudo consultar la disponibilidad"));
  }, [service, employee, date]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          employeeId: employee.id,
          date,
          startsAt: slot.startsAt,
          name,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la reserva");
        if (res.status === 409) {
          const params = new URLSearchParams({
            date,
            employeeId: employee.id,
            serviceId: service.id,
          });
          const d = await fetch(`/api/availability?${params}`).then((r) => r.json());
          setSlots(d.slots ?? []);
          setSlot(null);
        }
      } else {
        setDone({
          startsAt: data.startsAt,
          accessCode: data.accessCode,
          products: data.products || [],
        });
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const when = new Date(done.startsAt).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <>
        <SiteHeader active="reservar" />
        <main className="container">
          <div className="card" style={{ textAlign: "center" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.6rem" }}>✨ ¡Cita confirmada!</h2>
            <p style={{ fontSize: "1.05rem" }}>
              Te esperamos el <strong style={{ color: "var(--gold-strong)" }}>{when}</strong>
            </p>
            {done.products.length > 0 && (
              <p style={{ color: "var(--muted)" }}>
                Te guardamos: {done.products.join(", ")} — los recoges y pagas en la peluquería.
              </p>
            )}
            {done.accessCode && (
              <div className="code-box">
                <small>Tu código de cliente — guárdalo para consultar o cancelar tus citas</small>
                <span className="code">{done.accessCode}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/mis-citas">
                <button className="secondary">Ver mis citas</button>
              </a>
              <button onClick={() => window.location.reload()}>Hacer otra reserva</button>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader active="reservar" />
      <div className="hero">
        <h1>
          Fennani <em>Barbershop</em>
        </h1>
        <p>Tu barbería en Leganés · Reserva tu cita en menos de un minuto</p>
        {meta?.business && (
          <a
            className="rating-badge"
            href={meta.business.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ★ {meta.business.googleRating.toFixed(1)} en Google ·{" "}
            {meta.business.googleReviewCount} reseñas
          </a>
        )}
      </div>
      <main className="container">
        <form className="card" onSubmit={submit}>
          <div className="step-title">
            <span className="step-num">1</span>
            <h2 style={{ margin: 0 }}>Elige tu servicio</h2>
          </div>
          <div className="option-grid">
            {meta?.services?.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`option-card ${service?.id === s.id ? "selected" : ""}`}
                onClick={() => setService(s)}
              >
                <span className="name">{s.name}</span>
                <span className="meta">
                  {s.duration_min} min · <span className="price">{Number(s.price_eur).toFixed(2)} €</span>
                </span>
              </button>
            ))}
            {!meta && <p style={{ color: "var(--muted)" }}>Cargando servicios…</p>}
          </div>

          {service && !singleEmployee && (
            <>
              <div className="step-title">
                <span className="step-num">2</span>
                <h2 style={{ margin: 0 }}>¿Con quién?</h2>
              </div>
              <div className="pills">
                {meta?.employees?.map((emp) => (
                  <button
                    type="button"
                    key={emp.id}
                    className={`pill ${employee?.id === emp.id ? "selected" : ""}`}
                    onClick={() => setEmployee(emp)}
                  >
                    {emp.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {service && employee && (
            <>
              <div className="step-title">
                <span className="step-num">{stepDay}</span>
                <h2 style={{ margin: 0 }}>Día y hora</h2>
              </div>
              {singleEmployee && (
                <p style={{ color: "var(--muted)", margin: "0 0 4px" }}>
                  Te atenderá <strong style={{ color: "var(--ink)" }}>{employee.name}</strong>
                </p>
              )}
              <label htmlFor="date">Día</label>
              <input
                id="date"
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              {slots && (
                <>
                  <label>Hora — las tachadas ya están reservadas</label>
                  {slots.length === 0 ? (
                    <p style={{ color: "var(--muted)" }}>
                      Ese día está cerrado o ya no quedan horas. Prueba otro día.
                    </p>
                  ) : (
                    <>
                      <div className="slots">
                        {slots.map((s) =>
                          s.free ? (
                            <button
                              type="button"
                              key={s.startsAt}
                              className={`slot ${slot?.startsAt === s.startsAt ? "selected" : ""}`}
                              onClick={() => setSlot(s)}
                            >
                              {s.time}
                            </button>
                          ) : (
                            <span key={s.startsAt} className="slot busy" title="Hora reservada">
                              {s.time}
                            </span>
                          )
                        )}
                      </div>
                      {slots.every((s) => !s.free) && (
                        <p style={{ color: "var(--muted)", marginTop: 10 }}>
                          Todas las horas de ese día están reservadas. Prueba otro día.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {slot && (
            <>
              <div className="step-title">
                <span className="step-num">{stepData}</span>
                <h2 style={{ margin: 0 }}>Tus datos</h2>
              </div>
              <label htmlFor="name">Nombre</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                placeholder="María García"
              />
              <label htmlFor="phone">Teléfono</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                minLength={9}
                maxLength={20}
                autoComplete="tel"
                placeholder="600 123 456"
              />
              <div className="summary">
                <strong>{service.name}</strong> con <strong>{employee.name}</strong> ·{" "}
                {new Date(slot.startsAt).toLocaleString("es-ES", {
                  timeZone: "Europe/Madrid",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <br />
                Precio: <strong>{Number(service.price_eur).toFixed(2)} €</strong>
              </div>
              <div style={{ marginTop: 18 }}>
                <button type="submit" className="block" disabled={loading}>
                  {loading ? "Reservando…" : "Confirmar reserva ✨"}
                </button>
              </div>
            </>
          )}

          {error && <p className="msg-error">{error}</p>}
        </form>

        {meta?.business && <LandingSections meta={meta} />}
      </main>
      <SiteFooter />
    </>
  );
}

// ---------- Secciones del negocio (galería, reseñas, ubicación) ----------

function Stars({ n }) {
  return (
    <span style={{ color: "var(--gold-strong)", letterSpacing: 2 }} aria-label={`${n} de 5 estrellas`}>
      {"★".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

function LandingSections({ meta }) {
  const b = meta.business;
  const photos = [
    ...(meta.gallery || []).map((g) => ({ url: g.url, caption: g.caption })),
    ...(b.photos || []).map((url) => ({ url, caption: null })),
  ].slice(0, 9);

  const reviews = [
    ...(meta.appReviews || []).map((r) => ({
      author: r.author,
      text: r.comment,
      rating: r.rating,
      source: "clientes de la web",
    })),
    ...(b.googleReviews || []).map((r) => ({
      author: r.author,
      text: r.text,
      rating: 5,
      source: "Google",
    })),
  ]
    .filter((r) => r.text)
    .slice(0, 6);

  return (
    <>
      {photos.length > 0 && (
        <section className="landing-section">
          <h2 className="section-title">La barbería</h2>
          <div className="gallery">
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt={p.caption || `Fennani Barbershop — foto ${i + 1}`} loading="lazy" />
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="landing-section">
          <h2 className="section-title">
            Lo que dicen nuestros clientes{" "}
            <a
              href={b.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rating-badge"
              style={{ marginLeft: 8, verticalAlign: "middle" }}
            >
              ★ {b.googleRating.toFixed(1)} · {b.googleReviewCount} reseñas en Google
            </a>
          </h2>
          <div className="reviews-grid">
            {reviews.map((r, i) => (
              <figure key={i} className="review-card">
                <Stars n={r.rating} />
                <blockquote>“{r.text}”</blockquote>
                <figcaption>
                  {r.author} · <span style={{ color: "var(--muted)" }}>{r.source}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="landing-section">
        <h2 className="section-title">Dónde estamos</h2>
        <div className="location-grid">
          <div className="card" style={{ marginTop: 0 }}>
            <p style={{ marginTop: 0 }}>
              📍 <strong>{b.address}</strong>
            </p>
            <p>
              📞{" "}
              <a href={`tel:${b.phoneLink}`} style={{ color: "var(--gold-strong)", fontWeight: 700 }}>
                {b.phone}
              </a>
            </p>
            <p style={{ color: "var(--muted)" }}>
              🕤 Abierto de 9:30 a 21:00 · Martes cerrado
            </p>
            <a href={b.mapsUrl} target="_blank" rel="noopener noreferrer">
              <button className="secondary">Cómo llegar (Google Maps)</button>
            </a>
          </div>
          <div className="map-wrap">
            <iframe
              src={b.mapsEmbedUrl}
              title="Mapa: Fennani Barbershop en Leganés"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
    </>
  );
}
