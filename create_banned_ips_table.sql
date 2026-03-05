-- Create banned_ips table
CREATE TABLE IF NOT EXISTS banned_ips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

-- Policies for banned_ips
-- Allow public read access (so we can check if a user is banned)
CREATE POLICY "Allow public read access" ON banned_ips
  FOR SELECT
  USING (true);

-- Allow admins to insert/delete
CREATE POLICY "Allow admin full access" ON banned_ips
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_banned_ips_address ON banned_ips(ip_address);

-- Create hard_banned_ips table (never auto-unban)
CREATE TABLE IF NOT EXISTS hard_banned_ips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE hard_banned_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON hard_banned_ips
  FOR SELECT
  USING (true);

CREATE POLICY "Allow admin full access" ON hard_banned_ips
  FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_hard_banned_ips_address ON hard_banned_ips(ip_address);

-- Optional view: vpn_banned_ips (filter banned_ips by VPN reason)
CREATE OR REPLACE VIEW vpn_banned_ips AS
SELECT id, ip_address, reason, created_at
FROM banned_ips
WHERE reason ILIKE '%vpn%';

-- RPC: ban_ip_if_not_exists
CREATE OR REPLACE FUNCTION ban_ip_if_not_exists(p_ip TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_ip IS NULL OR length(trim(p_ip)) = 0 THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM hard_banned_ips WHERE ip_address = p_ip) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM banned_ips WHERE ip_address = p_ip) THEN
    INSERT INTO banned_ips(ip_address, reason) VALUES (p_ip, coalesce(p_reason, 'VPN/Proxy Detected'));
  END IF;
END;
$$;
