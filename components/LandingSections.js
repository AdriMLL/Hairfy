// Secciones del negocio: galería, reseñas y ubicación (se usan en la portada)

export function Stars({ n }) {
  return (
    <span style={{ color: "var(--gold-strong)", letterSpacing: 2 }} aria-label={`${n} de 5 estrellas`}>
      {"★".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function LandingSections({ meta }) {
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
