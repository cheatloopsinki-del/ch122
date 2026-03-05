import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }
  try {
    const { email, phone } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const e = (email || '').trim();
    const p = (phone || '').replace(/\D/g, '');

    let knownByEmail = false;
    let knownByPhone = false;

    if (e) {
      const { data: keysByEmail } = await supabase
        .from('product_keys')
        .select('id', { count: 'exact', head: true })
        .eq('is_used', true)
        .ilike('used_by_email', e);
      knownByEmail = !!keysByEmail;
      if (!knownByEmail) {
        const { data: intentsByEmail } = await supabase
          .from('purchase_intents')
          .select('id')
          .ilike('email', e);
        const intentIds = (intentsByEmail || []).map((i: any) => i.id);
        if (intentIds.length > 0) {
          const { data: keysForEmailIntents } = await supabase
            .from('product_keys')
            .select('id', { count: 'exact', head: true })
            .in('purchase_intent_id', intentIds)
            .eq('is_used', true);
          knownByEmail = !!keysForEmailIntents;
        }
      }
    }

    if (p) {
      const { data: intentsByPhone } = await supabase
        .from('purchase_intents')
        .select('id')
        .ilike('phone_number', p);
      const phoneIntentIds = (intentsByPhone || []).map((i: any) => i.id);
      if (phoneIntentIds.length > 0) {
        const { data: keysForPhoneIntents } = await supabase
          .from('product_keys')
          .select('id', { count: 'exact', head: true })
          .in('purchase_intent_id', phoneIntentIds)
          .eq('is_used', true);
        knownByPhone = !!keysForPhoneIntents;
      }
    }

    const known = !!(knownByEmail || knownByPhone);
    return new Response(JSON.stringify({ known }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: cors });
  }
});
