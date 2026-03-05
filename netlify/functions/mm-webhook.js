import crypto from 'crypto';
export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Webhook-Signature, X-Checkout-Signature',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  try {
    let secret = process.env.MONEYMOTION_WEBHOOK_SECRET || '';
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if ((!secret) && supabaseUrl && serviceKey) {
      try {
        const base = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
        const res = await fetch(`${base}/site_settings?select=value&key=eq.moneymotion_webhook_secret&limit=1`, {
          method: 'GET',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        if (res.ok) {
          const arr = await res.json();
          if (Array.isArray(arr) && arr[0]?.value) {
            secret = String(arr[0].value);
          }
        }
      } catch {}
    }
    if (!secret || !supabaseUrl || !serviceKey) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing env vars' }) };
    }
    const signature =
      (event.headers['x-signature']) ||
      (event.headers['X-Signature']) ||
      (event.headers['x-webhook-signature']) ||
      (event.headers['X-Webhook-Signature']) ||
      (event.headers['x-checkout-signature']) ||
      (event.headers['X-Checkout-Signature']) ||
      '';
    if (!signature) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing signature' }) };
    }
    const rawBody = event.body || '';
    const computed = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('base64');
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Invalid signature' }) };
    }
    const payload = JSON.parse(rawBody);
    const checkout = payload.checkoutSession || {};
    const customer = payload.customer || {};
    const eventName = payload.event || 'unknown';
    const paymentInfo = (customer.paymentMethodInfo || {}) || {};
    const insertData = {
      checkout_session_id: checkout.id || '',
      status: checkout.status || 'pending',
      total_in_cents: checkout.totalInCents || 0,
      event: eventName,
      customer_email: customer.email || null,
      payment_type: paymentInfo.type || null,
      card_brand: paymentInfo.cardBrand || null,
      last_four: paymentInfo.lastFourDigits || null,
      store_id: checkout.storeId || null,
      raw_payload: payload,
    };
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase.from('money_motion_orders').insert([insertData]);
    if (error) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) };
  }
};
