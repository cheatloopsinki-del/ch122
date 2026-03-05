create table if not exists public.money_motion_orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  checkout_session_id text not null,
  status text not null,
  total_in_cents integer not null,
  event text not null,
  customer_email text,
  payment_type text,
  card_brand text,
  last_four text,
  store_id text,
  raw_payload jsonb not null
);

alter table public.money_motion_orders enable row level security;

drop policy if exists "Admin full access for money_motion_orders" on public.money_motion_orders;
create policy "Admin full access for money_motion_orders" on public.money_motion_orders
for all using (auth.role() = 'authenticated');
