create or replace function public.is_admin() returns boolean
language sql stable
as $$
select coalesce(
  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean)
  or lower(auth.jwt() -> 'app_metadata' ->> 'user_role') = 'admin',
  false
)
$$;

create or replace function public.is_admin(user_id uuid) returns boolean
language sql stable
as $$
select coalesce(
  exists (
    select 1
    from auth.users u
    where u.id = user_id
      and (
        (u.raw_app_meta_data->>'is_admin')::boolean = true
        or lower(u.raw_app_meta_data->>'user_role') = 'admin'
      )
  ),
  false
)
$$;

create extension if not exists pgcrypto;

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.purchase_images enable row level security;
alter table public.winning_photos enable row level security;
alter table public.local_payment_methods enable row level security;
alter table public.site_settings enable row level security;
alter table public.purchase_intents enable row level security;
alter table public.product_keys enable row level security;
alter table public.product_key_costs enable row level security;
alter table public.brand_balances enable row level security;
alter table public.balance_transactions enable row level security;
alter table public.video_library enable row level security;
alter table public.banned_ips enable row level security;
alter table public.hard_banned_ips enable row level security;
alter table public.banned_countries enable row level security;
alter table public.banned_customers enable row level security;
alter table public.visitor_logs enable row level security;
alter table public.blocked_logs enable row level security;

create table if not exists public.verified_users (
  id uuid default gen_random_uuid() primary key,
  username text not null,
  product_type text not null,
  created_at timestamptz default now()
);

alter table public.verified_users enable row level security;

drop policy if exists "allow_public_products_anon" on public.products;
drop policy if exists "allow_public_products_auth" on public.products;
create policy "allow_public_products_anon"
on public.products for select to anon
using (is_hidden = false);
create policy "allow_public_products_auth"
on public.products for select to authenticated
using (is_hidden = false);

drop policy if exists "allow_public_categories_anon" on public.categories;
drop policy if exists "allow_public_categories_auth" on public.categories;
create policy "allow_public_categories_anon"
on public.categories for select to anon
using (true);
create policy "allow_public_categories_auth"
on public.categories for select to authenticated
using (true);

drop policy if exists "allow_public_purchase_images_anon" on public.purchase_images;
drop policy if exists "allow_public_purchase_images_auth" on public.purchase_images;
create policy "allow_public_purchase_images_anon"
on public.purchase_images for select to anon
using (true);
create policy "allow_public_purchase_images_auth"
on public.purchase_images for select to authenticated
using (true);

drop policy if exists "allow_public_winning_photos_anon" on public.winning_photos;
drop policy if exists "allow_public_winning_photos_auth" on public.winning_photos;
create policy "allow_public_winning_photos_anon"
on public.winning_photos for select to anon
using (true);
create policy "allow_public_winning_photos_auth"
on public.winning_photos for select to authenticated
using (true);

drop policy if exists "allow_public_local_methods_anon" on public.local_payment_methods;
drop policy if exists "allow_public_local_methods_auth" on public.local_payment_methods;
create policy "allow_public_local_methods_anon"
on public.local_payment_methods for select to anon
using (is_active = true);
create policy "allow_public_local_methods_auth"
on public.local_payment_methods for select to authenticated
using (is_active = true);

drop policy if exists "allow_public_settings_anon" on public.site_settings;
drop policy if exists "allow_public_settings_auth" on public.site_settings;
drop policy if exists "allow_admin_settings_select" on public.site_settings;
drop policy if exists "allow_admin_settings_modify" on public.site_settings;
create policy "allow_public_settings_anon"
on public.site_settings for select to anon
using (key in ('site_logo_url','support_contact','footer_notes','payment_gateway_tax','geo_ban_message','ip_ban_message','vpn_ban_message','advanced_ban_message'));
create policy "allow_public_settings_auth"
on public.site_settings for select to authenticated
using (key in ('site_logo_url','support_contact','footer_notes','payment_gateway_tax','geo_ban_message','ip_ban_message','vpn_ban_message','advanced_ban_message'));
create policy "allow_admin_settings_select"
on public.site_settings for select to authenticated
using (public.is_admin());
create policy "allow_admin_settings_modify"
on public.site_settings for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "purchase_intents_insert_anon" on public.purchase_intents;
drop policy if exists "purchase_intents_insert_auth" on public.purchase_intents;
drop policy if exists "purchase_intents_admin_select" on public.purchase_intents;
drop policy if exists "purchase_intents_admin_delete" on public.purchase_intents;
drop policy if exists "purchase_intents_admin_update" on public.purchase_intents;
create policy "purchase_intents_insert_anon"
on public.purchase_intents for insert to anon
with check (true);
create policy "purchase_intents_insert_auth"
on public.purchase_intents for insert to authenticated
with check (true);
create policy "purchase_intents_admin_select"
on public.purchase_intents for select to authenticated
using (public.is_admin());
create policy "purchase_intents_admin_delete"
on public.purchase_intents for delete to authenticated
using (public.is_admin());
create policy "purchase_intents_admin_update"
on public.purchase_intents for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "product_keys_admin_all" on public.product_keys;
create policy "product_keys_admin_all"
on public.product_keys for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "product_key_costs_admin_all" on public.product_key_costs;
create policy "product_key_costs_admin_all"
on public.product_key_costs for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "brand_balances_admin_all" on public.brand_balances;
create policy "brand_balances_admin_all"
on public.brand_balances for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "balance_transactions_admin_all" on public.balance_transactions;
create policy "balance_transactions_admin_all"
on public.balance_transactions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "video_library_public_select_anon" on public.video_library;
drop policy if exists "video_library_public_select_auth" on public.video_library;
drop policy if exists "video_library_admin_modify" on public.video_library;
create policy "video_library_public_select_anon"
on public.video_library for select to anon
using (true);
create policy "video_library_public_select_auth"
on public.video_library for select to authenticated
using (true);
create policy "video_library_admin_modify"
on public.video_library for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "banned_ips_admin_all" on public.banned_ips;
create policy "banned_ips_admin_all"
on public.banned_ips for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "hard_banned_ips_admin_all" on public.hard_banned_ips;
create policy "hard_banned_ips_admin_all"
on public.hard_banned_ips for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "banned_countries_admin_all" on public.banned_countries;
create policy "banned_countries_admin_all"
on public.banned_countries for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "banned_customers_admin_all" on public.banned_customers;
create policy "banned_customers_admin_all"
on public.banned_customers for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "visitor_logs_admin_select" on public.visitor_logs;
drop policy if exists "visitor_logs_admin_modify" on public.visitor_logs;
create policy "visitor_logs_admin_select"
on public.visitor_logs for select to authenticated
using (public.is_admin());
create policy "visitor_logs_admin_modify"
on public.visitor_logs for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "blocked_logs_admin_select" on public.blocked_logs;
drop policy if exists "blocked_logs_admin_modify" on public.blocked_logs;
create policy "blocked_logs_admin_select"
on public.blocked_logs for select to authenticated
using (public.is_admin());
create policy "blocked_logs_admin_modify"
on public.blocked_logs for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "verified_users_admin_all" on public.verified_users;
create policy "verified_users_admin_all"
on public.verified_users for all to authenticated
using (public.is_admin())
with check (public.is_admin());
