create or replace function public.ban_device(p_cpuid text, p_username text default null, p_product text default 'cheatloop', p_reason text default 'manual ban')
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if p_cpuid is null or length(trim(p_cpuid)) = 0 then
    raise exception 'cpuid required';
  end if;
  update core.device_bans
    set banned = true,
        reason = coalesce(p_reason, reason),
        username = coalesce(p_username, username),
        product_type = coalesce(p_product, product_type),
        lifted_at = null
  where cpuid = p_cpuid;
  if not found then
    insert into core.device_bans (cpuid, username, product_type, reason, banned)
    values (p_cpuid, p_username, p_product, coalesce(p_reason, 'manual ban'), true);
  end if;
end;
$$;

create or replace function public.unban_device(p_cpuid text)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  update core.device_bans
    set banned = false,
        lifted_at = now()
  where cpuid = p_cpuid
    and banned = true;
end;
$$;

create or replace function public.add_verification_log(
  p_username text,
  p_product text,
  p_cpuid text default null,
  p_verified boolean default false,
  p_suspicion boolean default false,
  p_report_summary text default null
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  insert into core.verification_logs (username, product_type, cpuid, verified, suspicion, report_summary)
  values (p_username, p_product, p_cpuid, coalesce(p_verified, false), coalesce(p_suspicion, false), p_report_summary);
end;
$$;
