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
          <Link href="/" className={active === "reservar" ? "active" : ""}>
            Reservar
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
        ✂️ Hairfy · Reserva online las 24 h · Para cambios de última hora,
        llámanos
      </p>
    </footer>
  );
}
