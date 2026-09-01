-- ============================================================
-- Migración 3: productos + horario configurable
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

-- Productos que vende la peluquería
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_eur numeric(8,2) not null check (price_eur >= 0),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Productos reservados junto a una cita
create table if not exists public.appointment_products (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null default 1 check (quantity between 1 and 20),
  created_at timestamptz not null default now()
);

create index if not exists idx_appt_products_appt
  on public.appointment_products (appointment_id);

-- Ajustes configurables desde el panel admin (horario, etc.)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.appointment_products enable row level security;
alter table public.settings enable row level security;

-- Horario inicial (editable después desde Admin -> Horario)
insert into public.settings (key, value) values (
  'business_hours',
  '{
    "0": null,
    "1": null,
    "2": [{"open":"09:30","close":"13:30"},{"open":"16:00","close":"20:00"}],
    "3": [{"open":"09:30","close":"13:30"},{"open":"16:00","close":"20:00"}],
    "4": [{"open":"09:30","close":"13:30"},{"open":"16:00","close":"20:00"}],
    "5": [{"open":"09:30","close":"13:30"},{"open":"16:00","close":"20:00"}],
    "6": [{"open":"09:00","close":"14:00"}]
  }'::jsonb
) on conflict (key) do nothing;

-- Un par de productos de ejemplo
insert into public.products (name, description, price_eur, stock) values
  ('Champú reparador 300ml', 'Cabello seco o dañado', 12.50, 10),
  ('Cera moldeadora', 'Fijación media, acabado mate', 9.90, 15);
