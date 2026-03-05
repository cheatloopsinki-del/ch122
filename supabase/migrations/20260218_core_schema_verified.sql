create schema if not exists core;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='verified_users')
  then execute 'alter table public.verified_users set schema core'; end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='verification_logs')
  then execute 'alter table public.verification_logs set schema core'; end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='device_bans')
  then execute 'alter table public.device_bans set schema core'; end if;
end $$;

create extension if not exists pgcrypto;

create table if not exists core.verified_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  product_type text not null check (product_type = any (array['cheatloop','sinki'])),
  cpuid text,
  verified boolean not null default true,
  created_at timestamptz default now(),
  constraint verified_users_username_product_type_key unique (username, product_type)
);
create unique index if not exists verified_users_cpuid_unique
  on core.verified_users (cpuid) where cpuid is not null;

create table if not exists core.verification_logs (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  product_type text not null check (product_type = any (array['cheatloop','sinki'])),
  cpuid text,
  verified boolean not null default false,
  suspicion boolean not null default false,
  report_summary text,
  created_at timestamptz not null default now()
);
create index if not exists verification_logs_user_idx
  on core.verification_logs (username, product_type, created_at desc);

create table if not exists core.device_bans (
  id uuid primary key default gen_random_uuid(),
  cpuid text not null,
  username text,
  product_type text not null check (product_type = any (array['cheatloop','sinki'])),
  reason text,
  banned boolean not null default true,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
create unique index if not exists device_bans_cpuid_active_unique
  on core.device_bans (cpuid) where banned is true;

alter table core.verified_users enable row level security;
alter table core.verification_logs enable row level security;
alter table core.device_bans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='core' and tablename='verification_logs' and policyname='Anon can insert verification_logs')
  then create policy "Anon can insert verification_logs"
    on core.verification_logs for insert to anon
    with check (length(username) > 0 and product_type = any (array['cheatloop','sinki']));
  end if;

  if not exists (select 1 from pg_policies where schemaname='core' and tablename='verification_logs' and policyname='Public can read verification_logs')
  then create policy "Public can read verification_logs"
    on core.verification_logs for select to public using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='core' and tablename='verified_users' and policyname='Public can read verified_users')
  then create policy "Public can read verified_users"
    on core.verified_users for select to public using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='core' and tablename='verified_users' and policyname='Authenticated can update verified flag')
  then create policy "Authenticated can update verified flag"
    on core.verified_users for update to authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='core' and tablename='device_bans' and policyname='Anon can insert bans')
  then create policy "Anon can insert bans"
    on core.device_bans for insert to anon with check (banned is true and length(cpuid) > 0);
  end if;

  if not exists (select 1 from pg_policies where schemaname='core' and tablename='device_bans' and policyname='Anon can read device_bans')
  then create policy "Anon can read device_bans"
    on core.device_bans for select to anon using (true);
  end if;
end $$;

create or replace view core.user_device_overview as
select
  vu.username,
  vu.product_type,
  vu.cpuid,
  vu.verified as verified_flag,
  coalesce(db.banned, false) as banned,
  db.reason,
  (select max(created_at) from core.verification_logs vl where vl.username = vu.username and vl.product_type = vu.product_type) as last_attempt,
  (select count(*) from core.verification_logs vl where vl.username = vu.username and vl.product_type = vu.product_type) as attempts,
  (select count(*) from core.verification_logs vl where vl.username = vu.username and vl.product_type = vu.product_type and vl.suspicion is true) as suspicious_attempts,
  (select bool_or(suspicion) from core.verification_logs vl where vl.username = vu.username and vl.product_type = vu.product_type) as any_suspicion
from core.verified_users vu
left join core.device_bans db on db.cpuid = vu.cpuid and db.banned is true;

create table if not exists core.admins (
  user_id uuid primary key
);
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='core' and tablename='device_bans' and policyname='Admins manage device_bans')
  then create policy "Admins manage device_bans"
    on core.device_bans for all to authenticated
    using (exists (select 1 from core.admins a where a.user_id = auth.uid()))
    with check (exists (select 1 from core.admins a where a.user_id = auth.uid()));
  end if;
end $$;

create or replace function core.unban_device(p_cpuid text)
returns void language sql security definer set search_path = core as $$
update core.device_bans set banned=false, lifted_at=now()
where cpuid=p_cpuid and banned is true;
$$;

create or replace view core.admin_logs_recent as
select
  username, product_type, cpuid, verified, suspicion, created_at,
  case
    when suspicion is true then 'Suspicious'
    when verified is true then 'Clean'
    else 'Unknown'
  end as status_tag
from core.verification_logs
order by created_at desc
limit 500;

create or replace function core.ban_device(p_cpuid text, p_username text, p_product text, p_reason text)
returns void language sql security definer set search_path = core as $$
insert into core.device_bans (cpuid, username, product_type, reason, banned)
values (p_cpuid, coalesce(p_username,''), coalesce(p_product,''), coalesce(p_reason,'manual ban'), true)
on conflict (cpuid) where device_bans.banned is true do update
set username = excluded.username,
    product_type = excluded.product_type,
    reason = excluded.reason,
    banned = true;
$$;
