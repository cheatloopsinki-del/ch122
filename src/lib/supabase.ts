import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use import.meta.env for Vite projects with fallbacks to prevent crashes
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const disableFunctions = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DISABLE_FUNCTIONS === 'true');
const preferDirectFunctions = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PREFER_DIRECT_FUNCTIONS === 'true');

// Validate URL before creating client to prevent "Invalid URL" crash
const isValidUrl = (url: string) => {
  try {
    return !!new URL(url);
  } catch {
    return false;
  }
};

// Enhanced error logging for debugging connection issues
if (!isValidUrl(supabaseUrl)) {
  console.error(`[Supabase Error] Invalid URL: "${supabaseUrl}". Please check VITE_SUPABASE_URL in your .env file.`);
}

if (!supabaseAnonKey || supabaseAnonKey.includes('****')) {
  console.error('[Supabase Error] Invalid or Missing Anon Key. Please check VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Safe client creation - prevents "Failed to construct 'URL'" error
export const supabase: SupabaseClient | null = isValidUrl(supabaseUrl) && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const invokeAdmin = async (action: string, payload?: any) => {
  if (disableFunctions) throw new Error('edge_functions_disabled');
  if (!supabase) throw new Error('Supabase not configured');
  const callDirect = async () => {
    const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-api`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt);
    }
    return res.json();
  };
  if (preferDirectFunctions) {
    try {
      return await callDirect();
    } catch {
      const { data, error } = await supabase.functions.invoke('admin-api', { body: { action, payload } });
      if (error) throw new Error(error.message || 'admin-api error');
      return data;
    }
  }
  try {
    const { data, error } = await supabase.functions.invoke('admin-api', { body: { action, payload } });
    if (error) throw new Error(error.message || 'admin-api error');
    return data;
  } catch {
    return await callDirect();
  }
};

// Create a separate, isolated client for service role operations.
const createAdminClient = () => {
  // Basic validation for service role key
  // Service Role Keys are JWTs and MUST start with "ey..."
  if (!isValidUrl(supabaseUrl)) {
    console.warn('[Supabase Admin] Invalid URL');
    return null;
  }
  
  if (!supabaseServiceRoleKey) {
    console.warn('[Supabase Admin] Missing Service Role Key');
    return null;
  }

  // Check if it looks like a JWT
  if (!supabaseServiceRoleKey.startsWith('ey')) {
    console.warn('[Supabase Warning] Service Role Key does not look like a valid JWT (should start with "ey"). Admin features may not work.');
    return null;
  }
  
  try {
    console.log('[Supabase Admin] Initializing admin client...');
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });
  } catch (error) {
    console.error("Failed to initialize admin client:", error);
    return null;
  }
};

const supabaseAdmin = createAdminClient();
export { supabaseAdmin };


export interface Category {
  id: string;
  name: string;
  slug: string;
  position?: number;
  created_at?: string;
}

export interface ProductLink {
  id: string;
  label: string;
  url: string;
}

export interface Product {
  id: string;
  title: string;
  price: number;
  features: string[];
  description: string;
  buy_link: string;
  alternative_links?: ProductLink[]; // New field for multiple links
  image?: string;
  video_link?: string;
  video_url?: string; // Uploaded video URL
  video_library_id?: string; // Reference to video library
  is_popular?: boolean;
  is_hidden?: boolean;
  masked_name?: string;
  masked_domain?: string;
  category: 'pubg' | 'codm';
  category_id: string;
  purchase_image_id?: string | null;
  payment_gateway_tax?: number; // Tax percentage for payment gateway
  purchase_method?: 'external' | 'qr' | 'gateway'; // Method of purchase
  created_at?: string;
  updated_at?: string;
  sort_order?: number;
}

export interface WinningPhoto {
  id: string;
  created_at?: string;
  image_url: string;
  product_name: string;
  description?: string;
  position?: number;
}

export interface SiteSetting {
  key: string;
  value: string;
}

export interface PurchaseImage {
  id: string;
  created_at?: string;
  name: string;
  image_url: string;
}

export type BrandName = 'cheatloop' | 'sinki';

export interface BrandBalance {
  id: string;
  brand: BrandName;
  current_balance: number;
  initial_balance: number;
  updated_at?: string;
}

export interface BalanceTransaction {
  id: string;
  created_at: string;
  brand: BrandName;
  product_id?: string | null;
  product_title?: string | null;
  action: 'debit' | 'credit' | 'set';
  amount: number;
  keys_count?: number | null;
  note?: string | null;
  balance_before?: number | null;
  balance_after?: number | null;
  key_batch_id?: string | null;
}

export interface ProductKeyCost {
  id?: number;
  brand: BrandName;
  product_label: string;
  cost: number;
}
export interface PurchaseIntent {
  id: string;
  created_at: string;
  product_id: string;
  product_title: string;
  country: string;
  email: string;
  phone_number: string;
  payment_method?: string;
}

export interface InvoiceTemplateData {
  id: string;
  brand_name: string;
  logo_url: string | null;
  company_name: string | null;
  support_contact: string | null;
  footer_notes: string | null;
  bg_color?: string;
  text_color?: string;
  created_at: string;
}

export interface ProductKey {
  id: string;
  created_at: string;
  product_id: string;
  key_value: string;
  is_used: boolean;
  used_by_email: string | null;
  used_at: string | null;
  purchase_intent_id: string | null;
  expiration_date?: string | null;
}

export interface AuthUser {
    id: string;
    email?: string;
    phone?: string;
    created_at: string;
    last_sign_in_at?: string;
    banned_until?: string;
}

export interface LocalPaymentMethod {
  id: string;
  country: string;
  method_name: string;
  account_holder?: string;
  account_number?: string;
  iban?: string;
  custom_price?: string;
  product_prices?: Record<string, string>; // JSONB: { product_id: price_string }
  is_active: boolean;
  is_crypto?: boolean;
  crypto_network?: string;
  image_url?: string;
  currency_symbol?: string;
  local_priority?: number;
  popularity_score?: number;
  name_ar?: string;
  name_en?: string;
  name_tr?: string;
  created_at?: string;
}

export interface VerifiedUser {
  id: string;
  username: string;
  product_type: string;
  created_at?: string;
}

export const userService = {
  async getUsers(): Promise<AuthUser[]> {
    if (!supabaseAdmin) {
      throw new Error('Supabase service role key is invalid or missing. It must be a JWT starting with "ey...". Check your .env file.');
    }
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      console.error('Error listing users:', error);
      throw error;
    }
    return data.users;
  },

  async updateUserPassword(userId: string, password: string): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase service role key is not configured.');
    }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error('Error updating user password:', error);
    throw new Error(`Failed to update user password: ${error.message}`);
  }
  },

  async createUser(email: string, password: string): Promise<AuthUser> {
    if (!supabaseAdmin) {
      throw new Error('Supabase service role key is not configured.');
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error.message}`);
    }
    return data.user;
  },

  async updateUserEmail(userId: string, newEmail: string): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase service role key is not configured.');
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail });
    if (error) {
      console.error('Error updating user email:', error);
      throw new Error(`Failed to update user email: ${error.message}`);
    }
  },

  async toggleUserBan(userId: string, isCurrentlyBanned: boolean): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase service role key is not configured.');
    }
    const ban_duration = isCurrentlyBanned ? 'none' : '876000h';
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration });
    if (error) {
      console.error(`Error ${isCurrentlyBanned ? 'unbanning' : 'banning'} user:`, error);
      throw new Error(`Failed to ${isCurrentlyBanned ? 'unban' : 'ban'} user: ${error.message}`);
    }
  }
};


