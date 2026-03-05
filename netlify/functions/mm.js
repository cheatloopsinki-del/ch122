export const handler = async (event) => {
  const allowed = process.env.MONEYMOTION_ALLOWED_ORIGIN || '';
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const cors = {
    'Access-Control-Allow-Origin': allowed || origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  const apiKey = process.env.MONEYMOTION_API_KEY || '';
  const base = process.env.MONEYMOTION_BASE_URL || 'https://api.moneymotion.io';
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'MONEYMOTION_API_KEY missing' }) };
  }
  const params = event.queryStringParameters || {};
  const action = (params.action || '').toLowerCase();
  try {
    if (action === 'createsession' || action === 'create-session') {
      const payload = JSON.parse(event.body || '{}');
      const res = await fetch(`${base}/checkoutSessions.createCheckoutSession`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text();
        return { statusCode: res.status, headers: cors, body: txt };
      }
      const data = await res.json();
      const id = data?.result?.data?.json?.checkoutSessionId || '';
      const url = id ? `https://moneymotion.io/checkout/${id}` : '';
      return { statusCode: 200, headers: cors, body: JSON.stringify({ id, url, raw: data }) };
    }
    if (action === 'getstatus' || action === 'get-status') {
      const sessionId = params.sessionId || params.checkoutId || '';
      if (!sessionId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'sessionId missing' }) };
      const res = await fetch(`${base}/checkoutSessions.getCompletedOrPendingCheckoutSessionInfo?json.checkoutId=${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey }
      });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'ping') {
      const res = await fetch(`${base}/ping.ping`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'balance') {
      const res = await fetch(`${base}/balance.getBalance`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'reserves') {
      const res = await fetch(`${base}/reserve.listReserves`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'sessions') {
      const page = params.page ? String(params.page) : '1';
      const res = await fetch(`${base}/checkoutSessions.listCheckoutSessions?json.page=${encodeURIComponent(page)}&json.limit=10`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'withdrawals') {
      const page = params.page ? String(params.page) : '1';
      const res = await fetch(`${base}/payouts.listPayouts?json.page=${encodeURIComponent(page)}`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'disputes') {
      const page = params.page ? String(params.page) : '1';
      const res = await fetch(`${base}/disputes.listDisputes?json.page=${encodeURIComponent(page)}`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'analytics') {
      const period = params.period ? String(params.period) : '7d';
      const res = await fetch(`${base}/analytics.getAnalytics?json.period=${encodeURIComponent(period)}`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'webhooks-create') {
      const payload = JSON.parse(event.body || '{}');
      const res = await fetch(`${base}/webhooks.createWebhook`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    if (action === 'webhooks-list') {
      const res = await fetch(`${base}/webhooks.listWebhooks`, { method: 'GET', headers: { 'x-api-key': apiKey } });
      const body = await res.text();
      return { statusCode: res.ok ? 200 : res.status, headers: cors, body };
    }
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) };
  }
}
