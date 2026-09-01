-- ============================================================
-- Migración 8: registro de actividad (trazabilidad)
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('cliente', 'admin', 'sistema')),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_created
  on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;
