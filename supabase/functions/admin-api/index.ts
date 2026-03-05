import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = (globalThis as any).Deno?.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = (globalThis as any).Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

type Category = { id: string; name: string; slug: string; position?: number; created_at?: string };
type ProductLink = { id?: string; label: string; url: string };
type Product = {
  id: string;
  title: string;
  price: number;
  features: string[];
  description: string;
  buy_link: string;
  alternative_links?: ProductLink[];
  image?: string;
  video_link?: string | null;
  video_url?: string | null;
  video_library_id?: string | null;
  is_popular?: boolean;
  is_hidden?: boolean;
  masked_name?: string;
  masked_domain?: string;
  category: string;
  category_id: string;
  purchase_image_id?: string | null;
  payment_gateway_tax?: number;
  purchase_method?: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};
type SiteSetting = { key: string; value: string };
type WinningPhoto = { id: string; image_url: string; product_name: string; description?: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: corsHeaders });
    const body = await req.json();
    const action: string = String(body?.action || "");
    const payload = body?.payload;

    switch (action) {
      case "settings:get": {
        const { data, error } = await supabase.from("site_settings").select("*");
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "security:checkAccess": {
        const ua = req.headers.get("user-agent") || "";
        const forwarded =
          req.headers.get("x-forwarded-for") ||
          req.headers.get("x-real-ip") ||
          req.headers.get("cf-connecting-ip") ||
          req.headers.get("x-client-ip") ||
          req.headers.get("fly-client-ip") ||
          "";
        const ip = forwarded.split(",")[0]?.trim() || "";
        const ipData = payload?.ipData || {};
        const attemptedUrl: string | undefined = payload?.attempted_url;
        const countryName: string = String(ipData?.country_name || "");
        const cityName: string = String(ipData?.city || "");
        const isVpn: boolean = !!ipData?.is_vpn;
        const riskScore: number = Number(ipData?.risk_score || 0);
        const vpnReason: string = String(ipData?.vpn_reason || "");
        const factors: string[] = Array.isArray(ipData?.risk_factors) ? ipData.risk_factors : [];
        const securityDisabledEnv = (((globalThis as any).Deno?.env.get("SECURITY_DISABLED") ?? "").toLowerCase() === "true");
        if (securityDisabledEnv) {
          return json({ allowed: true, ip, country: countryName });
        }
        const { data: settingsRows } = await supabase
          .from("site_settings")
          .select("key,value")
          .in("key", [
            "block_vpn",
            "block_timezone_mismatch",
            "block_advanced_protection",
            "block_advanced_threshold",
            "block_strict_vpn",
            "vpn_ban_message",
            "geo_ban_message",
            "ip_ban_message",
            "advanced_ban_message",
            "security_enabled",
          ]);
        const getSetting = (k: string, def = "") =>
          (settingsRows || []).find((s: any) => s.key === k)?.value ?? def;
        const securityEnabled = getSetting("security_enabled", "true") !== "false";
        if (!securityEnabled) {
          if (ip) {
            await supabase.from("visitor_logs").insert({
              ip_address: ip,
              country: countryName || null,
              city: cityName || null,
              user_agent: ua,
              page_url: attemptedUrl || null,
            });
          }
          return json({ allowed: true, ip, country: countryName });
        }
        const blockVpn = getSetting("block_vpn") === "true";
        const blockAdvanced = getSetting("block_advanced_protection") === "true";
        const advancedThreshold = Number(getSetting("block_advanced_threshold", "50"));
        const blockStrictVpn = getSetting("block_strict_vpn") === "true";
        const vpnMessage = getSetting("vpn_ban_message") || undefined;
        const geoMessage = getSetting("geo_ban_message") || undefined;
        const ipMessage = getSetting("ip_ban_message") || undefined;
        const advancedMessage = getSetting("advanced_ban_message") || undefined;

        // Hard IP ban check first (server-side, authoritative)
        if (ip) {
          const { data: hard } = await supabase
            .from("hard_banned_ips")
            .select("ip_address")
            .eq("ip_address", ip)
            .maybeSingle();
          if (hard) {
            await supabase.from("blocked_logs").insert({
              ip_address: ip,
              country: countryName || null,
              city: cityName || null,
              reason: "Hard IP Ban",
              user_agent: ua,
              attempted_url: attemptedUrl || null,
            });
            return json({ allowed: false, reason: "hard_ip_ban", message: ipMessage, ip, country: countryName });
          }
        }

        // Normal IP ban
        if (ip) {
          const { data: banned } = await supabase.from("banned_ips").select("ip_address").eq("ip_address", ip).maybeSingle();
          if (banned) {
            await supabase.from("blocked_logs").insert({
              ip_address: ip,
              country: countryName || null,
              city: cityName || null,
              reason: "IP Ban",
              user_agent: ua,
              attempted_url: attemptedUrl || null,
            });
            return json({ allowed: false, reason: "ip_ban", message: ipMessage, ip, country: countryName });
          }
        }

        // Country ban (based on client-provided geo)
        if (countryName) {
          const { data: countryRow } = await supabase
            .from("banned_countries")
            .select("country_name")
            .eq("country_name", countryName)
            .maybeSingle();
          if (countryRow) {
            await supabase.from("blocked_logs").insert({
              ip_address: ip || "",
              country: countryName,
              city: cityName || null,
              reason: "Country Ban",
              user_agent: ua,
              attempted_url: attemptedUrl || null,
            });
            return json({ allowed: false, reason: "country_ban", message: geoMessage, ip, country: countryName });
          }
        }

        // Advanced/VPN blocking based on client signal + settings
        let shouldBlockVpn = false;
        let reason = "";
        if (blockAdvanced && riskScore >= advancedThreshold) {
          shouldBlockVpn = true;
          reason = `Advanced Protection: Score ${riskScore}/100 [${factors.join(", ")}]`;
        } else if (blockVpn && isVpn) {
          reason = `VPN/Proxy Detected (${vpnReason || "Unknown"})`;
          shouldBlockVpn = true;
        }

        if (shouldBlockVpn) {
          // Persist ban lists when strict mode is enabled
          if (ip) {
            const { data: exists } = await supabase
              .from("banned_ips")
              .select("ip_address")
              .eq("ip_address", ip)
              .maybeSingle();
            if (!exists) {
              await supabase.from("banned_ips").insert({ ip_address: ip, reason: "VPN/Proxy Detected" });
            }
            if (blockStrictVpn) {
              const { data: existsHard } = await supabase
                .from("hard_banned_ips")
                .select("ip_address")
                .eq("ip_address", ip)
                .maybeSingle();
              if (!existsHard) {
                await supabase.from("hard_banned_ips").insert({ ip_address: ip, reason: "VPN/Proxy Detected" });
              }
            }
          }

          await supabase.from("blocked_logs").insert({
            ip_address: ip || "",
            country: countryName || null,
            city: cityName || null,
            reason,
            user_agent: ua,
            attempted_url: attemptedUrl || null,
          });

          const msg = blockAdvanced ? advancedMessage || vpnMessage : vpnMessage;
          return json({ allowed: false, reason: "vpn", message: msg, ip, country: countryName });
        }

        // Log visit when allowed
        if (ip) {
          await supabase.from("visitor_logs").insert({
            ip_address: ip,
            country: countryName || null,
            city: cityName || null,
            user_agent: ua,
            page_url: attemptedUrl || null,
          });
        }
        return json({ allowed: true, ip, country: countryName });
      }
      case "settings:update": {
        const list: SiteSetting[] = Array.isArray(payload) ? payload : [];
        const { error } = await supabase.from("site_settings").upsert(list);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "categories:list": {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "categories:add": {
        const name: string = String(payload?.name || "");
        const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const { data: posRows } = await supabase
          .from("categories")
          .select("position")
          .order("position", { ascending: false })
          .limit(1);
        const nextPos =
          posRows && posRows[0] && typeof posRows[0].position === "number" ? posRows[0].position + 1 : 0;
        const { data, error } = await supabase
          .from("categories")
          .insert([{ name, slug, position: nextPos }])
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "categories:updatePositions": {
        const list: Category[] = Array.isArray(payload) ? payload : [];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          await supabase.from("categories").update({ position: i }).eq("id", c.id);
        }
        return json({ ok: true });
      }
      case "categories:delete": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "products:get": {
        const id: string = String(payload?.id || "");
        const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "products:list": {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "products:listVisible": {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("is_hidden", false)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "products:add": {
        const p: Partial<Product> = payload || {};
        const { data: posRows } = await supabase
          .from("products")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1);
        const nextPos =
          posRows && posRows[0] && typeof posRows[0].sort_order === "number" ? posRows[0].sort_order + 1 : 0;
        const productData: Partial<Product> = {
          title: String(p.title || ""),
          price: Number(p.price || 0),
          features: Array.isArray(p.features) ? p.features : [],
          description: String(p.description || ""),
          buy_link: String(p.buy_link || ""),
          alternative_links: Array.isArray(p.alternative_links) ? p.alternative_links : [],
          image: String(p.image || ""),
          is_popular: !!p.is_popular,
          is_hidden: !!p.is_hidden,
          category: String(p.category || "pubg"),
          category_id: String(p.category_id || ""),
          video_link: p.video_link ?? null,
          purchase_image_id: p.purchase_image_id ?? null,
          payment_gateway_tax: Number(p.payment_gateway_tax || 0),
          masked_name: String(p.masked_name || ""),
          masked_domain: String(p.masked_domain || ""),
          sort_order: nextPos
        };
        const { data, error } = await supabase.from("products").insert([productData]).select().single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "products:update": {
        const id: string = String(payload?.id || "");
        const patch: Partial<Product> = payload?.patch || {};
        const { data, error } = await supabase
          .from("products")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "products:updatePositions": {
        const list: Product[] = Array.isArray(payload) ? payload : [];
        for (let i = 0; i < list.length; i++) {
          const prod = list[i];
          await supabase.from("products").update({ sort_order: i }).eq("id", prod.id);
        }
        return json({ ok: true });
      }
      case "products:delete": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "invoice_templates:list": {
        const { data, error } = await supabase.from("invoice_templates").select("*");
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "invoice_templates:update": {
        const id: string = String(payload?.id || "");
        const updates: Partial<{ brand_name: string; logo_url: string | null; company_name: string | null; support_contact: string | null; footer_notes: string | null }> =
          payload?.updates || {};
        const { data, error } = await supabase
          .from("invoice_templates")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }

      case "verified_users:list": {
        const { data, error } = await supabase
          .from("verified_users")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "verified_users:add": {
        const username: string = String(payload?.username || "");
        const product_type: string = String(payload?.product_type || "");
        const { data, error } = await supabase
          .from("verified_users")
          .insert([{ username, product_type }])
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "verified_users:addMany": {
        const usernames: string[] = Array.isArray(payload?.usernames) ? payload.usernames : [];
        const product_type: string = String(payload?.product_type || "");
        const cleaned = Array.from(new Set(usernames.map((u) => u.trim()).filter((u) => u.length > 0)));
        if (cleaned.length === 0) return json({ inserted: 0 });
        const rows = cleaned.map((username) => ({ username, product_type }));
        const { error } = await supabase
          .from("verified_users")
          .upsert(rows, { onConflict: "username,product_type", ignoreDuplicates: true });
        if (error) return json({ error: error.message }, 500);
        return json({ inserted: cleaned.length });
      }
      case "verified_users:delete": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase.from("verified_users").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "local_payment_methods:list": {
        const { data, error } = await supabase
          .from("local_payment_methods")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "local_payment_methods:get": {
        const id: string = String(payload?.id || "");
        const { data, error } = await supabase.from("local_payment_methods").select("*").eq("id", id).single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "local_payment_methods:add": {
        const method = payload || {};
        const { data, error } = await supabase.from("local_payment_methods").insert([method]).select().single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "local_payment_methods:update": {
        const id: string = String(payload?.id || "");
        const updates = payload?.updates || {};
        const { data, error } = await supabase
          .from("local_payment_methods")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "local_payment_methods:delete": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase.from("local_payment_methods").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "winning_photos:list": {
        const product_name: string | undefined = payload?.product_name;
        let query = supabase.from("winning_photos").select("*").order("created_at", { ascending: false });
        if (product_name) query = query.eq("product_name", product_name);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "winning_photos:add": {
        const photos: WinningPhoto[] = Array.isArray(payload?.photos) ? payload.photos : [];
        if (photos.length === 0) return json([]);
        const toInsert = photos.map((p) => ({
          image_url: String(p.image_url || ""),
          product_name: String(p.product_name || ""),
          description: p.description ? String(p.description) : null,
        }));
        const { data, error } = await supabase.from("winning_photos").insert(toInsert).select();
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "winning_photos:delete": {
        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        if (ids.length === 0) return json({ ok: true });
        const { error } = await supabase.from("winning_photos").delete().in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "winning_photos:move": {
        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        const product_name: string = String(payload?.product_name || "");
        if (ids.length === 0 || !product_name) return json({ ok: true });
        const { error } = await supabase
          .from("winning_photos")
          .update({ product_name })
          .in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "purchase_images:list": {
        const { data, error } = await supabase
          .from("purchase_images")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "purchase_images:get": {
        const id: string = String(payload?.id || "");
        const { data, error } = await supabase.from("purchase_images").select("*").eq("id", id).single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "purchase_images:add": {
        const name: string = String(payload?.name || "");
        const image_url: string = String(payload?.image_url || "");
        const { data, error } = await supabase.from("purchase_images").insert([{ name, image_url }]).select().single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "purchase_images:delete": {
        const id: string = String(payload?.id || "");
        const image_url: string = String(payload?.image_url || "");
        try {
          const url = new URL(image_url);
          const path = url.pathname.split("/purchase-images/")[1];
          if (path) {
            await supabase.storage.from("purchase-images").remove([path]);
          }
        } catch {}
        const { error } = await supabase.from("purchase_images").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "video_library:list": {
        const { data, error } = await supabase.from("video_library").select("*").order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "video_library:add": {
        const title: string = String(payload?.title || "");
        const video_url: string = String(payload?.video_url || "");
        const thumbnail_url: string | null = payload?.thumbnail_url ?? null;
        const { data, error } = await supabase
          .from("video_library")
          .insert([{ title, video_url, thumbnail_url }])
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "video_library:delete": {
        const id: string = String(payload?.id || "");
        const video_url: string = String(payload?.video_url || "");
        try {
          const url = new URL(video_url);
          const pathParts = url.pathname.split("/product-videos/");
          if (pathParts.length > 1) {
            const filePath = pathParts[1];
            await supabase.storage.from("product-videos").remove([decodeURIComponent(filePath)]);
          }
        } catch {}
        const { error } = await supabase.from("video_library").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "video_library:assignToProducts": {
        const video: any = payload?.video;
        const productIds: string[] = Array.isArray(payload?.productIds) ? payload.productIds : [];
        const { data: currentProducts } = await supabase
          .from("products")
          .select("id")
          .or(`video_library_id.eq.${video?.id},video_url.eq.${video?.video_url}`);
        const currentProductIds = (currentProducts || []).map((p: any) => p.id);
        const productsToRemove = currentProductIds.filter((id: string) => !productIds.includes(id));
        if (productsToRemove.length > 0) {
          await supabase.from("products").update({ video_url: null, video_library_id: null }).in("id", productsToRemove);
        }
        if (productIds.length > 0) {
          const { error } = await supabase
            .from("products")
            .update({ video_url: video.video_url, video_library_id: video.id })
            .in("id", productIds);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ ok: true });
      }

      case "purchase_intents:add": {
        const intent = payload?.intent || payload;
        const { data, error } = await supabase.from("purchase_intents").insert([intent]).select().single();
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "purchase_intents:list": {
        const { data, error } = await supabase
          .from("purchase_intents")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "purchase_intents:deleteMany": {
        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        if (ids.length === 0) return json({ ok: true });
        const { error } = await supabase.from("purchase_intents").delete().in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "product_keys:add": {
        const product_id: string = String(payload?.product_id || "");
        const keys: string[] = Array.isArray(payload?.keys) ? payload.keys : [];
        const { data, error } = await supabase.rpc("admin_add_keys_and_debit", { p_product_id: product_id, p_keys: keys });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? 0);
      }
      case "product_keys:list": {
        const productId: string | undefined = payload?.productId;
        const isUsed: boolean | undefined = payload?.isUsed;
        let query = supabase.from("product_keys").select("*").order("created_at", { ascending: false });
        if (productId) query = query.eq("product_id", productId);
        if (typeof isUsed === "boolean") query = query.eq("is_used", isUsed);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "product_keys:claim": {
        const product_id: string = String(payload?.product_id || "");
        const email: string = String(payload?.email || "");
        const intent_id: string = String(payload?.intent_id || "");
        const { data, error } = await supabase.rpc("claim_available_key", {
          p_product_id: product_id,
          p_email: email,
          p_intent_id: intent_id,
        });
        if (error) return json({ error: error.message }, 500);
        return json(data);
      }
      case "product_keys:useManual": {
        const product_id: string = String(payload?.product_id || "");
        const key_value: string = String(payload?.key_value || "");
        const email: string = String(payload?.email || "");
        const intent_id: string = String(payload?.intent_id || "");
        const { data: keyData, error: findError } = await supabase
          .from("product_keys")
          .select("*")
          .eq("key_value", key_value)
          .single();
        if (findError && findError.code !== "PGRST116") return json({ error: findError.message }, 500);
        if (keyData) {
          if (keyData.is_used) return json({ error: "هذا المفتاح مستخدم بالفعل." }, 400);
          const { data: updatedKey, error: updateError } = await supabase
            .from("product_keys")
            .update({
              is_used: true,
              used_by_email: email,
              used_at: new Date().toISOString(),
              purchase_intent_id: intent_id,
            })
            .eq("id", keyData.id)
            .select()
            .single();
          if (updateError) return json({ error: updateError.message }, 500);
          return json(updatedKey);
        } else {
          const { data: insertedKey, error: insertError } = await supabase
            .from("product_keys")
            .insert([
              {
                product_id,
                key_value,
                is_used: true,
                used_by_email: email,
                used_at: new Date().toISOString(),
                purchase_intent_id: intent_id,
              },
            ])
            .select()
            .single();
          if (insertError) return json({ error: insertError.message }, 500);
          return json(insertedKey);
        }
      }
      case "product_keys:deleteOne": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase.from("product_keys").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "product_keys:returnOne": {
        const id: string = String(payload?.id || "");
        const { error } = await supabase
          .from("product_keys")
          .update({
            is_used: false,
            used_by_email: null,
            used_at: null,
            purchase_intent_id: null,
          })
          .eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "product_keys:deleteMany": {
        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        if (ids.length === 0) return json({ ok: true });
        const { error } = await supabase.from("product_keys").delete().in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "product_keys:returnMany": {
        const ids: string[] = Array.isArray(payload?.ids) ? payload.ids : [];
        if (ids.length === 0) return json({ ok: true });
        const { error } = await supabase
          .from("product_keys")
          .update({
            is_used: false,
            used_by_email: null,
            used_at: null,
            purchase_intent_id: null,
          })
          .in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case "product_keys:listByBatch": {
        const batchId: string = String(payload?.batchId || "");
        const limit: number = Number(payload?.limit || 200);
        const { data, error } = await supabase
          .from("product_keys")
          .select("*")
          .eq("key_batch_id", batchId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "brand_balances:list": {
        const { data, error } = await supabase.from("brand_balances").select("*").order("brand", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "balance_transactions:list": {
        const limit: number = Number(payload?.limit || 100);
        const brand: string | undefined = payload?.brand;
        let query = supabase.from("balance_transactions").select("*").order("created_at", { ascending: false }).limit(limit);
        if (brand) query = query.eq("brand", brand);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "product_key_costs:list": {
        const brand: string | undefined = payload?.brand;
        let query = supabase.from("product_key_costs").select("*").order("product_label", { ascending: true });
        if (brand) query = query.eq("brand", brand);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json(data ?? []);
      }
      case "balance_transactions:clear": {
        const brand: string | null = payload?.brand ?? null;
        const action: string | null = payload?.action ?? null;
        const { data, error } = await supabase.rpc("clear_balance_transactions", { p_brand: brand, p_action: action });
        if (error) return json({ error: error.message }, 500);
        return json(data ?? 0);
      }
      case "brand_balances:setTotalBalance": {
        const brand: string = String(payload?.brand || "");
        const amount: number = Number(payload?.amount || 0);
        const { data, error } = await supabase.rpc("set_brand_balance", { p_brand: brand, p_new_total: amount });
        if (!error && typeof data === "number") return json(data);
        const { data: existing } = await supabase.from("brand_balances").select("*").eq("brand", brand).single();
        if (!existing) {
          const { data: inserted, error: insertErr } = await supabase
            .from("brand_balances")
            .insert([{ brand, current_balance: amount, initial_balance: amount }])
            .select()
            .single();
          if (insertErr) return json({ error: insertErr.message }, 500);
          await supabase
            .from("balance_transactions")
            .insert([
              {
                brand,
                action: "set",
                amount,
                product_id: null,
                product_title: null,
                keys_count: null,
                note: "manual set",
                balance_before: null,
                balance_after: amount,
              },
            ]);
          return json(inserted?.current_balance ?? amount);
        } else {
          const before = existing.current_balance as number;
          const { data: updated, error: updErr } = await supabase
            .from("brand_balances")
            .update({ current_balance: amount })
            .eq("brand", brand)
            .select()
            .single();
          if (updErr) return json({ error: updErr.message }, 500);
          await supabase
            .from("balance_transactions")
            .insert([
              {
                brand,
                action: "set",
                amount,
                product_id: null,
                product_title: null,
                keys_count: null,
                note: "manual set",
                balance_before: before,
                balance_after: amount,
              },
            ]);
          return json(updated?.current_balance ?? amount);
        }
      }
      case "known_customer:check": {
        const email: string = String(payload?.email || "").trim();
        const phone: string = String(payload?.phone || "").trim().replace(/\D/g, "");
        let knownByEmail = false;
        let knownByPhone = false;
        try {
          if (email) {
            const { data: keysByEmail } = await supabase
              .from("product_keys")
              .select("id")
              .eq("is_used", true)
              .ilike("used_by_email", email)
              .limit(1);
            knownByEmail = !!(keysByEmail && keysByEmail.length > 0);
            if (!knownByEmail) {
              const { data: intentsByEmail } = await supabase.from("purchase_intents").select("id").ilike("email", email);
              const intentIds = (intentsByEmail || []).map((i: any) => i.id);
              if (intentIds.length > 0) {
                const { data: keysForEmailIntents } = await supabase
                  .from("product_keys")
                  .select("id")
                  .in("purchase_intent_id", intentIds)
                  .eq("is_used", true)
                  .limit(1);
                knownByEmail = !!(keysForEmailIntents && keysForEmailIntents.length > 0);
              }
            }
          }
          if (phone) {
            const { data: intentsByPhone } = await supabase
              .from("purchase_intents")
              .select("id")
              .ilike("phone_number", phone);
            const phoneIntentIds = (intentsByPhone || []).map((i: any) => i.id);
            if (phoneIntentIds.length > 0) {
              const { data: keysForPhoneIntents } = await supabase
                .from("product_keys")
                .select("id")
                .in("purchase_intent_id", phoneIntentIds)
                .eq("is_used", true)
                .limit(1);
              knownByPhone = !!(keysForPhoneIntents && keysForPhoneIntents.length > 0);
            }
          }
        } catch {
          return json({ known: false });
        }
        return json({ known: knownByEmail || knownByPhone });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