export const settingsService = {
  async getSettings(): Promise<Record<string, string>> {
    try {
      const list = await invokeAdmin('settings:get') as { key: string; value: string }[];
      return (list || []).reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, string>);
    } catch {
      if (!supabase) return {};
      const { data, error } = await supabase.from('site_settings').select('*');
      if (error) return {};
      return (data || []).reduce((acc: any, s: any) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
    }
  },

  async updateSettings(settings: SiteSetting[]): Promise<void> {
    try {
      await invokeAdmin('settings:update', settings);
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const rows = settings.map(s => ({ key: s.key, value: s.value }));
      const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    }
  },
};

export const categoryService = {
  async getAllCategories(): Promise<Category[]> {
    try {
      const data = await invokeAdmin('categories:list') as Category[];
      return data || [];
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase.from('categories').select('*').order('position', { ascending: true });
      if (error) return [];
      return data || [];
    }
  },

  async addCategory(name: string): Promise<Category> {
    const data = await invokeAdmin('categories:add', { name }) as Category;
    return data;
  },

  async updatePositions(categories: Category[]): Promise<void> {
    await invokeAdmin('categories:updatePositions', categories);
  },

  async deleteCategory(id: string): Promise<void> {
    await invokeAdmin('categories:delete', { id });
  }
};

