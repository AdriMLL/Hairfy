// Logotipo de Hairfy: tijeras doradas + nombre.
export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="hairfy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6c887" />
          <stop offset="1" stopColor="#a87f3d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#14110e" stroke="#2b2620" />
      <g stroke="url(#hairfy-gold)" strokeWidth="3.2" strokeLinecap="round" fill="none">
        <line x1="20" y1="14" x2="41" y2="46" />
        <line x1="44" y1="14" x2="23" y2="46" />
        <circle cx="19" cy="51" r="5.2" />
        <circle cx="45" cy="51" r="5.2" />
      </g>
      <circle cx="32" cy="32" r="2.6" fill="url(#hairfy-gold)" />
    </svg>
  );
}

export function Logo({ size = 34 }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">
        Hair<span className="logo-accent">fy</span>
      </span>
    </span>
  );
}
