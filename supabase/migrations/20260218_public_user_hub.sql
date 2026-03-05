create extension if not exists pgcrypto;

create table if not exists public.user_hub (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  product_type text not null check (product_type = any (array['cheatloop','sinki'])),
  cpuid text,
  verified boolean not null default true,
  attempts integer not null default 0,
  any_suspicion boolean not null default false,
  last_attempt timestamptz,
  latest_log_id uuid,
  latest_verified boolean,
  latest_suspicion boolean,
  latest_report_summary text,
  latest_created_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_hub enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_hub'
      and policyname='Public can read user_hub'
  ) then
    create policy "Public can read user_hub"
      on public.user_hub for select to public using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_hub'
      and policyname='Authenticated can write user_hub'
  ) then
    create policy "Authenticated can write user_hub"
      on public.user_hub for all to authenticated
      using (true) with check (true);
  end if;
end $$;
