
interface MoneyMotionSessionRequest {
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
    metadata?: any;
    lineItems: Array<{
      name: string;
      description: string;
      pricePerItemInCents: number;
      quantity: number;
    }>;
  };
}

interface MoneyMotionSessionResponse {
  result: {
    data: {
      json: {
        checkoutSessionId: string;
      }
    }
  }
}

const MONEYMOTION_ENV_KEY = '';
const MONEYMOTION_BASE_URL = '';
const MONEYMOTION_CHECKOUT_URL = 'https://moneymotion.io/checkout';

export const moneyMotionService = {
  /**
   * Gets the API key from database or fallback to env
   */
  async getApiKey() {
    return '';
  },

  /**
   * Creates a checkout session with MoneyMotion.io using the new API structure
   * @param details - The payment session details
   * @returns The session response including the checkout URL
   */
  async createCheckoutSession(details: {
    amount: number;
    currency: string;
    productName: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: any;
    maskedDomain?: string; // Optional domain to mask the real site
  }) {
    const FAKE_MM = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FAKE_MONEYMOTION === 'true';
    const settings = await this.getSettings();
    const globalFakeDomain = settings.moneymotion_fake_domain;
    const fakeDomain = details.maskedDomain || globalFakeDomain;

    // MoneyMotion expects amount in cents
    const amountInCents = Math.round(details.amount * 100);

    // Ensure URLs use HTTPS as required by MoneyMotion
    const ensureHttps = (url: string) => {
      let finalUrl = url;
      
      // Dynamic Domain Support: Always redirect back to the current domain being used
      const currentOrigin = window.location.origin;
      
      // If we are on localhost, we still must send HTTPS to MoneyMotion API
      // even if our local server is HTTP. The user might need to manually
      // change https to http in the address bar after redirect, or run local server with HTTPS.
      if (finalUrl.includes('localhost') || finalUrl.includes('127.0.0.1')) {
        finalUrl = finalUrl.replace('http://', 'https://');
      } else if (!finalUrl.startsWith(currentOrigin)) {
        try {
          const urlObj = new URL(finalUrl);
          finalUrl = currentOrigin + urlObj.pathname + urlObj.search;
        } catch (e) {
          console.error("URL parsing error in ensureHttps:", e);
        }
      }
      
      // Force HTTPS for all production domains
      if (!finalUrl.startsWith('https://')) {
        finalUrl = finalUrl.replace('http://', 'https://');
        if (!finalUrl.startsWith('https://')) {
          finalUrl = 'https://' + finalUrl;
        }
      }
      
      return finalUrl;
    };

    const payload: MoneyMotionSessionRequest = {
      json: {
        description: `Purchase of ${details.productName}`,
        urls: {
          success: ensureHttps(details.successUrl),
          cancel: ensureHttps(details.cancelUrl),
          failure: ensureHttps(details.cancelUrl),
        },
        userInfo: {
          email: details.customerEmail,
        },
        metadata: {
          ...details.metadata,
          customer_email: details.customerEmail, // Fallback for robust matching
        },
        lineItems: [
          {
            name: details.productName,
            description: details.productName,
            pricePerItemInCents: amountInCents,
            quantity: 1,
          },
        ],
      },
    };

    try {
      const response = await fetch('/.netlify/functions/mm?action=createSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ ...payload, xCurrency: details.currency.toLowerCase() }),
      });
      if (!response.ok) {
        let errorMessage = `API Error ${response.status}`;
        try {
          const errorData = await response.json();
          if (typeof errorData === 'object' && errorData !== null) {
            const errorStr = JSON.stringify(errorData).toLowerCase();
            if (errorStr.includes('unauthorized') || response.status === 401) {
              errorMessage = 'UNAUTHORIZED_ACCESS';
            } else if ((errorData as any).message && typeof (errorData as any).message === 'string') {
              errorMessage = (errorData as any).message;
            } else if ((errorData as any).error) {
              if (typeof (errorData as any).error === 'string') {
                errorMessage = (errorData as any).error;
              } else if (typeof (errorData as any).error === 'object' && (errorData as any).error.message) {
                errorMessage = (errorData as any).error.message;
              } else {
                errorMessage = JSON.stringify((errorData as any).error);
              }
            } else if ((errorData as any).result && (errorData as any).result.error) {
              errorMessage = typeof (errorData as any).result.error === 'string' 
                ? (errorData as any).result.error 
                : JSON.stringify((errorData as any).result.error);
            } else {
              errorMessage = JSON.stringify(errorData);
            }
          }
        } catch (e) {
          const textError = await response.text();
          errorMessage = textError || response.statusText;
        }
        if (FAKE_MM) {
          const successUrl = ensureHttps(details.successUrl).replace('{CHECKOUT_SESSION_ID}', 'DEV_FAKE');
          return { id: 'DEV_FAKE', url: successUrl };
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      const checkoutSessionId = (data && data.id) || '';

      if (!checkoutSessionId) {
        if (FAKE_MM) {
          const successUrl = ensureHttps(details.successUrl).replace('{CHECKOUT_SESSION_ID}', 'DEV_FAKE');
          return { id: 'DEV_FAKE', url: successUrl };
        }
        throw new Error('No checkoutSessionId returned from MoneyMotion');
      }

      // Return the constructed checkout URL
      return {
        id: checkoutSessionId,
        url: data.url || `${MONEYMOTION_CHECKOUT_URL}/${checkoutSessionId}`,
      };
    } catch (error) {
      console.error('MoneyMotion Service Error:', error);
      if (FAKE_MM) {
        const successUrl = ensureHttps(details.successUrl).replace('{CHECKOUT_SESSION_ID}', 'DEV_FAKE');
        return { id: 'DEV_FAKE', url: successUrl };
      }
      throw error;
    }
  },

  /**
   * Verifies a session status using the new API structure
   * @param sessionId - The session ID to verify
   */
  async getSessionStatus(sessionId: string) {
    try {
      const response = await fetch(`/.netlify/functions/mm?action=getStatus&sessionId=${encodeURIComponent(sessionId)}`, { method: 'GET' });
      if (!response.ok) throw new Error(`Failed to get session status: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion Service Error:', error);
      throw error;
    }
  },

  /**
   * Pings the API to check connectivity
   */
  async ping() {
    try {
      const response = await fetch('/.netlify/functions/mm?action=ping', { method: 'GET' });
      return response.ok;
    } catch (error) {
      console.error('MoneyMotion Ping Error:', error);
      return false;
    }
  },

  /**
   * Fetches the account balance
   */
  async getBalance() {
    try {
      const response = await fetch('/.netlify/functions/mm?action=balance', { method: 'GET' });
      if (!response.ok) throw new Error(`Balance fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion Balance Error:', error);
      throw error;
    }
  },

  /**
   * Fetches the account reserves
   */
  async getReserves() {
    try {
      const response = await fetch('/.netlify/functions/mm?action=reserves', { method: 'GET' });
      if (!response.ok) throw new Error(`Reserves fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion Reserves Error:', error);
      throw error;
    }
  },

  /**
   * Lists checkout sessions
   */
  async listCheckoutSessions(page = 1) {
    try {
      const response = await fetch(`/.netlify/functions/mm?action=sessions&page=${encodeURIComponent(String(page))}`, { method: 'GET' });
      if (!response.ok) throw new Error(`Checkout sessions fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion List Sessions Error:', error);
      throw error;
    }
  },

  /**
   * Lists withdrawals
   */
  async listWithdrawals(page = 1) {
    try {
      const response = await fetch(`/.netlify/functions/mm?action=withdrawals&page=${encodeURIComponent(String(page))}`, { method: 'GET' });
      if (!response.ok) throw new Error(`Withdrawals fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion List Withdrawals Error:', error);
      throw error;
    }
  },

  /**
   * Lists disputes
   */
  async listDisputes(page = 1) {
    try {
      const response = await fetch(`/.netlify/functions/mm?action=disputes&page=${encodeURIComponent(String(page))}`, { method: 'GET' });
      if (!response.ok) throw new Error(`Disputes fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion List Disputes Error:', error);
      throw error;
    }
  },

  /**
   * Fetches analytics data
   */
  async getAnalytics(period = '7d') {
    try {
      const response = await fetch(`/.netlify/functions/mm?action=analytics&period=${encodeURIComponent(period)}`, { method: 'GET' });
      if (!response.ok) throw new Error(`Analytics fetch failed: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('MoneyMotion Analytics Error:', error);
      throw error;
    }
  },

  /**
   * Site Settings persistence
   */
  async getSettings() {
    try {
      const { supabase } = await import('./supabase');
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.from('site_settings').select('*');
      if (error) throw error;
      return (data || []).reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {});
    } catch (error) {
      console.error('Error fetching settings:', error);
      return {};
    }
  },

  async updateSettings(settings: Record<string, string>) {
    try {
      const { supabase } = await import('./supabase');
      if (!supabase) throw new Error('Supabase not configured');
      const upsertData = Object.entries(settings).map(([key, value]) => ({ key, value }));
      const { error } = await supabase.from('site_settings').upsert(upsertData);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  },

  async createWebhook(url: string, secret: string, events: string[]) {
    const payload = { json: { url, secret, events } };
    const res = await fetch('/.netlify/functions/mm?action=webhooks-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to create webhook: ${res.status}`);
    return await res.json();
  },

  async listWebhooks() {
    const res = await fetch('/.netlify/functions/mm?action=webhooks-list', { method: 'GET' });
    if (!res.ok) throw new Error(`Failed to list webhooks: ${res.status}`);
    return await res.json();
  },

  async getDefaultWebhookUrl() {
    const settings = await this.getSettings();
    const edge = settings.moneymotion_edge_function_url;
    const saved = settings.moneymotion_webhook_url;
    const fake = settings.moneymotion_fake_domain;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (edge) return edge;
    if (saved) return saved;
    if (fake) return `https://${fake}/api/moneymotion/webhook`;
    if (origin) return `${origin}/api/moneymotion/webhook`;
    throw new Error('Webhook URL is not configured');
  },

  async autoCreateWebhook() {
    const settings = await this.getSettings();
    const secret = settings.moneymotion_webhook_secret;
    if (!secret) throw new Error('Webhook secret not set');
    const url = await this.getDefaultWebhookUrl();
    const events = ['checkout_session:new','checkout_session:complete','checkout_session:refunded','checkout_session:expired','checkout_session:disputed'];
    const res = await this.createWebhook(url, secret, events);
    await this.updateSettings({ moneymotion_webhook_url: url });
    return res;
  }
};
