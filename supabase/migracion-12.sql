-- Migración 12 (v18): ficha de cliente
-- Notas privadas del barbero sobre cada cliente (solo visibles en el admin)
alter table public.clients
  add column if not exists notes text;
