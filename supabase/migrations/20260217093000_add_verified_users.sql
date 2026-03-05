CREATE TABLE IF NOT EXISTS verified_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  product_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(username, product_type)
);

ALTER TABLE verified_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read verified_users"
  ON verified_users
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated can manage verified_users"
  ON verified_users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
