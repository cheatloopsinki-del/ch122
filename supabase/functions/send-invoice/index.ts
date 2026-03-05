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
    const { intentId } = await req.json();
    if (!intentId) {
      return new Response(JSON.stringify({ error: "Missing intentId" }), { status: 400, headers: cors });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: intent, error: intentErr } = await supabase
      .from('purchase_intents')
      .select('id, email, product_id, product_title, country')
      .eq('id', intentId)
      .single();
    if (intentErr || !intent) {
      return new Response(JSON.stringify({ error: "Intent not found" }), { status: 404, headers: cors });
    }
    const email = intent.email;
    const productId = intent.product_id;
    const { data: product } = await supabase
      .from('products')
      .select('title, price')
      .eq('id', productId)
      .single();
    // Find used key for this intent (preferred)
    let finalKey: string | null = null;
    const { data: existingKeyRow } = await supabase
      .from('product_keys')
      .select('key_value')
      .eq('purchase_intent_id', intentId)
      .eq('product_id', productId)
      .eq('is_used', true)
      .limit(1)
      .single();
    if (existingKeyRow?.key_value) {
      finalKey = existingKeyRow.key_value;
    } else {
      // Fallback: claim a new available key
      const { data: key } = await supabase.rpc('claim_available_key', {
        p_product_id: productId,
        p_email: email,
        p_intent_id: intentId
      });
      if (key) {
        finalKey = String(key);
      } else {
        // last attempt: read just persisted key
        const { data: fetchedKeyRow } = await supabase
          .from('product_keys')
          .select('key_value')
          .eq('purchase_intent_id', intentId)
          .eq('product_id', productId)
          .eq('is_used', true)
          .limit(1)
          .single();
        if (fetchedKeyRow?.key_value) {
          finalKey = fetchedKeyRow.key_value;
        }
      }
    }
    if (!finalKey) {
      return new Response(JSON.stringify({ error: "No key available to send" }), { status: 409, headers: cors });
    }
    // Load settings and invoice template
    const { data: allSettings } = await supabase
      .from('site_settings')
      .select('key, value');
    const settingsMap = (allSettings || []).reduce((acc: any, s: any) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    const brevoApiKey = settingsMap.brevo_api_key || Deno.env.get('BREVO_API_KEY') || Deno.env.get('BREVO_KEY');
    if (!brevoApiKey) {
      return new Response(JSON.stringify({ error: "Brevo API key not configured" }), { status: 500, headers: cors });
    }
    const isSinki = (intent?.product_title || product?.title || '').toLowerCase().includes('sinki');
    const brand = isSinki ? 'sinki' : 'cheatloop';
    const { data: template } = await supabase
      .from('invoice_templates')
      .select('*')
      .eq('brand_name', brand)
      .single();
    const logoUrl = template?.logo_url || settingsMap.site_logo_url || '';
    const senderName = template?.company_name || settingsMap.brevo_sender_name || Deno.env.get('BREVO_SENDER_NAME') || 'Cheatloop Team';
    const senderEmail = settingsMap.brevo_sender_email || Deno.env.get('BREVO_SENDER_EMAIL') || 'support@cheatloop.shop';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: email, name: email.split('@')[0] }],
        subject: `Invoice for ${product?.title || 'Your Order'} - Order #${intentId.slice(0, 8)}`,
        htmlContent: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${template?.bg_color || '#f3f4f6'}; color: ${template?.text_color || '#111827'}; padding: 40px 20px; margin: 0; line-height: 1.5; }
  .invoice-container { max-width: 850px; margin: auto; background: ${template?.bg_color && template?.bg_color !== '#f3f4f6' ? 'rgba(255,255,255,0.03)' : '#ffffff'}; padding: 40px; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.1); border: 1px solid ${template?.text_color ? template?.text_color + '15' : '#e5e7eb'}; }
  .invoice-header { display: block; width: 100%; margin-bottom: 50px; border-bottom: 2px solid ${template?.text_color ? template?.text_color + '10' : '#f3f4f6'}; padding-bottom: 20px; overflow: hidden; }
  .logo { float: left; } .logo img { max-height: 70px; }
  .invoice-details { float: right; text-align: right; color: ${template?.text_color ? template?.text_color + '70' : '#6b7280'}; font-size: 14px; }
  .clearfix::after { content: ""; clear: both; display: table; }
  .invoice-title { font-size: 32px; font-weight: 800; color: ${template?.text_color || '#111827'}; letter-spacing: -0.02em; margin-bottom: 5px; }
  .section { margin-bottom: 30px; } .section h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${template?.text_color ? template?.text_color + '60' : '#6b7280'}; margin-bottom: 12px; }
  .section p { margin: 6px 0; color: ${template?.text_color || '#111827'}; font-size: 15px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 13px; font-weight: 700; text-transform: uppercase; color: ${template?.text_color ? template?.text_color + '60' : '#6b7280'}; border-bottom: 2px solid ${template?.text_color ? template?.text_color + '20' : '#e5e7eb'}; padding-bottom: 15px; }
  td { padding: 18px 0; border-bottom: 1px solid ${template?.text_color ? template?.text_color + '10' : '#f3f4f6'}; font-size: 15px; color: ${template?.text_color || '#111827'}; }
  .text-right { text-align: right; }
  .total-row td { font-weight: 800; font-size: 20px; border-top: 2px solid ${template?.text_color || '#111827'}; padding-top: 25px; color: ${template?.text_color || '#111827'}; }
  .license-box { background: ${template?.bg_color && template?.bg_color !== '#f3f4f6' ? 'rgba(255,255,255,0.05)' : '#f8fafc'}; border: 2px dashed ${template?.text_color ? template?.text_color + '30' : '#e5e7eb'}; padding: 25px; border-radius: 12px; text-align: center; margin-top: 30px; }
  .license-key { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; color: ${template?.text_color || '#111827'}; }
  .footer { margin-top: 40px; font-size: 14px; color: ${template?.text_color ? template?.text_color + '70' : '#6b7280'}; text-align: center; }
