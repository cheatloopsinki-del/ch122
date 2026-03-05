-- إضافة أعمدة لتتبع حالة الدفع في جدول طلبات الشراء
ALTER TABLE public.purchase_intents 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS moneymotion_session_id TEXT;

-- تحديث السياسات للسماح بتحديث الحالة (للمدراء فقط أو للـ Webhook عبر service_role)
-- ملاحظة: الـ Webhook سيستخدم مفتاح service_role الذي يتخطى سياسات RLS عادةً
COMMENT ON COLUMN public.purchase_intents.status IS 'حالة الطلب: pending, completed, failed, cancelled';
COMMENT ON COLUMN public.purchase_intents.moneymotion_session_id IS 'معرف جلسة الدفع في موني موشن للربط والتحقق';

-- أعمدة إضافية لتوثيق طريقة الدفع والمصدر والمراجعة اليدوية
ALTER TABLE public.purchase_intents
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_source TEXT DEFAULT 'gateway',
  ADD COLUMN IF NOT EXISTS is_local BOOLEAN DEFAULT false;
COMMENT ON COLUMN public.purchase_intents.payment_method IS 'اسم/نوع طريقة الدفع (مثال: Card, USDT TRC20, Local Bank Transfer)';
COMMENT ON COLUMN public.purchase_intents.payment_source IS 'مصدر الدفع: gateway (MoneyMotion) أو local';
COMMENT ON COLUMN public.purchase_intents.is_local IS 'تمييز الطلبات ذات الطرق المحلية للمراجعة اليدوية';

-- إنشاء جدول تخزين جلسات الدفع القادمة من MoneyMotion (للعرض الفوري في لوحة الأدمن)
create table if not exists public.moneymotion_checkouts (
  id uuid primary key,
  created_on timestamp with time zone null,
  email text null,
  status text null,
  total_in_cents integer null,
  ip_address text null,
  store_id uuid null,
  created_by_customer_id uuid null,
  created_on_customer_session_id uuid null,
  intent_id uuid null,
  product_id uuid null,
  raw jsonb null,
  inserted_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_mm_checkouts_created_on on public.moneymotion_checkouts (created_on desc);
create index if not exists idx_mm_checkouts_email on public.moneymotion_checkouts (email);
create index if not exists idx_mm_checkouts_status on public.moneymotion_checkouts (status);
create index if not exists idx_mm_checkouts_intent on public.moneymotion_checkouts (intent_id);
create index if not exists idx_mm_checkouts_product on public.moneymotion_checkouts (product_id);

create or replace function public.mm_checkouts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mm_checkouts_updated_at on public.moneymotion_checkouts;
create trigger trg_mm_checkouts_updated_at
before update on public.moneymotion_checkouts
for each row execute function public.mm_checkouts_set_updated_at();

alter table public.moneymotion_checkouts
  add column if not exists processed_at timestamp with time zone null;

-- تريغر لإصدار المفتاح تلقائياً عند اكتمال الطلب (قابل للتعطيل)
create or replace function public.purchase_intents_auto_claim_key()
returns trigger
language plpgsql
as $$
declare
  v_key text;
begin
  if new.status = 'completed' and new.product_id is not null and new.email is not null then
    select public.claim_available_key(new.product_id, new.email, new.id) into v_key;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_intents_auto_claim_key on public.purchase_intents;
create trigger trg_purchase_intents_auto_claim_key
after update of status on public.purchase_intents
for each row
execute function public.purchase_intents_auto_claim_key();

-- Wrapper function to handle text arguments from PostgREST/Supabase RPC
-- Delegates to the canonical UUID-based function to avoid casting issues
create or replace function public.claim_available_key(p_product_id text, p_email text, p_intent_id text)
returns text
language sql
security definer
as $$
  select public.claim_available_key(p_product_id::uuid, p_email, p_intent_id::uuid);
$$;

grant execute on function public.claim_available_key_cast(text, text, text) to authenticated;
grant execute on function public.claim_available_key_cast(text, text, text) to service_role;

-- Helper RPC to update purchase intent status with text id
create or replace function public.update_purchase_intent_status_text(
  p_intent_id text,
  p_status text,
  p_session_id text,
  p_payment_method text
)
returns integer
language sql
security definer
as $$
  update public.purchase_intents
  set
    status = p_status,
    moneymotion_session_id = p_session_id,
    payment_method = p_payment_method,
    payment_source = 'gateway',
    is_local = false
  where id = p_intent_id::uuid;
  select 1;
$$;

grant execute on function public.update_purchase_intent_status_text(text, text, text, text) to authenticated;
grant execute on function public.update_purchase_intent_status_text(text, text, text, text) to service_role;
