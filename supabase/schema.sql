-- ============================================================
-- Hairfy - Esquema de base de datos para Supabase (PostgreSQL)
-- Pega este archivo completo en: Supabase -> SQL Editor -> Run
-- ============================================================

-- Extensión necesaria para evitar citas solapadas del mismo empleado
create extension if not exists btree_gist;

-- Empleados / peluqueros
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Servicios (corte, tinte, etc.)
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min integer not null check (duration_min between 5 and 480),
  price_eur numeric(8,2) not null check (price_eur >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Clientes
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  created_at timestamptz not null default now()
);

-- Citas
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  service_id uuid not null references public.services(id),
  client_id uuid not null references public.clients(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Un mismo empleado no puede tener dos citas confirmadas a la vez.
  -- Esto protege incluso si dos personas reservan exactamente al mismo tiempo.
  constraint no_overlap exclude using gist (
    employee_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmed')
);

create index if not exists idx_appointments_day
  on public.appointments (employee_id, starts_at);

-- ============================================================
-- Seguridad: RLS activado y SIN políticas => nadie puede tocar
-- las tablas con la clave pública (anon). Todo el acceso pasa
-- por el servidor de Next.js con la clave service_role.
-- ============================================================
alter table public.employees enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;

-- ============================================================
-- Datos de ejemplo (puedes editarlos o borrarlos desde el panel admin)
-- ============================================================
insert into public.employees (name) values ('Marta'), ('Luis');

insert into public.services (name, duration_min, price_eur) values
  ('Corte de pelo', 30, 15.00),
  ('Corte + lavado', 45, 20.00),
  ('Tinte', 90, 45.00),
  ('Peinado', 30, 18.00);