export const verifiedUserService = {
  async getAll(): Promise<VerifiedUser[]> {
    const data = await invokeAdmin('verified_users:list') as VerifiedUser[];
    return data || [];
  },

  async add(username: string, productType: string): Promise<VerifiedUser> {
    const data = await invokeAdmin('verified_users:add', { username, product_type: productType }) as VerifiedUser;
    return data;
  },

  async addVerified(username: string, productType: string): Promise<VerifiedUser> {
    return await this.add(username, productType);
  },

  async addMany(usernames: string[], productType: string): Promise<number> {
    const cleaned = Array.from(new Set(usernames.map(u => u.trim()).filter(u => u.length > 0)));
    if (cleaned.length === 0) return 0;
    const res = await invokeAdmin('verified_users:addMany', { usernames: cleaned, product_type: productType }) as { inserted: number };
    return res?.inserted ?? cleaned.length;
  },

  async delete(id: string): Promise<void> {
    await invokeAdmin('verified_users:delete', { id });
  },

  async checkVerification(username: string, _productType: string): Promise<boolean> {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('user_hub')
      .select('verified,latest_verified')
      .ilike('username', username)
      .in('product_type', ['cheatloop', 'sinki'])
      .maybeSingle();
    if (error) return false;
    return !!(data?.verified || data?.latest_verified);
  },

  async updateVerifiedByIdentity(username: string, productType: 'cheatloop' | 'sinki', verified: boolean): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('user_hub')
      .update({ verified, latest_verified: verified })
      .eq('username', username)
      .eq('product_type', productType);
    if (error) throw error;
  }
};

// --- Core REST helpers (Accept-Profile/Content-Profile: core) ---
const buildCoreHeaders = async (schema: 'core' | 'public' = 'public') => {
  const headers: Record<string, string> = {
    'apikey': supabaseAnonKey,
    'Accept': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema
  };
  try {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  return headers;
};

const coreRest = {
  async get(path: string, query: string = '', schema: 'core' | 'public' = 'core') {
    const headers = await buildCoreHeaders(schema);
    const url = `${supabaseUrl}/rest/v1/${path}${query ? `?${query}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Core GET ${path} failed: ${res.status} ${txt}`);
    }
    return res.json();
  },
  async post(path: string, body: any, schema: 'core' | 'public' = 'public') {
    const headers = await buildCoreHeaders(schema);
    headers['Content-Type'] = 'application/json';
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Core POST ${path} failed: ${res.status} ${txt}`);
    }
    return res.json().catch(() => ({}));
  },
  async patch(path: string, body: any, query: string = '', schema: 'core' | 'public' = 'public') {
    const headers = await buildCoreHeaders(schema);
    headers['Content-Type'] = 'application/json';
    const url = `${supabaseUrl}/rest/v1/${path}${query ? `?${query}` : ''}`;
    const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Core PATCH ${path} failed: ${res.status} ${txt}`);
    }
    return res.json().catch(() => ({}));
  },
  async rpc(func: string, body: any, schema: 'core' | 'public' = 'public') {
    const headers = await buildCoreHeaders(schema);
    headers['Content-Type'] = 'application/json';
    const url = `${supabaseUrl}/rest/v1/rpc/${func}`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Core RPC ${func} failed: ${res.status} ${txt}`);
    }
    return res.json().catch(() => ({}));
  }
};

export interface CoreOverviewRow {
  username: string;
  product_type: 'cheatloop' | 'sinki';
  cpuid: string | null;
  verified_flag: boolean;
  last_attempt: string | null;
  attempts_count: number;
  any_suspicion: boolean;
  banned?: boolean;
  latest_created_at?: string | null;
  latest_ip?: string | null;
  latest_report_summary?: string | null;
}

export interface CoreLogRow {
  id: string;
  username: string;
  product_type: 'cheatloop' | 'sinki';
  cpuid: string | null;
  verified: boolean;
  suspicion: boolean;
  report_summary: string | null;
  created_at: string;
}

export interface CoreBanRow {
  id: string;
  cpuid: string;
  username: string | null;
  product_type: 'cheatloop' | 'sinki';
  reason: string | null;
  banned: boolean;
  created_at: string;
  lifted_at: string | null;
}

