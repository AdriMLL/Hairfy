-- ============================================================
-- Migración 4: horario por empleado, reseñas y galería
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

-- Horario propio por empleado (null = usa el horario general)
alter table public.employees add column if not exists hours jsonb;

-- Reseñas de clientes (tras su cita; el admin las aprueba)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Galería de trabajos (metadatos; la imagen vive en Supabase Storage)
create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;
alter table public.gallery enable row level security;

-- Bucket público para las fotos de la galería
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- Horario real del negocio (martes cerrado, resto 9:30-21:00)
update public.settings
set value = '{
  "0": [{"open":"09:30","close":"21:00"}],
  "1": [{"open":"09:30","close":"21:00"}],
  "2": null,
  "3": [{"open":"09:30","close":"21:00"}],
  "4": [{"open":"09:30","close":"21:00"}],
  "5": [{"open":"09:30","close":"21:00"}],
  "6": [{"open":"09:30","close":"21:00"}]
}'::jsonb,
updated_at = now()
where key = 'business_hours';
