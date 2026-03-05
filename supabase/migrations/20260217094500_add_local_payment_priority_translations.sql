ALTER TABLE local_payment_methods
  ADD COLUMN IF NOT EXISTS local_priority integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS popularity_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_tr text;
