import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader({ active }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="logo-link" aria-label="Hairfy, inicio">
          <Logo />
        </Link>
        <nav className="site-nav">
          <Link href="/#reservar" className={active === "reservar" ? "active" : ""}>
            Reservar
          </Link>
          <Link href="/#pedidos" className={active === "pedidos" ? "active" : ""}>
            Pedidos
          </Link>
          <Link href="/#nosotros" className={active === "nosotros" ? "active" : ""}>
            Nosotros
          </Link>
          <Link href="/mis-citas" className={active === "mis-citas" ? "active" : ""}>
            Mis citas
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        ✂️ Peluquería Caballero Fennani Barbershop · C. Pedro de Valdivia, 3,
        Leganés ·{" "}
        <a href="tel:+34627556151" style={{ color: "var(--gold-strong)" }}>
          627 55 61 51
        </a>
      </p>
      <p style={{ marginTop: 6 }}>Reserva online las 24 h · Para cambios de última hora, llámanos</p>
    </footer>
  );
}
