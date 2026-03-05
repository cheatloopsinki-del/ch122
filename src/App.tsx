import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import { ProductsGrid } from './components/ProductsGrid';
import Footer from './components/Footer';
import { AnimatedBackground } from './components/AnimatedBackground';
// MagicCursor معطّل مؤقتاً لإظهار المؤشر الرسمي
const WinningPhotosPage = React.lazy(() => import('./components/WinningPhotosPage'));
import { SettingsProvider } from './contexts/SettingsContext';
import { LanguageProvider } from './contexts/LanguageContext';
const ImagePaymentPage = React.lazy(() => import('./components/ImagePaymentPage'));
const LinkPaymentPage = React.lazy(() => import('./components/LinkPaymentPage'));
const CompatibilityCheckPage = React.lazy(() => import('./components/CompatibilityCheckPage'));
const PrePurchaseInfoPage = React.lazy(() => import('./components/PrePurchaseInfoPage'));
const LanguageSelectionPage = React.lazy(() => import('./components/LanguageSelectionPage'));
const LocalPaymentPage = React.lazy(() => import('./components/LocalPaymentPage'));
const PaymentSuccessPage = React.lazy(() => import('./components/PaymentSuccessPage'));
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import TermsOfServicePage from './components/TermsOfServicePage';
import RefundPolicyPage from './components/RefundPolicyPage';
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
import { trafficService } from './lib/trafficService';
import { AccessDeniedPage } from './components/AccessDeniedPage';
import VideoPlayerStudio from './components/VideoPlayerStudio';
import ShopPage from './components/ShopPage';
import FeaturesPage from './components/FeaturesPage';
import ContactPage from './components/ContactPage';
import { useSettings } from './contexts/SettingsContext';
import { Phone } from 'lucide-react';

// Wrapper for public pages that use the magic cursor
const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { settings } = useSettings();
  const base = settings.whatsapp_url || 'https://api.whatsapp.com/send?phone=9647832941204';
  const sep = base.includes('?') ? '&' : '?';
  const whatsappUrl = `${base}${sep}text=${encodeURIComponent('Contact support directly')}`;
  return (
    <div>
      {children}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contact support via WhatsApp"
        className="fixed bottom-6 right-6 z-50 group"
      >
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-full border-2 border-green-500/40 bg-gradient-to-br from-green-600 to-emerald-600 text-white font-bold shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-300">
          <Phone className="w-5 h-5" />
          <span className="text-sm">Contact Support</span>
        </div>
      </a>
    </div>
  );
};

function HomePage() {
  return (
    <div className="min-h-screen bg-[#030014] relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header />
        <Hero />
        <ProductsGrid />
        <Footer />
      </div>
    </div>
  );
}

