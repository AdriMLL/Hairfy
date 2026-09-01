-- ============================================================
-- Migración 7: imagen en los productos
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists image_path text;