</style>
</head>
<body>
<div class="invoice-container">
  <div class="invoice-header clearfix">
    <div class="logo"><img src="${logoUrl}" alt="Company Logo"></div>
    <div class="invoice-details">
      <div class="invoice-title">INVOICE</div>
      <p style="margin: 4px 0;">Invoice ID: #${intentId.slice(0, 8).toUpperCase()}</p>
      <p style="margin: 4px 0;">Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      <a href="${settingsMap.shop_url || 'https://cheatloop.shop'}" target="_blank" style="color: ${template?.text_color || '#111827'}; opacity: 0.6; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 4px; display: block;">${(settingsMap.shop_url || 'cheatloop.shop').replace('https://', '')}</a>
    </div>
  </div>
  <div class="section"><h3>Billed To</h3><p>${email.split('@')[0]}</p><p>${email}</p><p>${intent?.country || 'N/A'}</p></div>
  <table><thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
    <tbody><tr><td>${product?.title || 'Product'}</td><td class="text-right">1</td><td class="text-right">$${(product?.price || 0).toFixed(2)}</td><td class="text-right">$${(product?.price || 0).toFixed(2)}</td></tr>
    <tr class="total-row"><td colspan="3" class="text-right">Total</td><td class="text-right">$${(product?.price || 0).toFixed(2)}</td></tr></tbody>
  </table>
  <div class="section"><h3>LICENSE KEY</h3><div class="license-box"><div class="license-key">${finalKey}</div></div></div>
  <div class="footer">
    <div style="margin-bottom: 20px;">${template?.footer_notes || 'Thank you for your business.'}</div>
    <div style="margin-top: 25px; text-align: center;">
      <a href="${settingsMap.shop_url || 'https://cheatloop.shop'}" target="_blank" style="display: inline-block; background-color: #06b6d4; color: #ffffff; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.3); margin-right: 10px;">${settingsMap.invoice_shop_button_text || 'Shop'}</a>
      <a href="${settingsMap.discord_url || 'https://discord.gg/sY5EcUVjeA'}" target="_blank" style="display: inline-block; background-color: #5865F2; color: #ffffff; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3);">${settingsMap.invoice_discord_button_text || 'Join Our Discord'}</a>
    </div>
  </div>
</div>
</body>
</html>
        `
      })
    });
    if (!response.ok) {
      const errorData = await response.text();
      return new Response(JSON.stringify({ error: "Brevo send failed", detail: errorData }), { status: 502, headers: cors });
    }
    const discordWebhookUrl = settingsMap.discord_webhook_url || Deno.env.get('DISCORD_WEBHOOK_URL');
    if (discordWebhookUrl) {
      try {
        await fetch(discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: '🧪 Test: Invoice Sent',
              color: 0x06b6d4,
              fields: [
                { name: 'Product', value: product?.title || 'Unknown', inline: true },
                { name: 'Price', value: `$${product?.price || 0}`, inline: true },
                { name: 'Customer', value: email, inline: true },
                { name: 'Order', value: `#${intentId.slice(0, 8).toUpperCase()}`, inline: true },
                { name: 'Key', value: `\`${finalKey}\``, inline: false }
              ],
              timestamp: new Date().toISOString(),
              footer: { text: 'Cheatloop Sales Bot' }
            }]
          })
        });
      } catch (_e) {}
    }
    return new Response(JSON.stringify({ sent: true, discord_notified: !!discordWebhookUrl }), { status: 200, headers: cors });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
})
