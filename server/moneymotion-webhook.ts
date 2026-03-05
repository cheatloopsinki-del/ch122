import express from 'express';
import crypto from 'crypto';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
let WEBHOOK_SECRET = process.env.MONEYMOTION_WEBHOOK_SECRET as string;
const PORT = Number(process.env.PORT || 8080);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();
app.use(bodyParser.raw({ type: '*/*' }));

async function getWebhookSecret(): Promise<string> {
  if (WEBHOOK_SECRET) return WEBHOOK_SECRET;
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'moneymotion_webhook_secret')
      .limit(1)
      .single();
    if (!error && data?.value) {
      WEBHOOK_SECRET = data.value;
      return WEBHOOK_SECRET;
    }
  } catch {}
  return '';
}

function hmacSha512Sign(secret: string, data: string): string {
  return crypto.createHmac('sha512', secret).update(data).digest('base64');
}

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const computed = hmacSha512Sign(secret, rawBody.toString('utf8'));
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/moneymotion/webhook', async (req, res) => {
  try {
    const signature =
      (req.headers['x-signature'] as string) ||
      (req.headers['x-webhook-signature'] as string) ||
      '';

    const secret = await getWebhookSecret();
    if (!signature || !secret) {
      return res.status(400).json({ error: 'Missing signature or secret' });
    }

    const isValid = verifyWebhookSignature(req.body as Buffer, signature, secret);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const payload = JSON.parse(req.body.toString('utf8'));
    const checkout = payload.checkoutSession || {};
    const customer = payload.customer || {};
    const event = payload.event || 'unknown';
    const paymentInfo = (customer.paymentMethodInfo as any) || {};

    const insertData = {
      checkout_session_id: checkout.id || '',
      status: checkout.status || 'pending',
      total_in_cents: checkout.totalInCents || 0,
      event,
      customer_email: customer.email || null,
      payment_type: paymentInfo.type || null,
      card_brand: paymentInfo.cardBrand || null,
      last_four: paymentInfo.lastFourDigits || null,
      store_id: checkout.storeId || null,
      raw_payload: payload,
    };

    const { error } = await supabase
      .from('money_motion_orders')
      .insert([insertData]);

    if (error) {
      return res.status(500).json({ error: 'DB insert failed' });
    }

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`MoneyMotion webhook server listening on port ${PORT}`);
});