export const coreVerificationService = {
  async fetchOverview(params: { q?: string; product_type?: 'cheatloop' | 'sinki'; verified?: boolean; banned?: boolean; suspicion?: boolean; since?: string } = {}): Promise<CoreOverviewRow[]> {
    const ql = (params.q || '').toLowerCase();
    let rows: CoreOverviewRow[] = [];
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin.rpc('admin_list_users', {
          p_product_type: params.product_type ?? null,
          p_banned_only: typeof params.banned === 'boolean' ? params.banned : null,
          p_q: params.q ?? null
        });
        if (error) throw error;
        const list = (data || []) as any[];
        rows = list.map((u: any) => ({
          username: u.username,
          product_type: u.product_type,
          cpuid: u.cpuid || null,
          verified_flag: !!u.verified,
          last_attempt: u.last_attempt || u.latest_created_at || null,
          attempts_count: u.attempts ?? 0,
          any_suspicion: !!u.any_suspicion,
          banned: !!u.banned,
          latest_created_at: u.latest_created_at || null,
          latest_ip: u.latest_ip || null,
          latest_report_summary: u.latest_report_summary || null
        }));
      } catch {
        let query = supabase!.from('user_hub').select('*').order('last_attempt', { ascending: false });
        if (params.product_type) query = query.eq('product_type', params.product_type);
        if (typeof params.banned === 'boolean') query = query.eq('banned', params.banned);
        const { data, error } = await query;
        if (error) throw error;
        rows = (data || []).map((u: any) => ({
          username: u.username,
          product_type: u.product_type,
          cpuid: u.cpuid || null,
          verified_flag: !!u.verified,
          last_attempt: u.last_attempt || u.latest_created_at || null,
          attempts_count: u.attempts ?? 0,
          any_suspicion: !!u.any_suspicion,
          banned: !!u.banned,
          latest_created_at: u.latest_created_at || null,
          latest_ip: u.latest_ip || null,
          latest_report_summary: u.latest_report_summary || null
        }));
      }
    } else {
      let query = supabase!.from('user_hub').select('*').order('last_attempt', { ascending: false });
      if (params.product_type) query = query.eq('product_type', params.product_type);
      if (typeof params.banned === 'boolean') query = query.eq('banned', params.banned);
      const { data, error } = await query;
      if (error) throw error;
      rows = (data || []).map((u: any) => ({
        username: u.username,
        product_type: u.product_type,
        cpuid: u.cpuid || null,
        verified_flag: !!u.verified,
        last_attempt: u.last_attempt || u.latest_created_at || null,
        attempts_count: u.attempts ?? 0,
        any_suspicion: !!u.any_suspicion,
        banned: !!u.banned,
        latest_created_at: u.latest_created_at || null,
        latest_ip: u.latest_ip || null,
        latest_report_summary: u.latest_report_summary || null
      }));
    }
    if (ql) {
      rows = rows.filter(r =>
        (r.username || '').toLowerCase().includes(ql) ||
        (r.product_type || '').toLowerCase().includes(ql) ||
        (r.cpuid || '').toLowerCase().includes(ql)
      );
    }
    if (typeof params.verified === 'boolean') {
      rows = rows.filter(r => !!r.verified_flag === params.verified);
    }
    if (typeof params.suspicion === 'boolean') {
      rows = rows.filter(r => !!r.any_suspicion === params.suspicion);
    }
    return rows;
  },

  async fetchLogs(params: { username?: string; product_type?: 'cheatloop' | 'sinki'; verified?: boolean; suspicion?: boolean } = {}): Promise<CoreLogRow[]> {
    let query = supabase!.from('user_hub').select('*').order('latest_created_at', { ascending: false });
    if (params.username) query = query.eq('username', params.username);
    if (params.product_type) query = query.eq('product_type', params.product_type);
    const { data, error } = await query;
    if (error) throw error;
    const rows: CoreLogRow[] = (data || []).map((u: any) => ({
      id: u.latest_log_id || `${u.username}-${u.product_type}-${u.latest_created_at || u.last_attempt || ''}`,
      username: u.username,
      product_type: u.product_type,
      cpuid: u.cpuid || null,
      verified: u.latest_verified ?? u.verified ?? false,
      suspicion: u.latest_suspicion ?? u.any_suspicion ?? false,
      report_summary: u.latest_report_summary || null,
      created_at: (u.latest_created_at || u.last_attempt || u.created_at)
    }));
    return rows;
  },

  async fetchActiveBans(): Promise<CoreBanRow[]> {
    // Try core schema first if available
    try {
      const { data, error } = await supabase!.schema('core').from('device_bans').select('*').eq('banned', true).order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data as CoreBanRow[];
      }
    } catch {}
    // Then try public view via REST
    try {
      const list = await coreRest.get('device_bans', 'select=*&banned=eq.true&order=created_at.desc', 'public');
      return list as CoreBanRow[];
    } catch {}
    // Finally try public via supabase-js (if a view exists)
    try {
      const { data, error } = await supabase!.from('device_bans').select('*').eq('banned', true).order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return data as CoreBanRow[];
      }
    } catch {}
    // If nothing works, return empty list gracefully
    return [];
  },

  async unbanDevice(cpuid: string): Promise<void> {
    try {
      await coreRest.rpc('unban_device', { p_cpuid: cpuid }, 'public');
    } catch (e) {
      throw e;
    }
  },

  async banDevice(payload: { cpuid: string; reason: string; username?: string; product_type?: 'cheatloop' | 'sinki' }): Promise<void> {
    try {
      await coreRest.rpc('ban_device', {
        p_cpuid: payload.cpuid,
        p_username: payload.username || '',
        p_product: payload.product_type || 'cheatloop',
        p_reason: payload.reason || 'manual ban'
      }, 'public');
    } catch (e) {
      throw e;
    }
  },

  async updateVerifiedByIdentity(username: string, product_type: 'cheatloop' | 'sinki', verified: boolean): Promise<void> {
    const { data, error } = await supabase!.from('user_hub').select('*').eq('username', username).eq('product_type', product_type).limit(1);
    if (error) throw error;
    const row = (data || [])[0];
    const attempts = (row?.attempts ?? 0) + 1;
    const now = new Date().toISOString();
    const upd = await supabase!.from('user_hub').update({
      verified,
      attempts,
      last_attempt: now,
      latest_verified: verified,
      latest_suspicion: false,
      latest_report_summary: 'تغيير يدوي من المشرف',
      latest_created_at: now
    }).eq('username', username).eq('product_type', product_type);
    if (upd.error) throw upd.error;
  },

  async addVerified(username: string, product_type: 'cheatloop' | 'sinki'): Promise<void> {
    const { error } = await supabase!.from('user_hub').insert({
      username, product_type, verified: true, attempts: 0, any_suspicion: false
    });
    if (error) throw error;
  },

  async addVerifiedMany(usernames: string[], product_type: 'cheatloop' | 'sinki'): Promise<number> {
    const cleaned = Array.from(new Set(usernames.map(u => u.trim()).filter(Boolean)));
    let count = 0;
    for (const u of cleaned) {
      try {
        await supabase!.from('user_hub').insert({ username: u, product_type, verified: true, attempts: 0, any_suspicion: false });
        count++;
      } catch (e) {
        // ignore individual failures to continue bulk
      }
    }
    return count;
  }
  ,
  async deleteUser(username: string, product_type: 'cheatloop' | 'sinki'): Promise<void> {
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.rpc('admin_delete_user', { p_username: username, p_product_type: product_type });
      if (!error) return;
    }
    const { error: delError } = await supabase!.from('user_hub').delete().eq('username', username).eq('product_type', product_type);
    if (delError) throw delError;
  },
  async addLog(payload: { username: string; product_type: 'cheatloop' | 'sinki'; cpuid?: string | null; verified?: boolean; suspicion?: boolean; report_summary?: string | null }): Promise<void> {
    const { data, error } = await supabase!.from('user_hub').select('*').eq('username', payload.username).eq('product_type', payload.product_type).limit(1);
    if (error) throw error;
    const row = (data || [])[0];
    const attempts = (row?.attempts ?? 0) + 1;
    const now = new Date().toISOString();
    const upd = await supabase!.from('user_hub').update({
      attempts,
      last_attempt: now,
      any_suspicion: !!(row?.any_suspicion || payload.suspicion),
      cpuid: payload.cpuid ?? row?.cpuid ?? null,
      latest_verified: payload.verified ?? row?.latest_verified ?? row?.verified ?? false,
      latest_suspicion: payload.suspicion ?? row?.latest_suspicion ?? false,
      latest_report_summary: payload.report_summary ?? row?.latest_report_summary ?? null,
      latest_created_at: now
    }).eq('username', payload.username).eq('product_type', payload.product_type);
    if (upd.error) throw upd.error;
  }
};
export const verifiedStatusService = {
  async isBannedByIdentity(username: string, _productType: string): Promise<boolean> {
    if (!supabase) {
      try {
        const res = await fetch(`/.netlify/functions/sb?action=userhub:identity-status&username=${encodeURIComponent(username)}`);
        if (!res.ok) return false;
        const data = await res.json();
        return !!data?.banned;
      } catch {
        return false;
      }
    }
    const { data, error } = await supabase
      .from('user_hub')
      .select('banned')
      .ilike('username', username)
      .in('product_type', ['cheatloop', 'sinki'])
      .maybeSingle();
    if (error) return false;
    return !!data?.banned;
  },
  async getIdentityStatus(username: string): Promise<{ exists: boolean; verified: boolean; banned: boolean }> {
    if (!supabase) {
      try {
        const res = await fetch(`/.netlify/functions/sb?action=userhub:identity-status&username=${encodeURIComponent(username)}`);
        if (!res.ok) return { exists: false, verified: false, banned: false };
        const data = await res.json();
        return {
          exists: !!data?.exists,
          verified: !!data?.verified,
          banned: !!data?.banned
        };
      } catch {
        return { exists: false, verified: false, banned: false };
      }
    }
    const { data, error } = await supabase
      .from('user_hub')
      .select('verified, latest_verified, banned, product_type')
      .ilike('username', username)
      .in('product_type', ['cheatloop', 'sinki']);
    if (error) return { exists: false, verified: false, banned: false };
    const rows = (data || []) as any[];
    const exists = rows.length > 0;
    const banned = rows.some(r => !!r.banned);
    const verified = rows.some(r => !!(r.verified || r.latest_verified));
    return { exists, verified, banned };
  },
  async setIdentityBan(username: string, product_type: 'cheatloop' | 'sinki', banned: boolean): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('user_hub')
      .update({ banned })
      .eq('username', username)
      .eq('product_type', product_type);
    if (error) throw error;
  }
};
export const productService = {
  async getProductById(id: string): Promise<Product> {
    try {
      const data = await invokeAdmin('products:get', { id }) as Product;
      return data;
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) throw new Error('Failed to fetch product');
      return {
        ...data,
        is_hidden: data.is_hidden ?? false,
        alternative_links: data.alternative_links || []
      } as Product;
    }
  },
  async getAllProducts(): Promise<Product[]> {
    try {
      const data = await invokeAdmin('products:list') as Product[];
      const productsWithHidden = (data || []).map(product => ({
        ...product,
        is_hidden: product.is_hidden ?? false,
        alternative_links: product.alternative_links || []
      }));
      return productsWithHidden;
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase.from('products').select('*').order('sort_order', { ascending: true });
      if (error) return [];
      return (data || []).map(product => ({
        ...product,
        is_hidden: product.is_hidden ?? false,
        alternative_links: product.alternative_links || []
      }));
    }
  },

  async getVisibleProducts(): Promise<Product[]> {
    try {
      const data = await invokeAdmin('products:listVisible') as Product[];
      return (data || []).map(product => ({
        ...product,
        is_hidden: product.is_hidden ?? false,
        alternative_links: product.alternative_links || []
      }));
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or('is_hidden.eq.false,is_hidden.is.null')
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data || []).map(product => ({
        ...product,
        is_hidden: product.is_hidden ?? false,
        alternative_links: product.alternative_links || []
      }));
    }
  },

  async updateProductPositions(products: Product[]): Promise<void> {
    await invokeAdmin('products:updatePositions', products);
  },

  async addProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const data = await invokeAdmin('products:add', product) as Product;
    return data;
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
    const data = await invokeAdmin('products:update', { id, patch: product }) as Product;
    return data;
  },

  async deleteProduct(id: string): Promise<void> {
    await invokeAdmin('products:delete', { id });
  }
};