function App() {
  const [isBanned, setIsBanned] = React.useState(false);
  const [userCountry, setUserCountry] = React.useState<string | undefined>(undefined);
  const [banReason, setBanReason] = React.useState<string | undefined>(undefined);
  const [banMessage, setBanMessage] = React.useState<string | undefined>(undefined);
  const [checkingAccess, setCheckingAccess] = React.useState(true);
  const cacheKey = 'security_ban_cache';
  const RESTRICTED = React.useMemo(() => [
    'china',
    'hong kong',
    'hong kong sar',
    'hong kong sar china',
    'south korea',
    'korea',
    'republic of korea',
    'japan'
  ], []);
  const isRestrictedCountry = React.useCallback((name?: string) => {
    const n = (name || '').toLowerCase();
    return RESTRICTED.some(rc => n.includes(rc));
  }, [RESTRICTED]);

  const banNow = React.useCallback(({ country, reason, message }: { country?: string; reason?: string; message?: string }) => {
    setUserCountry(country);
    setBanReason(reason);
    setBanMessage(message);
    setIsBanned(true);
    try {
      const ttl = 10 * 60 * 1000;
      const payload = { country, reason, message, expiresAt: Date.now() + ttl };
      localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (e) {}
    setCheckingAccess(false);
  }, []);
  
  const unbanNow = React.useCallback(() => {
    setIsBanned(false);
    setBanReason(undefined);
    setBanMessage(undefined);
    try { localStorage.removeItem(cacheKey); } catch (e) {}
  }, []);

  React.useEffect(() => {
    const init = async () => {
      // 1. Check Access First
      const { allowed, country, reason, message } = await trafficService.checkAccess();

      setUserCountry(country);
      setBanReason(reason);
      setBanMessage(message);
      
      if (!allowed || isRestrictedCountry(country)) {
        banNow({ country, reason: !allowed ? reason : 'geo', message: !allowed ? message : 'Access restricted for your region.' });
        return;
      }

      // 2. If allowed, log visit
      await trafficService.logVisit();
      setCheckingAccess(false);
    };

    init();
  }, []);

  const SEOManager = () => {
    const location = useLocation();
    const { settings } = useSettings();
    React.useEffect(() => {
      const base = 'https://cheatloop.shop';
      const canonicalHref = `${base}${location.pathname}${location.search || ''}`;
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonicalHref);
      const og = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
      if (og) og.setAttribute('content', canonicalHref);
      const titleBase = settings.site_name || 'CheatLoop';
      const pathName = location.pathname.replace(/^\/$/, '') || 'Home';
      document.title = `${titleBase} | ${pathName}`;
      const idWebsite = 'jsonld-website';
      const idOrg = 'jsonld-org';
      let s1 = document.getElementById(idWebsite) as HTMLScriptElement | null;
      if (!s1) {
        s1 = document.createElement('script');
        s1.type = 'application/ld+json';
        s1.id = idWebsite;
        document.head.appendChild(s1);
      }
      s1.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'name': titleBase,
        'url': base,
        'potentialAction': {
          '@type': 'SearchAction',
          'target': `${base}/?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      });
      let s2 = document.getElementById(idOrg) as HTMLScriptElement | null;
      if (!s2) {
        s2 = document.createElement('script');
        s2.type = 'application/ld+json';
        s2.id = idOrg;
        document.head.appendChild(s2);
      }
      s2.text = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': titleBase,
        'url': base,
        'logo': settings.site_logo_url || `${base}/cheatloop123.png`
      });
    }, [location.pathname, location.search, settings.site_name, settings.site_logo_url]);
    return null;
  };

  const BanObserver = ({ onBan, onUnban, isBanned, isRestricted }: { 
    onBan: (p: { country?: string; reason?: string; message?: string }) => void,
    onUnban: () => void,
    isBanned: boolean,
    isRestricted: (name?: string) => boolean
  }) => {
    const location = useLocation();
    const { settings: siteSettings } = useSettings();
    const allowedSince = React.useRef<number | null>(null);
    const failCount = React.useRef<number>(0);
    const allowCount = React.useRef<number>(0);
    const bannedAt = React.useRef<number | null>(null);
    const requiredMs = 300;
    const pollMs = React.useMemo(() => {
      const raw = siteSettings.security_poll_interval_ms || '250';
      const n = parseInt(String(raw), 10);
      return Math.max(50, isNaN(n) ? 250 : n);
    }, [siteSettings.security_poll_interval_ms]);
    const confirmations = React.useMemo(() => {
      const raw = siteSettings.security_detection_confirmations || '2';
      const n = parseInt(String(raw), 10);
      return Math.max(1, isNaN(n) ? 2 : n);
    }, [siteSettings.security_detection_confirmations]);
    const stickyMs = React.useMemo(() => {
      const raw = siteSettings.security_unban_sticky_ms || '5000';
      const n = parseInt(String(raw), 10);
      return Math.max(0, isNaN(n) ? 5000 : n);
    }, [siteSettings.security_unban_sticky_ms]);
    React.useEffect(() => {
      let active = true;
      const run = async () => {
        const { allowed, country, reason, message } = await trafficService.checkAccess();
        if (!active) return;
        if (!allowed || isRestricted(country)) {
          failCount.current += 1;
          allowCount.current = 0;
          if (failCount.current >= confirmations) {
            bannedAt.current = performance.now();
            allowedSince.current = null;
            onBan({ country, reason: !allowed ? reason : 'geo', message: !allowed ? message : 'Access restricted for your region.' });
          }
        } else {
          failCount.current = 0;
          if (isBanned) {
            allowCount.current += 1;
            if (allowedSince.current == null) allowedSince.current = performance.now();
            const stableTime = performance.now() - (allowedSince.current || performance.now());
            const bannedElapsed = bannedAt.current ? performance.now() - bannedAt.current : 0;
            if (stableTime >= requiredMs && allowCount.current >= confirmations && bannedElapsed >= stickyMs) {
              onUnban();
              allowedSince.current = null;
              allowCount.current = 0;
              bannedAt.current = null;
            }
          }
        }
      };
      run();
      return () => { active = false; };
    }, [location.pathname, isBanned]);
    React.useEffect(() => {
      let active = true;
      const handler = async () => {
        const { allowed, country, reason, message } = await trafficService.checkAccess();
        if (!active) return;
        if (!allowed || isRestricted(country)) {
          failCount.current += 1;
          allowCount.current = 0;
          if (failCount.current >= confirmations) {
            bannedAt.current = performance.now();
            allowedSince.current = null;
            onBan({ country, reason: !allowed ? reason : 'geo', message: !allowed ? message : 'Access restricted for your region.' });
          }
        } else {
          failCount.current = 0;
          if (isBanned) {
            allowCount.current += 1;
            if (allowedSince.current == null) allowedSince.current = performance.now();
            const stableTime = performance.now() - (allowedSince.current || performance.now());
            const bannedElapsed = bannedAt.current ? performance.now() - bannedAt.current : 0;
            if (stableTime >= requiredMs && allowCount.current >= confirmations && bannedElapsed >= stickyMs) {
              onUnban();
              allowedSince.current = null;
              allowCount.current = 0;
              bannedAt.current = null;
            }
          }
        }
      };
      const vis = () => { if (!document.hidden) handler(); };
      window.addEventListener('focus', handler);
      document.addEventListener('visibilitychange', vis);
      window.addEventListener('online', handler);
      window.addEventListener('offline', handler);
      const conn: any = (navigator as any).connection;
      const hasConnEvt = conn && typeof conn.addEventListener === 'function';
      if (hasConnEvt) conn.addEventListener('change', handler);
      return () => {
        active = false;
        window.removeEventListener('focus', handler);
        document.removeEventListener('visibilitychange', vis);
        window.removeEventListener('online', handler);
        window.removeEventListener('offline', handler);
        if (hasConnEvt) conn.removeEventListener('change', handler);
      };
    }, []);
    React.useEffect(() => {
      let active = true;
      let checking = false;
      const poll = async () => {
        if (checking) return;
        checking = true;
        try {
          const { allowed, country, reason, message } = await trafficService.checkAccess();
          if (!active) return;
          if (!allowed || isRestricted(country)) {
            failCount.current += 1;
            allowCount.current = 0;
            if (failCount.current >= confirmations) {
              bannedAt.current = performance.now();
              allowedSince.current = null;
              onBan({ country, reason: !allowed ? reason : 'geo', message: !allowed ? message : 'Access restricted for your region.' });
            }
          } else {
            failCount.current = 0;
            if (isBanned) {
              allowCount.current += 1;
              if (allowedSince.current == null) allowedSince.current = performance.now();
              const stableTime = performance.now() - (allowedSince.current || performance.now());
              const bannedElapsed = bannedAt.current ? performance.now() - bannedAt.current : 0;
              if (stableTime >= requiredMs && allowCount.current >= confirmations && bannedElapsed >= stickyMs) {
                onUnban();
                allowedSince.current = null;
                allowCount.current = 0;
                bannedAt.current = null;
              }
            }
          }
        } finally {
          checking = false;
        }
      };
      const id = setInterval(poll, pollMs);
      poll();
      return () => {
        active = false;
        clearInterval(id);
      };
    }, [isBanned, isRestricted, pollMs, confirmations]);
    return null;
  };

  if (checkingAccess) {
    return null; // Or a loading spinner if preferred, but null prevents flash of content
  }

  return (
    <SettingsProvider>
      <LanguageProvider>
        <Router>
          <SEOManager />
          <BanObserver onBan={banNow} onUnban={unbanNow} isBanned={isBanned} isRestricted={isRestrictedCountry} />
          {isBanned ? (
            <AccessDeniedPage country={userCountry} reason={banReason} message={banMessage} />
          ) : (
            <React.Suspense fallback={<div className="min-h-screen bg-[#030014] flex items-center justify-center text-white"><div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div></div>}>
              <Routes>
              {/* Public Routes - Wrapped with PublicLayout for Magic Cursor */}
              <Route path="/" element={<PublicLayout><HomePage /></PublicLayout>} />
              <Route path="/winning-photos" element={<PublicLayout><WinningPhotosPage /></PublicLayout>} />
              <Route path="/privacy" element={<PublicLayout><PrivacyPolicyPage /></PublicLayout>} />
              <Route path="/terms" element={<PublicLayout><TermsOfServicePage /></PublicLayout>} />
              <Route path="/refund" element={<PublicLayout><RefundPolicyPage /></PublicLayout>} />
              <Route path="/shop" element={<PublicLayout><ShopPage /></PublicLayout>} />
              <Route path="/features" element={<PublicLayout><FeaturesPage /></PublicLayout>} />
              <Route path="/contact" element={<PublicLayout><ContactPage /></PublicLayout>} />
              <Route path="/select-language/:productId" element={<PublicLayout><LanguageSelectionPage /></PublicLayout>} />
              <Route path="/pay/:productId" element={<PublicLayout><ImagePaymentPage /></PublicLayout>} />
              <Route path="/link-pay/:productId" element={<PublicLayout><LinkPaymentPage /></PublicLayout>} />
              <Route path="/local-pay/:productId" element={<PublicLayout><LocalPaymentPage /></PublicLayout>} />
              <Route path="/payment-success" element={<PublicLayout><PaymentSuccessPage /></PublicLayout>} />
              <Route path="/check-compatibility/:productId" element={<PublicLayout><CompatibilityCheckPage /></PublicLayout>} />
              <Route path="/pre-purchase/:productId" element={<PublicLayout><PrePurchaseInfoPage /></PublicLayout>} />
              <Route path="/video-studio" element={<VideoPlayerStudio />} />
              
              {/* Integrated Admin Panel Route - NO Magic Cursor, Default System Cursor */}
              <Route path="/senator/*" element={<AdminPanel />} />
              
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </React.Suspense>
          )}
        </Router>
      </LanguageProvider>
    </SettingsProvider>
  );
}

export default App;
