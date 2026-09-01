-- ============================================================
-- Migración 2: código de acceso de cliente (área "Mis citas")
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

alter table public.clients add column if not exists access_code text;

-- Genera un código a los clientes que ya existían
update public.clients c
set access_code = 'HF-' || upper(substr(md5(c.id::text || random()::text), 1, 4))
where c.access_code is null;

create unique index if not exists idx_clients_access_code
  on public.clients (access_code);
