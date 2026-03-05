import { supabase, supabaseAdmin } from './supabase';

export interface VisitorLog {
  id: string;
  ip_address: string;
  country?: string;
  city?: string;
  user_agent?: string;
  visited_at: string;
  page_url?: string;
}

export interface BlockedLog {
  id: string;
  ip_address: string;
  country?: string;
  city?: string;
  reason?: string;
  user_agent?: string;
  attempted_url?: string;
  blocked_at: string;
}

export interface BannedCountry {
  id: string;
  country_name: string;
  created_at: string;
}

export interface BannedIp {
  id: string;
  ip_address: string;
  reason?: string;
  created_at: string;
}

export interface HardBannedIp {
  id: string;
  ip_address: string;
  reason?: string;
  created_at: string;
}
export interface BannedCustomer {
  id: string;
  identifier: string;
  type: 'email' | 'phone';
  reason?: string;
  created_at: string;
}

const fetchWithTimeout = async (resource: string, options: RequestInit & { timeout?: number } = {}) => {
  const { timeout = 5000, ...rest } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      cache: (rest as any).cache ?? 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', ...(rest.headers || {}) },
      ...rest,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const trafficService = {
  async getBannedCountries(): Promise<BannedCountry[]> {
      try {
          const res = await fetch('/.netlify/functions/sb?action=banned-countries:list', { method: 'GET' });
          if (!res.ok) throw new Error('Failed to list banned countries');
          const data = await res.json();
          return data || [];
      } catch (e) {
          if (!supabase) return [];
          const { data, error } = await supabase
            .from('banned_countries')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) return [];
          return data || [];
      }
  },

  async addBannedCountry(countryName: string): Promise<void> {
      try {
          const res = await fetch('/.netlify/functions/sb?action=banned-countries:add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ countryName })
          });
          if (!res.ok) throw new Error('netlify_failed');
      } catch {
          if (!supabase) throw new Error('Supabase not configured');
          const { error } = await supabase.from('banned_countries').insert({ country_name: countryName });
          if (error) throw error;
      }
  },

  async removeBannedCountry(id: string): Promise<void> {
      try {
          const res = await fetch('/.netlify/functions/sb?action=banned-countries:remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
          });
          if (!res.ok) throw new Error('netlify_failed');
      } catch {
          if (!supabase) throw new Error('Supabase not configured');
          const { error } = await supabase.from('banned_countries').delete().eq('id', id);
          if (error) throw error;
      }
  },

  async logVisit(): Promise<void> {
    try {
      const disableLogs = (import.meta as any)?.env?.VITE_DISABLE_TRAFFIC_LOGS === 'true';
      if (disableLogs) return;
      const sessionKey = 'visitor_logged';
      if (sessionStorage.getItem(sessionKey)) {
        return;
      }

      const ipData = await this.getIpData();
      if (!ipData.ip) return;

      if (!supabase) return;

      const { error } = await supabase
        .from('visitor_logs')
        .insert({
          ip_address: ipData.ip,
          country: ipData.country_name,
          city: ipData.city,
          user_agent: navigator.userAgent,
          page_url: window.location.href
        });

      if (error) {
        console.error('Error logging visit:', error);
      } else {
        sessionStorage.setItem(sessionKey, 'true');
      }

    } catch (err) {
      console.error('Traffic logging error:', err);
    }
  },

  async logBlockedAttempt(data: { ip: string, country?: string, city?: string, reason: string, user_agent?: string, attempted_url?: string }): Promise<void> {
      const disableLogs = (import.meta as any)?.env?.VITE_DISABLE_TRAFFIC_LOGS === 'true';
      if (disableLogs) return;
      if (!supabase) return;
      try {
          // Check if we recently logged this block to avoid spamming the DB (e.g. strict react re-renders)
          const sessionKey = `blocked_logged_${data.reason}`;
          if (sessionStorage.getItem(sessionKey)) return;

          const { error } = await supabase.from('blocked_logs').insert({
              ip_address: data.ip,
              country: data.country,
              city: data.city,
              reason: data.reason,
              user_agent: data.user_agent || navigator.userAgent,
              attempted_url: data.attempted_url || window.location.href
          });

          if (error) console.error('Error logging blocked attempt:', error);
          else sessionStorage.setItem(sessionKey, 'true');
      } catch (err) {
          console.error('Failed to log blocked attempt:', err);
      }
  },

  async getBlockedLogs(page: number = 1, pageSize: number = 50): Promise<{ data: BlockedLog[], total: number }> {
      if (!supabase) return { data: [], total: 0 };
      
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
          .from('blocked_logs')
          .select('*', { count: 'exact' })
          .order('blocked_at', { ascending: false })
          .range(from, to);
      
      if (error) {
          console.error('Error fetching blocked logs:', error);
          throw error;
      }
      return { data: data || [], total: count || 0 };
  },
  async getLatestVpnCountriesForIps(ips: string[]): Promise<Record<string, string>> {
    if (!supabase) return {};
    const list = Array.from(new Set((ips || []).filter(Boolean)));
    if (list.length === 0) return {};
    const { data, error } = await supabase
      .from('blocked_logs')
      .select('ip_address,country,blocked_at,reason')
      .in('ip_address', list)
      .order('blocked_at', { ascending: false });
    if (error) return {};
    const out: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      const r = ((row.reason || '') as string).toLowerCase();
      if (!r.includes('vpn')) return;
      const ip = row.ip_address as string;
      if (ip && !out[ip]) {
        out[ip] = (row.country || '') as string;
      }
    });
    return out;
  },
  
  async deleteBlockedLogs(ids: string[]): Promise<void> {
      const client = supabaseAdmin || supabase;
      if (!client) return;
      const { error } = await client.from('blocked_logs').delete().in('id', ids);
      if (error) throw error;
  },

  async getWebRTCIP(): Promise<string | undefined> {
    try {
        const rtc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        let ip: string | undefined;
        
        rtc.createDataChannel('');
        rtc.createOffer().then(o => rtc.setLocalDescription(o));
        
        return new Promise((resolve) => {
            rtc.onicecandidate = (e) => {
                if (!e.candidate) return;
                const ipMatch = e.candidate.candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
                if (ipMatch) {
                    const candidateIP = ipMatch[1];
                    // Ignore private IPs
                    if (!candidateIP.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/)) {
                        ip = candidateIP;
                        resolve(ip);
                        rtc.close();
                    }
                }
            };
            setTimeout(() => {
                resolve(ip); // Resolve with whatever we found (or undefined)
                try { rtc.close(); } catch(e){}
            }, 1000); // 1s timeout
        });
    } catch (e) {
        return undefined;
    }
  },

  // Deep Fingerprinting: Canvas
  async getCanvasFingerprint(): Promise<string> {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';
        
        canvas.width = 200;
        canvas.height = 50;
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125,1,62,20);
        ctx.fillStyle = "#069";
        ctx.fillText("VPN-Detection-Fingerprint-123!@#", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("VPN-Detection-Fingerprint-123!@#", 4, 17);
        
        return canvas.toDataURL();
    } catch (e) {
        return 'error';
    }
  },

  // Deep Fingerprinting: Audio
  async getAudioFingerprint(): Promise<number> {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return 0;
        
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gain = context.createGain();
        
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);
        
        gain.gain.setValueAtTime(0, context.currentTime);
        oscillator.connect(analyser);
        analyser.connect(gain);
        gain.connect(context.destination);
        
        oscillator.start(0);
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        oscillator.stop();
        
        return data.reduce((a, b) => a + b, 0);
    } catch (e) {
        return 0;
    }
  },

  // Automation Detection
  detectAutomation(): { isAutomated: boolean; factors: string[] } {
    const factors: string[] = [];
    const nav = navigator as any;
    
    if (nav.webdriver) factors.push('WebDriver Detected');
    if (nav.plugins.length === 0) factors.push('No Plugins (Headless?)');
    if (nav.languages.length === 0) factors.push('No Languages');
    if ((window as any).domAutomation || (window as any).domAutomationController) factors.push('DOM Automation Detected');
    if (nav.userAgent.includes('HeadlessChrome')) factors.push('Headless Chrome');
    
    // Check for common automation properties
    const automationProps = ['__webdriver_evaluate', '__selenium_evaluate', '__webdriver_script_fn', '__webdriver_script_func', '__webdriver_script_function', '__webdriver_unwrapped', '__selenium_unwrapped', '__webdriver_driver_unwrap', '__webdriver_driver_unwrapped'];
    automationProps.forEach(prop => {
        if (prop in document || prop in window) factors.push(`Automation Prop: ${prop}`);
    });

    return {
        isAutomated: factors.length > 0,
        factors
    };
  },

  async getIpData() {
      let ipData = { 
          ip: '', 
          country_name: '', 
          city: '', 
          is_vpn: false, 
          country_code: '', 
          isp: '',
          asn: '',
          vpn_reason: '',
          risk_score: 0,
          risk_factors: [] as string[]
      };
      
      try {
        // Start parallel checks
        const webRTCIPPromise = this.getWebRTCIP();
        const canvasFingerprintPromise = this.getCanvasFingerprint();
        const audioFingerprintPromise = this.getAudioFingerprint();
        const automationCheck = this.detectAutomation();

        // Initialize FingerprintJS
        let fpPromise = Promise.resolve(null as any);
        try {
            const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
            fpPromise = FingerprintJS.load().then(fp => fp.get());
        } catch (e) {
            console.error('FingerprintJS load failed', e);
        }

        if (automationCheck.isAutomated) {
            ipData.risk_score += 40;
            ipData.risk_factors.push(...automationCheck.factors.map(f => `Automation: ${f} (+40)`));
        }

        // 1. Primary Source: Use reliable HTTPS providers that support CORS
        let detectedIp = '';
        // External IP providers removed as per user request to avoid console errors
        
        if (!detectedIp) {
             // Fallback removed
        }

        // 2. Geo & Security Data: Use reliable HTTPS providers only
        let data: any = null;
        // Geo providers removed as per user request to avoid console errors
        const geoPromises: Promise<any>[] = [];
        
        const geoSettled = await Promise.allSettled(geoPromises);
        for (const s of geoSettled) {
            if (s.status !== 'fulfilled') continue;
            const resData = s.value;
            
            // Normalize data from different providers
            if (resData && resData.success) { // ipwho.is style
                data = resData;
                break;
            }
            if (resData && resData.ipVersion && resData.cityName) { // freeipapi style
                 data = {
                    success: true,
                    ip: resData.ipAddress,
                    country: resData.countryName,
                    country_code: resData.countryCode,
                    city: resData.cityName,
                    connection: { isp: resData.ipAddress }, // freeipapi doesn't give ISP name often
                    security: { proxy: resData.isProxy }
                };
                break;
            }
        }

        // Incorporate FingerprintJS result
        try {
            const fpResult = await fpPromise;
            if (fpResult && fpResult.visitorId) {
                // We could use visitorId for tracking unique bans even if IP changes
                // For now, we just check confidence
                if (fpResult.confidence && fpResult.confidence.score < 0.4) {
                     ipData.risk_score += 15;
                     ipData.risk_factors.push('Low Browser Integrity (+15)');
                }
            }
        } catch (e) {}

        if (data && data.success) {
            let riskScore = 0;
            let riskFactors: string[] = [];
            
            // Re-use detected IP if available and API didn't provide one
            if (!data.ip && detectedIp) data.ip = detectedIp;
            if (!data.ip) data.ip = 'Unknown';

            // Security flags from API
            const isApiVpn = data.security?.vpn || data.security?.proxy || data.security?.tor || data.security?.relay;
            
            // ISP checks
            const isp = (data.connection?.isp || data.connection?.org || '').toLowerCase();
            const suspiciousISPs = [
                'hosting',
                'google',
                'amazon',
                'azure',
                'digitalocean',
                'cloudflare',
                'm247',
                'ovh',
                'vultr',
                'akamai',
                'fastly',
                'nordvpn',
                'expressvpn',
                'surfshark',
                'proton',
                'cyberghost',
                'pia',
                'private internet access',
                'hidemyass',
                'browsec',
                'vpn'
            ];
            const isSuspiciousISP = suspiciousISPs.some(s => isp.includes(s));
            
            if (isSuspiciousISP) {
                riskScore += 25;
                riskFactors.push('Data Center ISP (+25)');
            }

            // --- 1. WebRTC Anomaly (+40) ---
            const webRTCIP = await webRTCIPPromise;
            const isDataIPv6 = data.ip.includes(':');
            const isWebRTCIPv6 = webRTCIP && webRTCIP.includes(':');
            
            if (webRTCIP && isDataIPv6 === isWebRTCIPv6 && webRTCIP !== data.ip && data.ip !== 'Unknown') {
                riskScore += 40;
                riskFactors.push('WebRTC Anomaly (+40)');
            }

            // --- 2. Header Anomaly (+30) ---
            let headerAnomaly = false;
            if (navigator.webdriver) headerAnomaly = true;
            const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
            const ua = navigator.userAgent || '';
            if (platform.toLowerCase().includes('linux') && ua.includes('Windows')) headerAnomaly = true;
            if (platform.toLowerCase().includes('mac') && ua.includes('Windows')) headerAnomaly = true;
            if (platform.toLowerCase().includes('win') && !ua.includes('Windows')) headerAnomaly = true;

            if (headerAnomaly) {
                riskScore += 30;
                riskFactors.push('Header Anomaly (+30)');
            }

            // --- 2.1 Language Mismatch (+20) ---
            const arabCountries = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'LB', 'IQ', 'YE', 'SY', 'PS', 'DZ', 'MA', 'TN', 'LY', 'SD'];
            const browserLangs = navigator.languages || [navigator.language];
            const hasArabic = browserLangs.some(l => l.toLowerCase().startsWith('ar'));
            const isArabCountry = arabCountries.includes(data.country_code);

            if (!isArabCountry && hasArabic) {
                riskScore += 20;
                riskFactors.push('Language Mismatch (+20)');
            }

            // --- 3. Screen/Window Anomaly (+25) ---
            let screenAnomaly = false;
            if (window.innerHeight > window.screen.height) screenAnomaly = true;
            if (window.innerWidth > window.screen.width) screenAnomaly = true;
            if (window.screen.width === 0 || window.screen.height === 0) screenAnomaly = true;
            
            // --- Deep Fingerprinting Anomalies ---
            const canvasFP = await canvasFingerprintPromise;
            const audioFP = await audioFingerprintPromise;
            
            // Basic check: If canvas or audio fails completely or returns static error
            if (canvasFP === 'error' || canvasFP === 'no-canvas') {
                riskScore += 15;
                riskFactors.push('Canvas Fingerprint Blocked (+15)');
            }
            if (audioFP === 0) {
                riskScore += 10;
                riskFactors.push('Audio Stack Virtualized/Blocked (+10)');
            }

            if (screenAnomaly) {
                riskScore += 25;
                riskFactors.push('Screen Anomaly (+25)');
            }

            // --- 4. Timing/Fingerprint (+25) ---
            let timingAnomaly = false;
            try {
                if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC') {
                    // Check if it's really UTC or just a fallback
                    const date = new Date();
                    const offset = date.getTimezoneOffset();
                    if (offset !== 0) timingAnomaly = true;
                }
                
                // Compare with API timezone if available
                if (data.timezone && data.timezone.id) {
                    const apiTz = data.timezone.id;
                    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    if (apiTz !== browserTz) {
                        // Some TZs are equivalent, this is a weak check but adds to score
                        riskScore += 15;
                        riskFactors.push('Timezone Name Mismatch (+15)');
                    }
                }
            } catch (e) {
                timingAnomaly = true;
            }

            if (timingAnomaly) {
                riskScore += 25;
                riskFactors.push('Timing/Environment Fingerprint (+25)');
            }

            // --- 5. Timezone Mismatch (+20) ---
            let isTimezoneMismatch = false;
            if (data.timezone && data.timezone.offset !== undefined) {
                const browserOffsetSeconds = new Date().getTimezoneOffset() * -60;
                const ipOffsetSeconds = data.timezone.offset;
                if (Math.abs(browserOffsetSeconds - ipOffsetSeconds) > 3600) {
                    isTimezoneMismatch = true;
                }
            }

            if (isTimezoneMismatch) {
                riskScore += 20;
                riskFactors.push('Timezone Offset Mismatch (+20)');
            }

            // --- 6. Hardware Anomaly (+20) ---
            let hardwareAnomaly = false;
            try {
                if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 2) hardwareAnomaly = true;
                if ((navigator as any).deviceMemory && (navigator as any).deviceMemory < 2) hardwareAnomaly = true;
            } catch (e) {}

            if (hardwareAnomaly) {
                riskScore += 20;
                riskFactors.push('Hardware Anomaly (+20)');
            }

            const isVpnScore = riskScore >= 35;
            const legacyVpnReason = riskFactors.join(' | ');
            const isVpnFinal = isApiVpn || (isSuspiciousISP && riskScore >= 25) || isVpnScore;
            const asnRaw = (data.connection?.asn ?? (data.as ?? ''));
            let asnNorm = '';
            const asnStr = String(asnRaw || '');
            if (/^\d+$/.test(asnStr)) {
                asnNorm = `AS${asnStr}`;
            } else {
                const m = asnStr.toUpperCase().match(/AS\d+/);
                if (m) asnNorm = m[0];
            }

            ipData = {
                ip: data.ip,
                country_name: data.country || 'Unknown',
                city: data.city || 'Unknown',
                country_code: data.country_code || '??',
                is_vpn: isVpnFinal, 
                vpn_reason: legacyVpnReason || (isApiVpn ? 'API Detected' : (isSuspiciousISP ? 'Suspicious ISP' : '')),
                risk_score: riskScore,
                risk_factors: riskFactors,
                isp,
                asn: asnNorm
            };
            
            return ipData;
        }
        
        // Final Fallback: if we have detectedIp but no Geo, try historical DB lookup
        if (detectedIp) {
            ipData.ip = detectedIp;
            ipData.country_name = 'Unknown';
            ipData.city = 'Unknown';
            try {
              if (supabase) {
                const { data: prev } = await supabase
                  .from('blocked_logs')
                  .select('country, city, blocked_at')
                  .eq('ip_address', detectedIp)
                  .order('blocked_at', { ascending: false })
                  .limit(1);
                const row = Array.isArray(prev) ? prev[0] : null;
                if (row && (row.country || row.city)) {
                  ipData.country_name = row.country || 'Unknown';
                  ipData.city = row.city || 'Unknown';
                } else {
                  const { data: visits } = await supabase
                    .from('visitor_logs')
                    .select('country, city, visited_at')
                    .eq('ip_address', detectedIp)
                    .order('visited_at', { ascending: false })
                    .limit(1);
                  const vrow = Array.isArray(visits) ? visits[0] : null;
                  if (vrow && (vrow.country || vrow.city)) {
                    ipData.country_name = vrow.country || 'Unknown';
                    ipData.city = vrow.city || 'Unknown';
                  }
                }
              }
            } catch (e) {}
        }
      } catch (e) {
          console.error('Geo-IP detection failed:', e);
      }
      return ipData;
  },

  async checkAccess(): Promise<{ allowed: boolean; country?: string; reason?: string; message?: string }> {
    try {
      const cacheKey = 'security_ban_cache';
      let prevCache: any = null;
      try {
        const c0 = localStorage.getItem(cacheKey);
        if (c0) prevCache = JSON.parse(c0);
      } catch {}
      const disable = (import.meta as any)?.env?.VITE_DISABLE_SECURITY === 'true';
      const disableFunctions = (import.meta as any)?.env?.VITE_DISABLE_FUNCTIONS === 'true';
      const env = (import.meta as any)?.env || {};
      const useLocalSecurity = env?.VITE_SECURITY_LOCAL === 'true';
      const envSecurityEnabled = String(env?.VITE_SECURITY_ENABLED ?? 'true') !== 'false';
      const envBlockVpn = String(env?.VITE_BLOCK_VPN ?? 'false') === 'true';
      const envBlockStrictVpn = String(env?.VITE_BLOCK_STRICT_VPN ?? 'false') === 'true';
      const envBlockAdvanced = String(env?.VITE_BLOCK_ADVANCED_PROTECTION ?? 'false') === 'true';
      const envAdvancedThreshold = Math.max(0, Math.min(100, parseInt(String(env?.VITE_BLOCK_ADVANCED_THRESHOLD ?? '50'), 10) || 50));
      const envBlockTimezoneMismatch = String(env?.VITE_BLOCK_TIMEZONE_MISMATCH ?? 'false') === 'true';
      const envBannedCountries = String(env?.VITE_BANNED_COUNTRIES ?? '').split(/[,\|]/).map((s: string) => s.trim()).filter(Boolean);
      const envBannedCountryCodes = String(env?.VITE_BANNED_COUNTRY_CODES ?? '').split(/[,\|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      const envBannedAsns = String(env?.VITE_BANNED_ASNS ?? '').split(/[,\|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      const envBannedIspKeywords = String(env?.VITE_BANNED_ISP_KEYWORDS ?? '').split(/[,\|]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
      const vpnMsgEnv = String(env?.VITE_VPN_BAN_MESSAGE ?? '');
      const geoMsgEnv = String(env?.VITE_GEO_BAN_MESSAGE ?? '');
      const ipMsgEnv = String(env?.VITE_IP_BAN_MESSAGE ?? '');
      const advMsgEnv = String(env?.VITE_ADVANCED_BAN_MESSAGE ?? '');
      const envAutoBanOnVpn = String(env?.VITE_AUTO_BAN_ON_VPN ?? 'false') === 'true';
      const envForceBlockOnGeoFailure = String(env?.VITE_FORCE_BLOCK_ON_GEO_FAILURE ?? 'false') === 'true';
      if (disable) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ reason: 'disabled', setAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 }));
        } catch {}
        return { allowed: true };
      }
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        let settingsLocalFlag = false;
        if (supabase) {
          try {
            const { data } = await supabase.from('site_settings').select('value').eq('key', 'security_local').limit(1);
            settingsLocalFlag = !!(data && data[0] && String(data[0].value) === 'true');
          } catch {}
        }
        if (!useLocalSecurity && !settingsLocalFlag) return { allowed: true };
      }
      const hasSupabase = !!supabase;
      const ipData = await this.getIpData();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ip: ipData.ip, country: ipData.country_name, risk_score: ipData.risk_score, setAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000 }));
      } catch {}
      {
        let blocked = false;
        let blockedReason: string | undefined;
        let message: string | undefined;
        // Load settings from DB and prefer them over environment when available
        let settingsMap: Record<string, string> = {};
        try {
          const keys = [
            'security_enabled',
            'security_local',
            'block_vpn',
            'block_strict_vpn',
            'block_timezone_mismatch',
            'block_advanced_protection',
            'block_advanced_threshold',
            'blocked_asns',
            'blocked_isp_keywords',
            'auto_ban_on_vpn',
            'vpn_ban_message',
            'geo_ban_message',
            'ip_ban_message',
            'advanced_ban_message'
          ];
          if (hasSupabase) {
            const { data: sData } = await supabase!.from('site_settings').select('key,value').in('key', keys);
            (sData || []).forEach((row: any) => { settingsMap[row.key] = row.value; });
          }
        } catch {}
        const settingsSecurityEnabled = String(settingsMap['security_enabled'] ?? '') !== 'false';
        const settingsLocal = String(settingsMap['security_local'] ?? '') === 'true';
        const blockVpn = (settingsMap['block_vpn'] ?? '') !== '' ? String(settingsMap['block_vpn']) === 'true' : envBlockVpn;
        const blockStrictVpn = (settingsMap['block_strict_vpn'] ?? '') !== '' ? String(settingsMap['block_strict_vpn']) === 'true' : envBlockStrictVpn;
        const blockAdvanced = (settingsMap['block_advanced_protection'] ?? '') !== '' ? String(settingsMap['block_advanced_protection']) === 'true' : envBlockAdvanced;
        const blockTimezoneMismatch = (settingsMap['block_timezone_mismatch'] ?? '') !== '' ? String(settingsMap['block_timezone_mismatch']) === 'true' : envBlockTimezoneMismatch;
        const autoBanOnVpn = (settingsMap['auto_ban_on_vpn'] ?? '') !== '' ? String(settingsMap['auto_ban_on_vpn']) === 'true' : envAutoBanOnVpn;
        const advancedThreshold = (() => {
          const v = settingsMap['block_advanced_threshold'];
          const n = parseInt(String(v ?? envAdvancedThreshold), 10);
          return Math.max(0, Math.min(100, isNaN(n) ? envAdvancedThreshold : n));
        })();
        const vpnMsg = (settingsMap['vpn_ban_message'] ?? '') || vpnMsgEnv;
        const geoMsg = (settingsMap['geo_ban_message'] ?? '') || geoMsgEnv;
        const ipMsg = (settingsMap['ip_ban_message'] ?? '') || ipMsgEnv;
        const advMsg = (settingsMap['advanced_ban_message'] ?? '') || advMsgEnv;

        // If admin disabled security globally, allow
        if (!settingsSecurityEnabled && !envSecurityEnabled) {
          return { allowed: true, country: ipData.country_name, reason: 'security_disabled' };
        }
        const localMode = useLocalSecurity || settingsLocal;
        const ip = ipData.ip;
        if (ip && hasSupabase) {
          const { data: ipBan } = await supabase!.from('banned_ips').select('id').eq('ip_address', ip).limit(1);
          const { data: hardIpBan } = await supabase!.from('hard_banned_ips').select('id').eq('ip_address', ip).limit(1);
          if ((ipBan && ipBan.length > 0) || (hardIpBan && hardIpBan.length > 0)) {
            blocked = true;
            blockedReason = 'ip_banned';
            message = ipMsg || message;
          }
          if (!blocked && ipData.country_name) {
            const { data: cBan } = await supabase!.from('banned_countries').select('id').eq('country_name', ipData.country_name).limit(1);
            if (cBan && cBan.length > 0) {
              blocked = true;
              blockedReason = 'country_banned';
              message = geoMsg || message;
            }
          }
        }
        if (!blocked && ipData.country_name) {
          const name = (ipData.country_name || '').toLowerCase();
          const code = String((ipData as any).country_code || '').toUpperCase();
          if ((envBannedCountries.length && envBannedCountries.some(c => c.toLowerCase() === name)) ||
              (envBannedCountryCodes.length && envBannedCountryCodes.includes(code))) {
            blocked = true;
            blockedReason = 'country_banned_env';
            message = geoMsg || message;
          }
        }
        if (!blocked) {
          const geoFailed = (!ipData.country_name || ipData.country_name === 'Unknown') && (!ipData.city || ipData.city === 'Unknown');
          if (envForceBlockOnGeoFailure && geoFailed && (envBlockVpn || envBlockStrictVpn)) {
            blocked = true;
            blockedReason = 'geo_failure_strict';
            message = vpnMsg || message;
          }
        }
        if (!blocked) {
          const settingsAsns = String(settingsMap['blocked_asns'] ?? '').split(/[,\|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
          const settingsIspKeywords = String(settingsMap['blocked_isp_keywords'] ?? '').split(/[,\|]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
          const allAsns = [...new Set([...envBannedAsns, ...settingsAsns])];
          const allIspKeywords = [...new Set([...envBannedIspKeywords, ...settingsIspKeywords])];
          const asn = String((ipData as any).asn || '').toUpperCase();
          const isp = String((ipData as any).isp || '').toLowerCase();
          if (asn && allAsns.length && allAsns.some(a => a === asn || a === asn.replace(/^AS/, ''))) {
            blocked = true;
            blockedReason = 'asn_banned';
            message = vpnMsg || message;
          } else if (isp && allIspKeywords.length && allIspKeywords.some(k => isp.includes(k))) {
            blocked = true;
            blockedReason = 'isp_banned';
            message = vpnMsg || message;
          }
        }
        if (!blocked && (settingsSecurityEnabled || envSecurityEnabled)) {
          const hasTimezoneFactor = Array.isArray(ipData.risk_factors) && ipData.risk_factors.some((f: string) => f.toLowerCase().includes('timezone'));
          if (blockAdvanced && (ipData.risk_score || 0) >= advancedThreshold) {
            blocked = true;
            blockedReason = 'advanced_protection';
            message = advMsg || message;
          } else if (blockVpn && (ipData.is_vpn || (ipData.risk_score || 0) >= 40)) {
            blocked = true;
            blockedReason = 'vpn_detected';
            message = vpnMsg || message;
          } else if (blockTimezoneMismatch && hasTimezoneFactor) {
            blocked = true;
            blockedReason = 'timezone_mismatch';
            message = geoMsg || message;
          }
        }
        if (blocked) {
          if (hasSupabase) {
            await this.logBlockedAttempt({ ip, country: ipData.country_name, city: ipData.city, reason: blockedReason || 'blocked', user_agent: navigator.userAgent, attempted_url: window.location.href });
            if (blockedReason === 'vpn_detected' && autoBanOnVpn) {
              try {
                const { data: exists } = await supabase!.from('banned_ips').select('id').eq('ip_address', ip).limit(1);
                if (!exists || exists.length === 0) {
                  await supabase!.from('banned_ips').insert({ ip_address: ip, reason: 'VPN/Proxy Detected' });
                }
              } catch {}
            }
          }
          return { allowed: false, country: ipData.country_name, reason: blockedReason, message };
        }
        if (disableFunctions || useLocalSecurity) {
          return { allowed: true, country: ipData.country_name };
        }
      }
      if (hasSupabase) {
        // Server-side check disabled to prevent network errors
        return { allowed: true, country: ipData.country_name };
      }
      return { allowed: true, country: ipData.country_name };
    } catch (err) {
      console.error('Access check error:', err);
      return { allowed: true, reason: 'error' };
    }
  },

  async getVisits(
    period: 'today' | 'last2days' | 'last3days' | 'lastMonth' | 'custom' | 'all_time',
    startDate?: Date,
    endDate?: Date,
    searchQuery?: string,
    country?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: VisitorLog[]; total: number }> {
    if (!supabase) return { data: [], total: 0 };

    let query = supabase
      .from('visitor_logs')
      .select('*', { count: 'exact' });

    const now = new Date();
    
    if (period === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      query = query.gte('visited_at', startOfDay);
    } else if (period === 'last2days') {
      const twoDaysAgo = new Date(now.setDate(now.getDate() - 2)).toISOString();
      query = query.gte('visited_at', twoDaysAgo);
    } else if (period === 'last3days') {
      const threeDaysAgo = new Date(now.setDate(now.getDate() - 3)).toISOString();
      query = query.gte('visited_at', threeDaysAgo);
    } else if (period === 'lastMonth') {
      const lastMonth = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      query = query.gte('visited_at', lastMonth);
    } else if (period === 'custom' && startDate && endDate) {
      query = query.gte('visited_at', startDate.toISOString()).lte('visited_at', endDate.toISOString());
    }
    // 'all_time' requires no filters, so we just fall through

    // Search Filter
    if (searchQuery) {
        query = query.or(`ip_address.ilike.%${searchQuery}%,country.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,page_url.ilike.%${searchQuery}%`);
    }

    // Country Filter
    if (country) {
        query = query.eq('country', country);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    query = query.order('visited_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
        console.error('Error fetching visits:', error);
        throw error;
    }
    return { data: data || [], total: count || 0 };
  },

  async deleteVisitorLogs(ids: string[]): Promise<number> {
    const client = supabaseAdmin || supabase;
    console.log('deleteVisitorLogs: Attempting to delete', ids.length, 'logs');
    console.log('deleteVisitorLogs: Using admin client?', !!supabaseAdmin);
    
    if (!client || ids.length === 0) {
        console.log('deleteVisitorLogs: No client or no IDs');
        return 0;
    }
    
    const { data, error } = await client
      .from('visitor_logs')
      .delete()
      .in('id', ids)
      .select();
    
    if (error) {
      console.error('Error deleting visitor logs:', error);
      throw error;
    }
    
    console.log('deleteVisitorLogs: Deleted count:', data?.length);
    return data ? data.length : 0;
  },

  async getUniqueCountries(): Promise<string[]> {
      try {
          const res = await fetch('/.netlify/functions/sb?action=visitor:get-unique-countries', { method: 'GET' });
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
      } catch {
          if (!supabase) return [];
          const { data, error } = await supabase.from('visitor_logs').select('country').not('country', 'is', null);
          if (error) return [];
          const uniques = Array.from(new Set((data || []).map((r: any) => r.country).filter(Boolean)));
          return uniques;
      }
  },


  async banCountry(countryName: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('banned_countries').insert({ country_name: countryName });
    if (error) throw error;
  },

  async unbanCountry(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('banned_countries').delete().eq('id', id);
    if (error) throw error;
  },

  async getBannedIps(): Promise<BannedIp[]> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=banned-ips:list', { method: 'GET' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        throw new Error('not_json');
      }
      return await res.json();
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('banned_ips')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },
  async getHardBannedIps(): Promise<HardBannedIp[]> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=hard-banned-ips:list', { method: 'GET' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        throw new Error('not_json');
      }
      return await res.json();
    } catch {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('hard_banned_ips')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    }
  },

  async banIp(ip: string, reason?: string): Promise<void> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=banned-ips:add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason })
      });
      if (!res.ok) throw new Error('netlify_failed');
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data } = await supabase.from('banned_ips').select('id').eq('ip_address', ip).limit(1);
      if (data && data.length > 0) return;
      const { error } = await supabase.from('banned_ips').insert({ ip_address: ip, reason });
      if (error) throw error;
    }
  },
  async addHardBanIp(ip: string, reason?: string): Promise<void> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=hard-banned-ips:add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason })
      });
      if (!res.ok) throw new Error('netlify_failed');
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { data } = await supabase.from('hard_banned_ips').select('id').eq('ip_address', ip).limit(1);
      if (data && data.length > 0) return;
      const { error } = await supabase.from('hard_banned_ips').insert({ ip_address: ip, reason });
      if (error) throw error;
    }
  },

  async unbanIp(id: string): Promise<void> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=banned-ips:remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('netlify_failed');
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('banned_ips').delete().eq('id', id);
      if (error) throw error;
    }
  },
  async removeHardBanIp(id: string): Promise<void> {
    try {
      const res = await fetch('/.netlify/functions/sb?action=hard-banned-ips:remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('netlify_failed');
    } catch {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('hard_banned_ips').delete().eq('id', id);
      if (error) throw error;
    }
  },

  async checkCustomerBan(email: string, phone: string): Promise<{ banned: boolean; message?: string }> {
    if (!supabase) return { banned: false };
    
    // Build conditions dynamically to avoid matching empty strings
    const conditions: string[] = [];
    
    if (email && email.trim() !== '') {
        conditions.push(`identifier.eq.${email}`);
    }
    
    // Only check phone if it's provided and not just country code or too short
    if (phone && phone.replace(/\D/g, '').length > 5) {
        conditions.push(`identifier.eq.${phone}`);
    }
    
    // If no valid identifiers to check, return not banned
    if (conditions.length === 0) {
        return { banned: false };
    }
    
    // Check if either email or phone exists in banned_customers
    const { data, error } = await supabase
      .from('banned_customers')
      .select('id')
      .or(conditions.join(','))
      .limit(1);
      
    if (error) {
      console.error('Error checking customer ban:', error);
      return { banned: false };
    }
    
    if (data && data.length > 0) {
        const { data: settings } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'customer_ban_message')
            .single();
            
        return { banned: true, message: settings?.value };
    }

    return { banned: false };
  },

  async getBannedCustomers(): Promise<BannedCustomer[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('banned_customers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async banCustomer(identifier: string, type: 'email' | 'phone', reason?: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('banned_customers').insert({ identifier, type, reason });
    if (error) throw error;
  },

  async unbanCustomer(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('banned_customers').delete().eq('id', id);
    if (error) throw error;
  }
};
