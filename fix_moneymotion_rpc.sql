-- Fix for "Could not choose the best candidate function" error
-- This script removes the duplicate function with incorrect parameter types (text)
-- and ensures the correct UUID-based function is the only one remaining.

-- 1. Drop the incorrect function signature (Text parameters)
DROP FUNCTION IF EXISTS public.claim_available_key(text, text, text);

-- 2. Drop the correct one too just to be sure we are recreating it fresh and clean
DROP FUNCTION IF EXISTS public.claim_available_key(uuid, text, uuid);

-- 3. Recreate the correct function with UUID parameters
CREATE OR REPLACE FUNCTION public.claim_available_key(
    p_product_id UUID,
    p_email TEXT,
    p_intent_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with admin privileges to allow updating product_keys table
AS $$
DECLARE
  claimed_key_id bigint;
  claimed_key_value text;
BEGIN
  -- Find an available key for the given product and lock it for update
  -- We use SKIP LOCKED to handle concurrent requests safely
  SELECT id, key_value
  INTO claimed_key_id, claimed_key_value
  FROM public.product_keys
  WHERE product_id = p_product_id AND is_used = false
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If no key was found, return NULL (so the webhook knows, instead of crashing)
  IF claimed_key_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Mark the key as used
  UPDATE public.product_keys
  SET
    is_used = true,
    used_by_email = p_email,
    used_at = now(),
    purchase_intent_id = p_intent_id
  WHERE id = claimed_key_id;

  -- Return the claimed key value
  RETURN claimed_key_value;
END;
$$;