// ... rest of the file remains unchanged ...
export const winningPhotosService = {
  async getPhotos(productName?: string): Promise<WinningPhoto[]> {
    try {
      const data = await invokeAdmin('winning_photos:list', { product_name: productName }) as WinningPhoto[];
      return data || [];
    } catch {
      if (!supabase) return [];
      const query = supabase
        .from('winning_photos')
        .select('*');
      const { data, error } = productName 
        ? await query.eq('product_name', productName).order('position', { ascending: true })
        : await query.order('position', { ascending: true });
      if (error) return [];
      return data || [];
    }
  },

  async addPhotos(photos: Omit<WinningPhoto, 'id' | 'created_at' | 'position'>[]): Promise<WinningPhoto[]> {
    if (photos.length === 0) return [];
    const data = await invokeAdmin('winning_photos:add', { photos }) as WinningPhoto[];
    return data || [];
  },

  async deletePhotos(photos: WinningPhoto[]): Promise<void> {
    if (photos.length === 0) return;
    const ids = photos.map(p => p.id);
    await invokeAdmin('winning_photos:delete', { ids });
  },

  async movePhotos(photoIds: string[], newProductName: string): Promise<void> {
    if (photoIds.length === 0) return;
    await invokeAdmin('winning_photos:move', { ids: photoIds, product_name: newProductName });
  },
};

