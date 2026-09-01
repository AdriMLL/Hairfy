-- Migración 10 (v16): seguridad y cumplimiento
-- 1) Tabla de límites compartida entre todas las instancias del servidor
-- 2) Fecha de aceptación de términos/privacidad en la ficha del cliente

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  until timestamptz not null
);

alter table public.rate_limits enable row level security;

alter table public.clients
  add column if not exists accepted_terms_at timestamptz;
