-- 1. Ensure Purchase Intents table has necessary columns for MoneyMotion
ALTER TABLE purchase_intents ADD COLUMN IF NOT EXISTS moneymotion_session_id text;
ALTER TABLE purchase_intents ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE purchase_intents ADD COLUMN IF NOT EXISTS payment_source text; -- 'gateway' vs 'local'

-- 2. Create a detailed logs table for Webhook operations (Traceability)
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  event_type text,
  intent_id uuid,
  payload jsonb,
  processing_status text, -- 'success', 'failed'
  details text
);

-- Enable RLS for logs (Admin only)
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view webhook logs" ON webhook_logs
  FOR SELECT TO authenticated
  USING (auth.role() = 'service_role' OR auth.email() LIKE '%@cheatloop.shop'); -- Adjust as needed

-- 3. Create specific Views for "Global Payments" sections
-- Section 1: Pending Global Orders
CREATE OR REPLACE VIEW view_global_orders_pending AS
  SELECT 
    id, created_at, product_title, email, country, price, 
    moneymotion_session_id, payment_method 
  FROM purchase_intents 
  WHERE status = 'pending' 
  AND (moneymotion_session_id IS NOT NULL OR payment_source = 'gateway')
  ORDER BY created_at DESC;

-- Section 2: Completed Global Orders
CREATE OR REPLACE VIEW view_global_orders_completed AS
  SELECT 
    pi.id, pi.created_at, pi.product_title, pi.email, pi.country, pi.price, 
    pi.moneymotion_session_id, pi.payment_method,
    pk.key_value as assigned_key
  FROM purchase_intents pi
  LEFT JOIN product_keys pk ON pk.purchase_intent_id = pi.id
  WHERE pi.status = 'completed' 
  AND (pi.moneymotion_session_id IS NOT NULL OR pi.payment_source = 'gateway')
  ORDER BY pi.created_at DESC;

-- 4. Settings for Discord and Brevo (Upsert)
INSERT INTO site_settings (key, value) VALUES
  ('moneymotion_webhook_secret', '32fb9cfdfdfbeb8e4a035e4855b0e0600b9594daddee365b39b8758ec8267570'),
  ('discord_notify_on_complete', 'true')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
