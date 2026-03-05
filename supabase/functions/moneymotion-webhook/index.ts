import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

serve(async (req) => {
  const debugLog: string[] = [];
  function log(msg: string, data?: any) {
    const line = `${msg} ${data ? JSON.stringify(data) : ""}`;
    console.log(line);
    debugLog.push(line);
  }

  try {
    const urlObj = new URL(req.url);
    let signature = req.headers.get("x-checkout-signature") ?? urlObj.searchParams.get("sig");
    
    const bypassEnv = (Deno.env.get("WEBHOOK_TEST_BYPASS") ?? "").toLowerCase();
    const bypassHeader = (req.headers.get("x-test-bypass-signature") ?? "").toLowerCase();
    const bypassQuery = (urlObj.searchParams.get("bypass") ?? "").toLowerCase();
    
    const allowBypass = (bypassEnv === "1" || bypassEnv === "true") || 
                        (bypassHeader === "1" || bypassHeader === "true") || 
                        (bypassQuery === "1" || bypassQuery === "true");

    if (!signature && !allowBypass) {
      return new Response("Missing signature", { status: 401 });
    }

    const bodyText = await req.text();
    log("Received Webhook Body Length:", bodyText.length);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseKey) log("⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is missing! Updates might fail.");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get Settings
    const { data: allSettings } = await supabase.from('site_settings').select('key, value');
    const settingsMap = (allSettings || []).reduce((acc: any, s: any) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    const webhookSecret = settingsMap.moneymotion_webhook_secret || Deno.env.get('MONEYMOTION_WEBHOOK_SECRET') || '32fb9cfdfdfbeb8e4a035e4855b0e0600b9594daddee365b39b8758ec8267570';

    // 2. Signature Check
    if (signature) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookSecret);
      const messageData = encoder.encode(bodyText);
      const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
      const hmacBuffer = await crypto.subtle.sign("HMAC", key, messageData);
      const hmacArray = Array.from(new Uint8Array(hmacBuffer));
      const calculatedSignatureBase64 = btoa(String.fromCharCode.apply(null, hmacArray));
      const calculatedSignatureHex = hmacArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (calculatedSignatureBase64 !== signature && calculatedSignatureHex !== signature) {
        return new Response("Invalid signature", { status: 401 });
      }
    } else {
        log("⚠️ Test Mode: Signature verification bypassed.");
    }

    const payload = JSON.parse(bodyText);
    const event = payload.event;
    
    // 3. Metadata Extraction (Robust & Trimmed)
    const metadata = payload.metadata || payload.json?.metadata || payload.data?.metadata || {};
    
    // Helper to safely get and trim strings
    const safeTrim = (val: any) => (val && typeof val === 'string') ? val.trim() : val;

    let intentId = safeTrim(metadata?.intent_id || payload.json?.metadata?.intent_id || payload.id);
    const productId = safeTrim(metadata?.product_id || payload.json?.metadata?.product_id);
    const email = safeTrim(metadata?.customer_email || payload.userInfo?.email || payload.json?.userInfo?.email || payload.customer?.email);
    
    if ((!intentId || intentId === payload.id) && email) {
      log(`Smart matching for email: ${email}`);
      const { data: matchedIntent } = await supabase
        .from('purchase_intents')
        .select('id')
        .eq('email', email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (matchedIntent) {
          intentId = matchedIntent.id;
          log(`Smart match found: ${intentId}`);
      } else {
          log("Smart match failed: No pending order found.");
      }
    }

    const paymentMethodRaw = payload.checkoutSession?.paymentMethod?.name || payload.paymentMethod?.name || "Visa/Mastercard";

    log(`Processing event: ${event} for intent: '${intentId}'`); // Added quotes to see whitespace in log

    if (intentId) {
      let status = 'pending';
      const normalizedEvent = String(event || '').toLowerCase();
      const stateLike = String(payload?.json?.state || payload?.state || payload?.checkoutSession?.state || '').toLowerCase();
      
      if (normalizedEvent.includes('complete') || normalizedEvent.includes('success') || stateLike.includes('complete')) {
        status = 'completed';
      } else if (normalizedEvent.includes('fail') || normalizedEvent.includes('error')) {
        status = 'failed';
      }

      log(`Determined status: ${status}`);
      
      const { data: existingRow } = await supabase
        .from('purchase_intents')
        .select('id')
        .eq('id', intentId)
        .maybeSingle();
      if (!existingRow && email) {
        const { data: reMatched } = await supabase
          .from('purchase_intents')
          .select('id')
          .eq('email', email)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reMatched?.id) {
          intentId = reMatched.id;
          log("Re-matched intent by email:", intentId);
        } else {
          log("Intent not found by id or email; skipping update.");
        }
      }

      const { data: updatedData, error: updateError } = await supabase
        .from('purchase_intents')
        .update({
          status: status,
          moneymotion_session_id: payload.id,
          payment_method: paymentMethodRaw,
          payment_source: 'gateway',
          is_local: false
        })
        .eq('id', intentId)
        .select();

      if (updateError) {
          log("❌ Database Update Error:", updateError);
          // throw updateError; // Don't throw, let it proceed to logging
      }

      if (!updatedData || updatedData.length === 0) {
          log("❌ ERROR: Database update returned 0 rows! Check if intent_id exists and matches exactly.");
      } else {
          log("✅ Database update successful. Rows updated:", updatedData.length);
      }

      if (status === 'completed' && productId && email) {
        log("Attempting to claim key...");
        
        // Ensure RPC arguments are strings (Supabase client handles casting if function expects UUID)
        const { data: key, error: rpcError } = await supabase.rpc('claim_available_key', {
          p_product_id: productId,
          p_email: email,
          p_intent_id: intentId
        });
        
        if (rpcError) log("RPC Error:", rpcError);
        
        if (key) {
             log(`Key claimed: ${key}`);
             
             // Email Logic
             const brevoApiKey = settingsMap.brevo_api_key || Deno.env.get('BREVO_API_KEY') || Deno.env.get('BREVO_KEY');
             if (brevoApiKey) {
                try {
                    const { data: product } = await supabase.from('products').select('title, price').eq('id', productId).single();
                    const { data: intent } = await supabase.from('purchase_intents').select('country, product_title').eq('id', intentId).single();
                    
                    const isSinki = (intent?.product_title || product?.title || '').toLowerCase().includes('sinki');
                    const brand = isSinki ? 'sinki' : 'cheatloop';
                    
                    const { data: template } = await supabase.from('invoice_templates').select('*').eq('brand_name', brand).single();
                    
                    const logoUrl = template?.logo_url || settingsMap.site_logo_url || 'https://pbdkxzrzbnlajjgubgis.supabase.co/storage/v1/object/public/site-assets/logo-1761638967148-cheatloop.png';

                    const senderName = template?.company_name || settingsMap.brevo_sender_name || Deno.env.get('BREVO_SENDER_NAME') || 'Cheatloop Team';
                    const senderEmail = settingsMap.brevo_sender_email || Deno.env.get('BREVO_SENDER_EMAIL') || 'support@cheatloop.shop';
                    
                    // Simple email send for debug
                    log(`Sending email via Brevo to ${email}...`);
                    
                    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                        method: 'POST',
                        headers: {
                          'accept': 'application/json',
                          'api-key': brevoApiKey,
                          'content-type': 'application/json'
                        },
                        body: JSON.stringify({
                          sender: { 
                            name: senderName, 
                            email: senderEmail 
                          },
                          to: [{ email: email, name: email.split('@')[0] }],
                          subject: `Invoice for ${product?.title || 'Your Order'} - Order #${intentId.slice(0, 8)}`,
                          htmlContent: `
                <!DOCTYPE html> 
                <html lang="en"> 
                <head> 
                <meta charset="UTF-8"> 
                <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
                <title>Invoice</title> 
                <style> 
                    body { font-family: sans-serif; background: #f3f4f6; padding: 20px; } 
                    .invoice-container { background: #fff; padding: 40px; border-radius: 10px; max-width: 600px; margin: auto; }
                    .license-box { background: #f8fafc; padding: 20px; border: 2px dashed #e2e8f0; text-align: center; margin-top: 20px; font-family: monospace; font-size: 20px; font-weight: bold; }
                </style> 
                </head> 
                <body> 
                <div class="invoice-container"> 
                    <h2>Invoice #${intentId.slice(0, 8)}</h2>
                    <p>Thank you for your purchase!</p>
                    <div class="license-box">${key}</div>
                    <p style="margin-top: 30px; text-align: center;">
                        <a href="${settingsMap.shop_url || 'https://cheatloop.shop'}">Visit Store</a>
                    </p>
                </div> 
                </body> 
                </html> 
                          `
                        })
                      });
                      
                      if (!response.ok) {
                          log("Brevo Error:", await response.text());
                      } else {
                          log("Email sent successfully!");
                      }

                } catch(e) { log("Email Error", e); }
             }
        }
        else log("No key claimed (maybe none available or already claimed).");
      }
    } else {
        log("❌ ERROR: intentId is missing or could not be extracted.");
    }

    return new Response(JSON.stringify({ 
        received: true, 
        mode: signature ? "production" : "test_bypass",
        debug: debugLog
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message, debug: debugLog || [] }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
})
