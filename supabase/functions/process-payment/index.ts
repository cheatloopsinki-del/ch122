import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const apiKey = Deno.env.get("MONEYMOTION_API_KEY") ?? "";
const base = Deno.env.get("MONEYMOTION_BASE_URL") ?? "https://api.moneymotion.io";

type LineItem = {
  name: string;
  description: string;
  pricePerItemInCents: number;
  quantity: number;
};

type Payload = {
  json: {
    description: string;
    urls: {
      success: string;
      cancel: string;
      failure: string;
    };
    userInfo: {
      email: string;
    };
    lineItems: LineItem[];
    metadata?: Record<string, unknown>;
  };
};

serve(async (req) => {
  try {
    const body = await req.json() as { payload?: Payload; currency?: string };
    const payload = body.payload as Payload;
    const currency = String(body.currency || "usd").toLowerCase();

    const res = await fetch(`${base}/checkoutSessions.createCheckoutSession`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ ...payload, xCurrency: currency })
    });

    if (!res.ok) {
      const txt = await res.text();
      return new Response(txt, { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await res.json() as { result?: { data?: { json?: { checkoutSessionId?: string } } } };
    const id = data?.result?.data?.json?.checkoutSessionId ?? "";
    const url = id ? `https://moneymotion.io/checkout/${id}` : "";

    return new Response(JSON.stringify({ id, url, raw: data }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
