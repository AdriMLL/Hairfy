-- ============================================================
-- Migración 5: pedidos de productos independientes de las citas
-- Pega este archivo en Supabase -> SQL Editor -> Run
-- ============================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity between 1 and 20),
  price_eur numeric(8,2) not null
);

create index if not exists idx_orders_client on public.orders (client_id);
create index if not exists idx_order_items_order on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