export const purchaseImagesService = {
  async getAll(): Promise<PurchaseImage[]> {
    try {
      const data = await invokeAdmin('purchase_images:list') as PurchaseImage[];
      return data || [];
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('purchase_images')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },

  async getById(id: string): Promise<PurchaseImage> {
    try {
      const data = await invokeAdmin('purchase_images:get', { id }) as PurchaseImage;
      return data;
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('purchase_images')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) throw new Error('Failed to fetch purchase image');
      return data as PurchaseImage;
    }
  },

  async addImage(name: string, imageUrl: string): Promise<PurchaseImage> {
    const data = await invokeAdmin('purchase_images:add', { name, image_url: imageUrl }) as PurchaseImage;
    return data;
  },

  async deleteImage(image: PurchaseImage): Promise<void> {
    await invokeAdmin('purchase_images:delete', { id: image.id, image_url: image.image_url });
  }
};

export const purchaseIntentsService = {
  async addIntent(intent: Omit<PurchaseIntent, 'id' | 'created_at'>): Promise<PurchaseIntent> {
    try {
      const data = await invokeAdmin('purchase_intents:add', { intent }) as PurchaseIntent;
      return data;
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('purchase_intents')
        .insert({
          product_id: intent.product_id,
          product_title: intent.product_title,
          country: intent.country,
          email: intent.email,
          phone_number: intent.phone_number,
          payment_method: intent.payment_method,
        })
        .select('*')
        .maybeSingle();
      if (error || !data) throw new Error('Failed to create purchase intent');
      return data as PurchaseIntent;
    }
  },

  async getAll(): Promise<PurchaseIntent[]> {
    try {
      const data = await invokeAdmin('purchase_intents:list') as PurchaseIntent[];
      return data || [];
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('purchase_intents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },

  async deleteIntents(ids: string[]): Promise<void> {
    try {
      await invokeAdmin('purchase_intents:deleteMany', { ids });
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('purchase_intents')
        .delete()
        .in('id', ids);
      if (error) throw error;
    }
  },
};

export const invoiceTemplateService = {
  async getAll(): Promise<InvoiceTemplateData[]> {
    try {
      const data = await invokeAdmin('invoice_templates:list') as InvoiceTemplateData[];
      return data || [];
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('invoice_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },

  async update(id: string, updates: Partial<InvoiceTemplateData>): Promise<InvoiceTemplateData> {
    const data = await invokeAdmin('invoice_templates:update', { id, updates }) as InvoiceTemplateData;
    return data;
  },
};

export const productKeysService = {
  async addKeys(productId: string, keys: string[]): Promise<number> {
    const trimmed = (keys || []).map(k => k.trim()).filter(k => k.length > 0);
    if (trimmed.length === 0) return 0;
    const count = await invokeAdmin('product_keys:add', { product_id: productId, keys: trimmed }) as number;
    return typeof count === 'number' ? count : 0;
  },

  async getKeys(filters: { productId?: string; isUsed?: boolean } = {}): Promise<ProductKey[]> {
    try {
      const data = await invokeAdmin('product_keys:list', filters) as ProductKey[];
      return data || [];
    } catch {
      if (!supabase) return [];
      let query = supabase.from('product_keys').select('*');
      if (filters.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (typeof filters.isUsed === 'boolean') {
        query = query.eq('is_used', filters.isUsed);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },

  async claimAvailableKey(productId: string, email: string, intentId: string): Promise<string> {
    const data = await invokeAdmin('product_keys:claim', {
      product_id: productId,
      email,
      intent_id: intentId,
    }) as string;
    return data;
  },

  async useManualKey(productId: string, keyValue: string, email: string, intentId: string): Promise<ProductKey> {
    const data = await invokeAdmin('product_keys:useManual', {
      product_id: productId,
      key_value: keyValue,
      email,
      intent_id: intentId,
    }) as ProductKey;
    return data;
  },

  async returnKey(id: string): Promise<void> {
    await invokeAdmin('product_keys:returnOne', { id });
  },

  async deleteKey(id: string): Promise<void> {
    await invokeAdmin('product_keys:deleteOne', { id });
  },

  async deleteKeys(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await invokeAdmin('product_keys:deleteMany', { ids });
  },

  async returnKeys(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await invokeAdmin('product_keys:returnMany', { ids });
  },
};

export const brandBalancesService = {
  async getBalances(): Promise<BrandBalance[]> {
    const data = await invokeAdmin('brand_balances:list') as BrandBalance[];
    return data || [];
  },

  async getTransactions(limit = 100, brand?: BrandName): Promise<BalanceTransaction[]> {
    const data = await invokeAdmin('balance_transactions:list', { limit, brand }) as BalanceTransaction[];
    return data || [];
  },

  async getBatchKeys(batchId: string, limit = 200): Promise<ProductKey[]> {
    const data = await invokeAdmin('product_keys:listByBatch', { batchId, limit }) as ProductKey[];
    return data || [];
  },

  async getProductPrices(brand?: BrandName): Promise<ProductKeyCost[]> {
    const data = await invokeAdmin('product_key_costs:list', { brand }) as ProductKeyCost[];
    return data || [];
  },

  async clearTransactions(action?: 'debit' | 'credit' | 'set', brand?: BrandName): Promise<number> {
    const n = await invokeAdmin('balance_transactions:clear', { brand: brand ?? null, action: action ?? null }) as number;
    return typeof n === 'number' ? n : 0;
  },

  async setTotalBalance(brand: BrandName, amount: number): Promise<number> {
    const newTotal = await invokeAdmin('brand_balances:setTotalBalance', { brand, amount }) as number;
    return typeof newTotal === 'number' ? newTotal : amount;
  },
};

export const customerHistoryService = {
  async isKnownCustomer(email?: string, phone?: string): Promise<boolean> {
    const e = (email || '').trim();
    const p = (phone || '').trim();
    try {
      const res = await invokeAdmin('known_customer:check', { email: e, phone: p }) as { known: boolean };
      return !!res?.known;
    } catch {
      return false;
    }
  }
};

export const localPaymentService = {
  async getAll(): Promise<LocalPaymentMethod[]> {
    try {
      const data = await invokeAdmin('local_payment_methods:list') as LocalPaymentMethod[];
      return data || [];
    } catch {
      if (!supabase) return [];
      try {
        const { data, error } = await supabase
          .from('local_payment_methods')
          .select('*')
          .order('local_priority', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch {
        const { data, error } = await supabase
          .from('local_payment_methods')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
      }
    }
  },

  async getById(id: string): Promise<LocalPaymentMethod> {
    try {
      const data = await invokeAdmin('local_payment_methods:get', { id }) as LocalPaymentMethod;
      return data;
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase
        .from('local_payment_methods')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) throw new Error('Failed to fetch payment method');
      return data as LocalPaymentMethod;
    }
  },

  async addMethod(method: Omit<LocalPaymentMethod, 'id' | 'created_at'>): Promise<LocalPaymentMethod> {
    const data = await invokeAdmin('local_payment_methods:add', method) as LocalPaymentMethod;
    return data;
  },

  async updateMethod(id: string, updates: Partial<LocalPaymentMethod>): Promise<LocalPaymentMethod> {
    const data = await invokeAdmin('local_payment_methods:update', { id, updates }) as LocalPaymentMethod;
    return data;
  },

  async deleteMethod(id: string): Promise<void> {
    await invokeAdmin('local_payment_methods:delete', { id });
  }
};

export interface VideoLibraryItem {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string;
  created_at: string;
}

export const videoLibraryService = {
  async getAllVideos(): Promise<VideoLibraryItem[]> {
    const data = await invokeAdmin('video_library:list') as VideoLibraryItem[];
    return data || [];
  },

  async addVideo(title: string, videoUrl: string, thumbnailUrl?: string): Promise<VideoLibraryItem> {
    const data = await invokeAdmin('video_library:add', { title, video_url: videoUrl, thumbnail_url: thumbnailUrl }) as VideoLibraryItem;
    return data;
  },

  async deleteVideo(id: string, videoUrl: string): Promise<void> {
    await invokeAdmin('video_library:delete', { id, video_url: videoUrl });
  },

  async assignVideoToProducts(video: VideoLibraryItem, productIds: string[]): Promise<void> {
    await invokeAdmin('video_library:assignToProducts', { video, productIds });
  }
};

export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    if (disableFunctions) {
      if (!supabase) return false;
      const { error: e1 } = await supabase.from('categories').select('id').limit(1);
      const { error: e2 } = await supabase.from('products').select('id').limit(1);
      return !e1 && !e2;
    }
    const cats = await invokeAdmin('categories:list');
    const prods = await invokeAdmin('products:list');
    return Array.isArray(cats) && Array.isArray(prods);
  } catch {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
};
