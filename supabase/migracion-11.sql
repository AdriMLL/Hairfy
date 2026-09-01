-- Migración 11 (v17): festivos/vacaciones, no-shows y consentimiento de marketing

-- 1) Cierres del negocio o de un empleado (festivos, vacaciones, días sueltos)
create table if not exists public.closures (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  reason text,
  employee_id uuid references public.employees(id) on delete cascade, -- null = todo el negocio
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table public.closures enable row level security;

-- 2) Estado "no vino" en las citas
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('confirmed', 'cancelled', 'no_show'));

-- 3) Consentimiento de comunicaciones comerciales (opcional, separado del de servicio)
alter table public.clients
  add column if not exists marketing_consent_at timestamptz;
