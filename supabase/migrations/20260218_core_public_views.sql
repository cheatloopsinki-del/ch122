create or replace view public.verified_users as
select id, username, product_type, cpuid, verified, created_at
from core.verified_users;

create or replace view public.verification_logs as
select id, username, product_type, cpuid, verified, suspicion, report_summary, created_at
from core.verification_logs;

create or replace view public.device_bans as
select id, cpuid, username, product_type, reason, banned, created_at, lifted_at
from core.device_bans;

create or replace view public.user_device_overview as
select 
  username,
  product_type,
  cpuid,
  verified_flag,
  banned,
  reason,
  last_attempt,
  (select count(*) from core.verification_logs vl where vl.username = udo.username and vl.product_type = udo.product_type) as attempts_count,
  any_suspicion
from core.user_device_overview udo;
