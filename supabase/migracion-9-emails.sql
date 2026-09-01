-- ============================================================
-- Migración 9: email del cliente + control de recordatorios
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

alter table public.clients add column if not exists email text;

alter table public.appointments add column if not exists reminder_sent_at timestamptz;

create index if not exists idx_appointments_reminder
  on public.appointments (starts_at)
  where reminder_sent_at is null and status = 'confirmed';
