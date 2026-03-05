export const handler = async (event) => {
  const allowed = process.env.SUPABASE_ALLOWED_ORIGIN || '';
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const cors = {
    'Access-Control-Allow-Origin': allowed || origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPABASE_URL or SERVICE_ROLE_KEY missing' }) };
  }
  const base = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  const defaultHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`
  };
  async function getRest(path, qs) {
    const url = `${base}/${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { method: 'GET', headers: defaultHeaders });
    if (!res.ok) return { error: await res.text(), status: res.status };
    return { data: await res.json() };
  }
  async function postRest(path, body) {
    const url = `${base}/${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...defaultHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) return { error: await res.text(), status: res.status };
    return { data: await res.json() };
  }
  async function deleteRest(path, qs) {
    const url = `${base}/${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { method: 'DELETE', headers: defaultHeaders });
    if (!res.ok) return { error: await res.text(), status: res.status };
    return { data: true };
  }
  const params = event.queryStringParameters || {};
  const action = (params.action || '').toLowerCase();
  try {
    if (action === 'banned-countries:list') {
      const { data, error, status } = await getRest('banned_countries', 'select=*&order=created_at.desc');
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(data || []) };
    }
    if (action === 'categories:list') {
      const { data, error, status } = await getRest('categories', 'select=*&order=position.asc');
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(data || []) };
    }
    if (action === 'products:list') {
      let r = await getRest('products', 'select=*&is_hidden=eq.false&order=sort_order.asc&order=created_at.asc');
      if (r.error) {
        r = await getRest('products', 'select=*&is_hidden=eq.false&order=created_at.asc');
        if (r.error) {
          r = await getRest('products', 'select=*&is_hidden=eq.false&order=created_at.desc');
        }
      }
      if (r.error) return { statusCode: r.status || 500, headers: cors, body: JSON.stringify({ error: r.error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(r.data || []) };
    }
    if (action === 'products:get') {
      const id = params.id || (event.queryStringParameters && event.queryStringParameters.id) || '';
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id missing' }) };
      const { data, error, status } = await getRest('products', `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      const row = Array.isArray(data) ? data[0] || null : null;
      if (!row) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'not found' }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(row) };
    }
    if (action === 'local-payment-methods:list') {
      let r = await getRest('local_payment_methods', 'select=*&is_active=eq.true&order=local_priority.asc&order=popularity_score.desc&order=created_at.desc');
      if (r.error) {
        r = await getRest('local_payment_methods', 'select=*&is_active=eq.true&order=created_at.desc');
      }
      if (r.error) return { statusCode: r.status || 500, headers: cors, body: JSON.stringify({ error: r.error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(r.data || []) };
    }
    if (action === 'known-customer:check') {
      const email = (params.email || '').trim();
      const phone = (params.phone || '').trim();
      // 1) Check keys used by email
      if (email) {
        const r1 = await getRest('product_keys', `select=id&is_used=eq.true&used_by_email=ilike.${encodeURIComponent(email)}&limit=1`);
        if (!r1.error && Array.isArray(r1.data) && r1.data.length > 0) {
          return { statusCode: 200, headers: cors, body: JSON.stringify({ known: true, via: 'keys_by_email' }) };
        }
        const rIntents = await getRest('purchase_intents', `select=id&email=ilike.${encodeURIComponent(email)}`);
        if (!rIntents.error) {
          const ids = (Array.isArray(rIntents.data) ? rIntents.data : []).map(d => d.id).filter(Boolean);
          if (ids.length > 0) {
            const inList = ids.map(x => encodeURIComponent(String(x))).join(',');
            const rKeys = await getRest('product_keys', `select=id&is_used=eq.true&purchase_intent_id=in.(${inList})&limit=1`);
            if (!rKeys.error && Array.isArray(rKeys.data) && rKeys.data.length > 0) {
              return { statusCode: 200, headers: cors, body: JSON.stringify({ known: true, via: 'keys_by_email_intents' }) };
            }
          }
        }
      }
      // 2) Check intents by phone
      if (phone) {
        const clean = phone.replace(/\\D/g, '');
        const rIntentsPhone = await getRest('purchase_intents', `select=id&phone_number=ilike.${encodeURIComponent(clean)}`);
        if (!rIntentsPhone.error) {
          const ids = (Array.isArray(rIntentsPhone.data) ? rIntentsPhone.data : []).map(d => d.id).filter(Boolean);
          if (ids.length > 0) {
            const inList = ids.map(x => encodeURIComponent(String(x))).join(',');
            const rKeysPhone = await getRest('product_keys', `select=id&is_used=eq.true&purchase_intent_id=in.(${inList})&limit=1`);
            if (!rKeysPhone.error && Array.isArray(rKeysPhone.data) && rKeysPhone.data.length > 0) {
              return { statusCode: 200, headers: cors, body: JSON.stringify({ known: true, via: 'keys_by_phone_intents' }) };
            }
          }
        }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ known: false }) };
    }
    if (action === 'userhub:identity-status') {
      const username = (params.username || '').trim();
      if (!username) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'username missing' }) };
      const { data, error, status } = await getRest('user_hub', `select=verified,latest_verified,banned,product_type&username=ilike.${encodeURIComponent(username)}&product_type=in.(cheatloop,sinki)`);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      const rows = Array.isArray(data) ? data : [];
      const exists = rows.length > 0;
      const banned = rows.some(r => !!r.banned);
      const verified = rows.some(r => !!(r.verified || r.latest_verified));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ exists, verified, banned }) };
    }
    if (action === 'purchase-intents:add') {
      const body = JSON.parse(event.body || '{}');
      const payload = body.intent || body || {};
      const { data, error, status } = await postRest('purchase_intents', payload);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      const row = Array.isArray(data) ? data[0] || null : null;
      if (!row) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'insert failed' }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(row) };
    }
    if (action === 'banned-countries:add') {
      const body = JSON.parse(event.body || '{}');
      const countryName = body.countryName || body.country || '';
      if (!countryName) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'countryName missing' }) };
      const { error, status } = await postRest('banned_countries', { country_name: countryName });
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'banned-countries:remove') {
      const body = JSON.parse(event.body || '{}');
      const id = body.id || params.id || '';
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id missing' }) };
      const { error, status } = await deleteRest('banned_countries', `id=eq.${encodeURIComponent(id)}`);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'banned-ips:list') {
      const { data, error, status } = await getRest('banned_ips', 'select=*&order=created_at.desc');
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(data || []) };
    }
    if (action === 'banned-ips:add') {
      const body = JSON.parse(event.body || '{}');
      const ip = body.ip || body.ip_address || '';
      const reason = body.reason || null;
      if (!ip) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'ip missing' }) };
      const { error, status } = await postRest('banned_ips', { ip_address: ip, reason });
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'banned-ips:remove') {
      const body = JSON.parse(event.body || '{}');
      const id = body.id || params.id || '';
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id missing' }) };
      const { error, status } = await deleteRest('banned_ips', `id=eq.${encodeURIComponent(id)}`);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'hard-banned-ips:list') {
      const { data, error, status } = await getRest('hard_banned_ips', 'select=*&order=created_at.desc');
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(data || []) };
    }
    if (action === 'hard-banned-ips:add') {
      const body = JSON.parse(event.body || '{}');
      const ip = body.ip || body.ip_address || '';
      const reason = body.reason || null;
      if (!ip) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'ip missing' }) };
      const { error, status } = await postRest('hard_banned_ips', { ip_address: ip, reason });
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'hard-banned-ips:remove') {
      const body = JSON.parse(event.body || '{}');
      const id = body.id || params.id || '';
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id missing' }) };
      const { error, status } = await deleteRest('hard_banned_ips', `id=eq.${encodeURIComponent(id)}`);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'settings:get') {
      const { data, error, status } = await getRest('site_settings', 'select=*');
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(data || []) };
    }
    if (action === 'settings:update') {
      const body = JSON.parse(event.body || '{}');
      const settings = body.settings || body || {};
      const upsertData = Object.entries(settings).map(([key, value]) => ({ key, value }));
      const { error, status } = await postRest('site_settings', upsertData);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    if (action === 'visitor:get-unique-countries') {
      const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/get_unique_countries`;
      const res = await fetch(url, { method: 'POST', headers: { ...defaultHeaders, 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const list = data.map(d => d.country);
          return { statusCode: 200, headers: cors, body: JSON.stringify(list) };
        }
      }
      const { data: fallback } = await getRest('visitor_logs', 'select=country&order=visited_at.desc&limit=1000');
      const list = Array.from(new Set((fallback || []).map(d => d.country).filter(Boolean)));
      return { statusCode: 200, headers: cors, body: JSON.stringify(list) };
    }
    if (action === 'visitor:log') {
      const body = JSON.parse(event.body || '{}');
      const payload = body.payload || body || {};
      const { error, status } = await postRest('visitor_logs', payload);
      if (error) return { statusCode: status || 500, headers: cors, body: JSON.stringify({ error }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(e && e.message ? e.message : e) }) };
  }
}
