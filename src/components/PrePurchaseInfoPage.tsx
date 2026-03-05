import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { productService, purchaseIntentsService, Product, localPaymentService, LocalPaymentMethod, verifiedUserService, verifiedStatusService, customerHistoryService, supabase, PurchaseIntent } from '../lib/supabase';
import { trafficService } from '../lib/trafficService';
import { discordService } from '../lib/discordService';
import { moneyMotionService } from '../lib/moneyMotionService';
import { useSettings } from '../contexts/SettingsContext';
import { AlertTriangle, ArrowRight, Home, Mail, Phone, RefreshCw, Info, Globe, Lock, CreditCard, Bitcoin, Wallet, Building2, MessageCircle, UserPlus, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { countries } from '../data/countries';
import SearchableSelect from './SearchableSelect';
import { cn } from '../lib/utils';

type Lang = 'en' | 'ar' | 'tr';

const PrePurchaseInfoPage: React.FC = () => {
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const { settings } = useSettings();

    const getFlagEmoji = (isoCode: string) => {
        if (!isoCode) return '';
        // استخدام رابط صورة مباشر من flagcdn بدلاً من Emoji لضمان الظهور على جميع الأجهزة
        return `https://flagcdn.com/w40/${isoCode.toLowerCase()}.png`;
    };

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    
    const { lang, setLang, t } = useLanguage();

    // Wizard State
    const [step, setStep] = useState(1);

    const [country, setCountry] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [email, setEmail] = useState('');
    const [localPhone, setLocalPhone] = useState('');
    const [username, setUsername] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [showVerificationModal, setShowVerificationModal] = useState(false);
    const [errors, setErrors] = useState<{ country?: string, email?: string; phone?: string; username?: string; general?: string }>({});
    const [knownCustomer, setKnownCustomer] = useState(false);
    const [knownLoading, setKnownLoading] = useState(false);
    const [knownError, setKnownError] = useState<string | null>(null);
    const [showUsernameStep2, setShowUsernameStep2] = useState(false);
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
    const [assignError, setAssignError] = useState<string | null>(null);
    const [showUsernameField, setShowUsernameField] = useState(false);
    const [showUsernameButtonVisible, setShowUsernameButtonVisible] = useState(false);
    
    const [localMethods, setLocalMethods] = useState<LocalPaymentMethod[]>([]);
    const [cryptoMethods, setCryptoMethods] = useState<LocalPaymentMethod[]>([]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
    const [isMoneyMotionPaused, setIsMoneyMotionPaused] = useState(false);
    useEffect(() => {
        const checkKnown = async () => {
            const fullPhoneNumber = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
            if (!(email || fullPhoneNumber)) {
                setKnownCustomer(false);
                return;
            }
            setKnownLoading(true);
            setKnownError(null);
            try {
                const disableFunctions = (import.meta as any)?.env?.VITE_DISABLE_FUNCTIONS === 'true';
                if (!disableFunctions) {
                    const { data, error } = await supabase!.functions.invoke('check-known-customer', {
                        body: { email, phone: fullPhoneNumber }
                    });
                    if (error) throw error;
                    setKnownCustomer(!!data?.known);
                } else {
                    const known = await customerHistoryService.isKnownCustomer(email, fullPhoneNumber);
                    setKnownCustomer(known);
                }
            } catch (e: any) {
                console.error('Known customer check failed:', e);
                setKnownError('تعذّر التحقق من السجل. جرّب لاحقًا.');
                // Fallback to client-side check
                try {
                    const known = await customerHistoryService.isKnownCustomer(email, fullPhoneNumber);
                    setKnownCustomer(known);
                    setKnownError(null);
                } catch {
                    setKnownCustomer(false);
                }
            } finally {
                setKnownLoading(false);
            }
        };
        checkKnown();
    }, [email, localPhone, countryCode, settings.zello_phone]);

    useEffect(() => {
        const fetchInitialData = async () => {
            if (!productId) {
                setFetchError(t.error);
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                
                // Check MoneyMotion status
                const settings = await moneyMotionService.getSettings();
                setIsMoneyMotionPaused(settings.moneymotion_payment_paused === 'true');

                const productData = await productService.getProductById(productId);
                setProduct(productData);
                
                // Fetch all active crypto methods initially since they are global
                const allMethods = await localPaymentService.getAll();
                const crypto = allMethods.filter(m => m.is_active && m.is_crypto);
                const sortedCrypto = [...crypto].sort((a, b) => {
                    const ap = a.popularity_score ?? 0;
                    const bp = b.popularity_score ?? 0;
                    return bp - ap;
                });
                setCryptoMethods(sortedCrypto);

            } catch (err: any) {
                setFetchError(t.error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [productId, t.error]);

    useEffect(() => {
        if (product && !selectedPaymentMethod) {
            const pm = (product as any).purchase_method;
            const hasExternal = !!(((product as any).buy_link && (product as any).buy_link.trim() !== '') || ((product as any).alternative_links && (product as any).alternative_links.length > 0));
            if (pm === 'external' && hasExternal) {
                setSelectedPaymentMethod('external');
            } else if (!isMoneyMotionPaused) {
                setSelectedPaymentMethod('standard');
            }
        }
    }, [product, selectedPaymentMethod, isMoneyMotionPaused]);

    const handleCountryChange = async (selectedCountryName: string) => {
        const selectedCountry = countries.find(c => c.name === selectedCountryName);
        if (selectedCountry) {
            setCountry(selectedCountryName);
            setCountryCode(selectedCountry.code);
            
            try {
                const allMethods = await localPaymentService.getAll();
                // Filter for non-crypto local methods
                const relevantMethods = allMethods.filter(
                    m => m.is_active && !m.is_crypto && (
                        m.country.toLowerCase() === selectedCountryName.toLowerCase() || 
                        m.country.toLowerCase() === 'global'
                    )
                );
                const sorted = [...relevantMethods].sort((a, b) => {
                    const aLocal = a.country.toLowerCase() === selectedCountryName.toLowerCase() ? 1 : 0;
                    const bLocal = b.country.toLowerCase() === selectedCountryName.toLowerCase() ? 1 : 0;
                    if (aLocal !== bLocal) return bLocal - aLocal;
                    const ap = a.local_priority ?? 0;
                    const bp = b.local_priority ?? 0;
                    if (ap !== bp) return bp - ap;
                    const apo = a.popularity_score ?? 0;
                    const bpo = b.popularity_score ?? 0;
                    return bpo - apo;
                });
                setLocalMethods(sorted);
            } catch (e) {
                console.error("Failed to fetch local payment methods", e);
                setLocalMethods([]);
            }
        } else {
            setCountry('');
            setCountryCode('');
            setLocalMethods([]);
            setShowUsernameButtonVisible(false);
            setShowUsernameField(false);
        }
    };

    const validateDetails = () => {
        const newErrors: { country?: string, email?: string; phone?: string; username?: string; general?: string } = {};
        const fullPhoneNumber = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            newErrors.email = t.emailRequired;
        } else if (!emailRegex.test(email)) {
            newErrors.email = t.emailInvalid;
        }

        const isCardLike = selectedPaymentMethod === 'standard' || selectedPaymentMethod === 'external';
        if (!isCardLike) {
            const hasZello = !!(settings.zello_phone && settings.zello_phone.trim());
            if (!hasZello) {
                if (!localPhone) {
                    newErrors.phone = t.phoneRequired;
                } else if (fullPhoneNumber.length < 8 || fullPhoneNumber.length > 20) {
                    newErrors.phone = t.phoneInvalid;
                }
            }
        }

        const title = (product?.title || '').toLowerCase();
        const fullPhoneNumberCheck = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
        const hasIdentity = !!email || !!fullPhoneNumberCheck;
        const requiresUsername = (title.includes('cheatloop') || title.includes('sinki')) && hasIdentity && !knownCustomer && !knownLoading;
        if (requiresUsername && !username) {
            newErrors.username = t.usernameRequired;
        }

        if (!isCardLike) {
            if (!country) {
                newErrors.country = t.countryRequired;
            }
        }

        // Username validation for Cheatloop/Sinki
        const productTitle = (product?.title || '').toLowerCase();
        const isCheatloop = productTitle.includes('cheatloop');
        const isSinki = productTitle.includes('sinki');
        
        const fullPhoneNumberCheck2 = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
        const hasIdentity2 = !!email || !!fullPhoneNumberCheck2;
        if ((isCheatloop || isSinki) && hasIdentity2 && !knownCustomer && !knownLoading) {
            if (!username) {
                newErrors.username = t.usernameRequired;
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleMethodNext = async () => {
        if (knownLoading) {
            setErrors({ general: 'جاري التحقق من السجل، انتظر لحظة...' });
            return;
        }
        if (!knownCustomer && showUsernameField) {
            if (!username || username.trim() === '') {
                setErrors(prev => ({ ...prev, username: t.usernameRequired }));
                return;
            }
            try {
                const status = await verifiedStatusService.getIdentityStatus(username.trim());
                if (status.banned) {
                    const msg = lang === 'ar' ? 'أنت محظور' : (lang === 'tr' ? 'Yasaklandınız' : 'You are banned');
                    setErrors(prev => ({ ...prev, username: msg, general: 'أنت محظور' }));
                    return;
                }
                if (!status.exists) {
                    const msg = lang === 'ar' ? 'اسم المستخدم غير موجود' : (lang === 'tr' ? 'Kullanıcı adı bulunamadı' : 'Username not found');
                    setErrors(prev => ({ ...prev, username: msg }));
                    return;
                }
                if (!status.verified) {
                    const msg = lang === 'ar' ? 'اسم المستخدم غير موثق' : (lang === 'tr' ? 'Kullanıcı adı doğrulanmadı' : 'Username not verified');
                    setErrors(prev => ({ ...prev, username: msg }));
                    setShowVerificationModal(true);
                    return;
                }
                setErrors({});
                setStep(2);
                return;
            } catch (e) {
                setErrors({ general: 'تعذّر التحقق من اسم المستخدم. حاول مرة أخرى.' });
                return;
            }
        }
        try {
            setKnownLoading(true);
            const fullPhoneNumberLocal = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
            const { data, error } = await supabase!.functions.invoke('check-known-customer', {
                body: { email, phone: fullPhoneNumberLocal }
            });
            if (error) throw error;
            const isKnown = !!data?.known;
            setKnownCustomer(isKnown);
            if (isKnown) {
                setErrors({});
                setShowUsernameStep2(false);
                setShowUsernameButtonVisible(false);
                setShowUsernameField(false);
                setStep(2);
                return;
            } else {
                // مستخدم جديد: لا ننتقل ونُظهر زر إدخال اسم المستخدم ورسالة مطلوبة
                const productTitle = (product?.title || '').toLowerCase();
                const isCheatloop = productTitle.includes('cheatloop');
                const isSinki = productTitle.includes('sinki');
                if (isCheatloop || isSinki) {
                    setShowUsernameButtonVisible(true);
                    setErrors(prev => ({ ...prev, username: t.usernameRequired }));
                }
                return;
            }
        } catch (e: any) {
            console.error('Known check on next failed:', e);
            // مسار احتياطي: فحص محلي عبر جداول المنتج والطلبات
            try {
                const fullPhoneNumberLocal = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
                const known = await customerHistoryService.isKnownCustomer(email, fullPhoneNumberLocal);
                setKnownCustomer(known);
                if (known) {
                    setErrors({});
                    setShowUsernameStep2(false);
                    setShowUsernameButtonVisible(false);
                    setShowUsernameField(false);
                    setStep(2);
                    return;
                } else {
                    const productTitle = (product?.title || '').toLowerCase();
                    const isCheatloop = productTitle.includes('cheatloop');
                    const isSinki = productTitle.includes('sinki');
                    if (isCheatloop || isSinki) {
                        setShowUsernameButtonVisible(true);
                        setErrors(prev => ({ ...prev, username: t.usernameRequired }));
                    }
                    return;
                }
            } catch {
                setErrors({ general: 'تعذّر التحقق من السجل. حاول مرة أخرى.' });
                return;
            }
        } finally {
            setKnownLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedPaymentMethod || !product) {
            setErrors({ general: 'Please select a payment method.' });
            return;
        }
        
        if (!validateDetails()) {
            return;
        }

        setSaving(true);
        setErrors({});
        const fullPhoneNumber = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);

        try {
            const productTitle = (product?.title || '').toLowerCase();
            let brand: string | null = null;
            if (productTitle.includes('cheatloop')) {
                brand = 'cheatloop';
            } else if (productTitle.includes('sinki')) {
                brand = 'sinki';
            }
            if (brand && !knownCustomer) {
                try {
                    const status = await verifiedStatusService.getIdentityStatus(username);
                    if (!status.exists) {
                        const msg = lang === 'ar' ? 'اسم المستخدم غير موجود' : (lang === 'tr' ? 'Kullanıcı adı bulunamadı' : 'Username not found');
                        setErrors(prev => ({ ...prev, username: msg }));
                        setSaving(false);
                        return;
                    }
                    if (status.banned) {
                        const msg = lang === 'ar' ? 'أنت محظور' : (lang === 'tr' ? 'Yasaklandınız' : 'You are banned');
                        setErrors(prev => ({ ...prev, username: msg, general: 'أنت محظور' }));
                        setSaving(false);
                        return;
                    }
                    if (!status.verified) {
                        const msg = lang === 'ar' ? 'اسم المستخدم غير موثق' : (lang === 'tr' ? 'Kullanıcı adı doğrulanmadı' : 'Username not verified');
                        setErrors(prev => ({ ...prev, username: msg }));
                        setShowVerificationModal(true);
                        setSaving(false);
                        return;
                    }
                    setIsVerified(true);
                } catch (err) {
                    console.error('Verification error:', err);
                }
            }

            // Check if user is banned
            const banStatus = await trafficService.checkCustomerBan(email, fullPhoneNumber);
            if (banStatus.banned) {
                setErrors({ general: 'أنت محظور' });
                setSaving(false);
                return;
            }

            // Resolve readable payment method name for logging and storage
            let paymentMethodName = 'Standard';
            if (selectedPaymentMethod === 'standard') {
                paymentMethodName = 'MoneyMotion (Card)';
            } else if (selectedPaymentMethod === 'external') {
                paymentMethodName = 'External Link';
            } else {
                const methodObj = [...localMethods, ...cryptoMethods].find(m => m.id === selectedPaymentMethod);
                if (methodObj) {
                    paymentMethodName = `${methodObj.method_name} (${methodObj.country})`;
                } else {
                    paymentMethodName = selectedPaymentMethod;
                }
            }

            let intent: PurchaseIntent | null = null;
            try {
                intent = await purchaseIntentsService.addIntent({
                    product_id: product.id,
                    product_title: product.title,
                    country,
                    email,
                    phone_number: fullPhoneNumber,
                    payment_method: paymentMethodName,
                });
            } catch {
                intent = null;
            }

            // Send Discord Notification (Order Created)
            if (settings.discord_webhook_url) {
                let avatarUrl = settings.discord_bot_avatar_url;
                if (!avatarUrl && settings.site_logo_url) {
                    let logoUrl = settings.site_logo_url;
                    if (!logoUrl.startsWith('http')) {
                        logoUrl = window.location.origin + (logoUrl.startsWith('/') ? '' : '/') + logoUrl;
                    }
                    avatarUrl = encodeURI(logoUrl);
                }
                if (avatarUrl && avatarUrl.includes('supabase.co')) {
                    const separator = avatarUrl.includes('?') ? '&' : '?';
                    avatarUrl = `${avatarUrl}${separator}t=${Date.now()}`;
                }

                // Resolve readable payment method name
                // (Already computed above)

                const productTitle = (product?.title || '').toLowerCase();
                const brand = productTitle.includes('cheatloop') ? 'cheatloop' :
                              productTitle.includes('sinki') ? 'sinki' : null;

                const orderId = (intent?.id ? intent.id.substring(0, 8).toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase());
                discordService.sendPurchaseNotification(settings.discord_webhook_url, {
                    productName: product.title,
                    price: `${product.price}$`,
                    paymentMethod: paymentMethodName,
                    customerEmail: email,
                    customerPhone: fullPhoneNumber,
                    username: brand && !knownCustomer ? username : undefined,
                    orderId,
                    title: '📝 طلب جديد (قيد الانتظار)'
                }, avatarUrl, settings.discord_admin_id)
                .catch(err => console.error('Discord notification failed:', err));
            }

            if (selectedPaymentMethod === 'standard') {
                // MoneyMotion Integration
                try {
                    // Calculate tax if applicable
                    const taxPercentage = (product as any).payment_gateway_tax || 0;
                    const taxAmount = taxPercentage > 0 ? (product.price * taxPercentage) / 100 : 0;
                    const totalAmount = product.price + taxAmount;

                    // Use a masked product name for MoneyMotion to show as a technical service
                    // Priority: Product-specific masked name > Original product title
                    const maskedProductName = (product as any).masked_name || product.title;
                    const maskedDomain = (product as any).masked_domain || undefined;

                    const session = await moneyMotionService.createCheckoutSession({
                        amount: totalAmount,
                        currency: 'USD',
                        productName: maskedProductName,
                        customerEmail: email,
                        maskedDomain: maskedDomain,
                        metadata: {
                            intent_id: intent?.id || '',
                            product_id: product.id,
                            base_price: product.price,
                            tax_percentage: taxPercentage,
                            tax_amount: taxAmount,
                            customer_phone: fullPhoneNumber,
                            customer_country: country,
                            username: username
                        },
                        successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                        cancelUrl: window.location.href,
                    });

                    if (session && session.url) {
                        window.location.href = session.url;
                        return; // Stop execution here as we are redirecting
                    } else {
                        throw new Error('Failed to create payment session.');
                    }
                } catch (error: any) {
                    console.error('MoneyMotion redirect error:', error);
                    setErrors({ general: error.message || 'Payment gateway error. Please try again.' });
                    setSaving(false);
                    return;
                }
            } else if (selectedPaymentMethod === 'external') {
                const primary = (product as any).buy_link && (product as any).buy_link.trim() !== '' ? (product as any).buy_link : null;
                const alt = ((product as any).alternative_links && (product as any).alternative_links.length > 0) ? (product as any).alternative_links[0].url : null;
                const target = primary || alt;
                if (target) {
                    window.location.href = target;
                } else {
                    setErrors({ general: 'لا يوجد رابط شراء متاح لهذا المنتج.' });
                    setSaving(false);
                    return;
                }
            } else {
                navigate(`/local-pay/${product.id}?method=${selectedPaymentMethod}`);
            }
        } catch (err: any) {
            setErrors({ general: err.message || 'Failed to save your information.' });
            setSaving(false);
        }
    };
 
    const hasExternalLink = !!(product?.buy_link && product.buy_link.trim() !== '') || (product?.alternative_links && product.alternative_links.length > 0);
 
    const ExternalPaymentCard = () => (
        <div 
            onClick={() => setSelectedPaymentMethod('external')}
            className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === 'external' ? 'border-cyan-500 shadow-[0_0_25px_rgba(6,182,212,0.35)]' : 'border-white/5 hover:border-white/20'} hover:-translate-y-0.5`}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a1a1f] via-[#06171c] to-[#0a0a0c] z-0"></div>
            <div className="relative z-10 p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg ring-1 ring-cyan-400/30">
                        <CreditCard className="w-6 h-6 text-white drop-shadow" />
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-lg">Visa / Mastercard</h4>
                        <p className="text-xs text-gray-400">الدفع عبر رابط مباشر</p>
                        <div className="flex gap-2 mt-2">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4 opacity-80 bg-white/10 rounded px-1" />
                            <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-4 opacity-80 bg-white/10 rounded px-1" />
                        </div>
                    </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPaymentMethod === 'external' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`}>
                    {selectedPaymentMethod === 'external' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                </div>
            </div>
        </div>
    );
 
    const hasLocalOrCrypto = (localMethods.length > 0) || (cryptoMethods.length > 0);
 
    const renderPaymentMethods = () => (
        <div className="grid grid-cols-1 gap-4 overflow-y-auto custom-scrollbar pr-2 max-h-[400px]">
            {!isMoneyMotionPaused && ((product as any)?.purchase_method !== 'external') && (
                <div 
                    onClick={() => setSelectedPaymentMethod('standard')}
                    className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === 'standard' ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'border-white/5 hover:border-white/20'}`}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-0"></div>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Globe className="w-24 h-24 text-white" />
                    </div>
                    <div className="relative z-10 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                                <CreditCard className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-lg">{t.globalPayment}</h4>
                                <p className="text-xs text-gray-400">{t.globalPaymentDesc}</p>
                                <div className="flex gap-2 mt-2">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4 opacity-70 bg-white/10 rounded px-1" />
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-4 opacity-70 bg-white/10 rounded px-1" />
                                </div>
                            </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPaymentMethod === 'standard' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`}>
                            {selectedPaymentMethod === 'standard' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                    </div>
                </div>
            )}
 
            {hasExternalLink && <ExternalPaymentCard />}
 
            {localMethods.map(method => (
                <div 
                    key={method.id}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === method.id ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-white/5 hover:border-white/20'}`}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a103c] to-[#0a0a0c] z-0"></div>
                    <div className="relative z-10 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${method.image_url ? 'bg-white p-1' : 'bg-gradient-to-br from-purple-500 to-pink-600'} flex items-center justify-center shadow-lg overflow-hidden`}>
                                {method.image_url ? (
                                    <img src={method.image_url} alt={method.method_name} className="w-full h-full object-contain" />
                                ) : (
                                    <Building2 className="w-6 h-6 text-white" />
                                )}
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-lg">{lang === 'ar' ? (method.name_ar || method.method_name) : lang === 'tr' ? (method.name_tr || method.method_name) : (method.name_en || method.method_name)}</h4>
                                <p className="text-xs text-gray-400">{t.localPaymentDesc} ({country})</p>
                            </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPaymentMethod === method.id ? 'border-purple-500 bg-purple-500' : 'border-gray-600'}`}>
                            {selectedPaymentMethod === method.id && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                    </div>
                </div>
            ))}
 
            {cryptoMethods.map(method => (
                <div 
                    key={method.id}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === method.id ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'border-white/5 hover:border-white/20'}`}
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1c1917] to-[#0a0a0c] z-0"></div>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Bitcoin className="w-24 h-24 text-yellow-500" />
                    </div>
                    <div className="relative z-10 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${method.image_url ? 'bg-white p-1' : 'bg-gradient-to-br from-yellow-500 to-orange-600'} flex items-center justify-center shadow-lg overflow-hidden`}>
                                {method.image_url ? (
                                    <img src={method.image_url} alt={method.method_name} className="w-full h-full object-contain" />
                                ) : (
                                    <Wallet className="w-6 h-6 text-white" />
                                )}
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-lg">{method.method_name}</h4>
                                <p className="text-xs text-gray-400">{t.cryptoPaymentDesc} {method.crypto_network ? `(${method.crypto_network})` : ''}</p>
                                
                            </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPaymentMethod === method.id ? 'border-yellow-500 bg-yellow-500' : 'border-gray-600'}`}>
                            {selectedPaymentMethod === method.id && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
 

    if (loading) {
        return (
            <div className="min-h-screen bg-black relative flex items-center justify-center">
                <div className="text-center z-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                    <p className="text-white font-medium tracking-wider">{t.loading}</p>
                </div>
            </div>
        );
    }

    if (fetchError || !product) {
        return (
             <div className="min-h-screen bg-black relative flex items-center justify-center p-4">
                <div className="text-center bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-lg z-10 backdrop-blur-md">
                    <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">{t.errorTitle}</h2>
                    <p className="text-red-300 mb-6">{fetchError || 'Product not found.'}</p>
                    <Link to="/" className="inline-flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl transition-colors border border-white/5">
                        <Home className="w-5 h-5" />
                        <span>{t.goBack}</span>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black relative text-white py-12 flex items-center justify-center overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            
            <div className="relative z-10 container mx-auto px-4 sm:px-6 max-w-5xl">
                
                {/* Main Card */}
                <div className="bg-black backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative group">
                    
                    {/* Top Glow Line */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-70" />

                    <div className="grid md:grid-cols-5 h-full">
                        
                        {/* Left Side: Product Info */}
                        <div className="md:col-span-2 bg-black p-8 border-b md:border-b-0 md:border-r rtl:md:border-l rtl:md:border-r-0 border-white/5 flex flex-col justify-between relative overflow-hidden">
                            {/* Background Pattern */}
                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/20 to-transparent" />
                            
                            <div>
                                <Link to="/" className="inline-flex items-center text-xs font-medium text-gray-400 hover:text-white transition-colors mb-8 group/link z-20 relative">
                                    <Home className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 group-hover/link:text-cyan-400 transition-colors" />
                                    <span>{t.backToHome}</span>
                                </Link>

                                <div className="mb-8">
                                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{t.prePurchaseTitle}</h2>
                                    <p className="text-sm text-gray-400 leading-relaxed">{t.prePurchaseSubtitle}</p>
                                </div>

                                {product && (
                                    <div className="bg-black rounded-2xl p-5 border border-white/10 backdrop-blur-sm relative overflow-hidden group/product min-h-[220px] flex flex-col">
                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover/product:opacity-20 transition-opacity">
                                            <Lock className="w-12 h-12 text-white" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase mb-2">{t.payFor}</div>
                                            <div className="text-xl font-bold text-white mb-1 leading-tight">{product.title}</div>
                                            <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{product.price}$</div>
                                        </div>
                                        {product.image && (
                                            <div className="flex-1 flex items-center justify-center mt-2">
                                                <img 
                                                    src={product.image} 
                                                    alt={product.title} 
                                                    className="w-32 h-32 object-contain drop-shadow-[0_0_20px_rgba(168,85,247,0.4)] transform group-hover/product:scale-110 transition-transform duration-500 -translate-y-6" 
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Steps Indicator */}
                            <div className="mt-8 flex items-center justify-center gap-2">
                                <div className={cn("h-1.5 w-8 rounded-full transition-all duration-300", step === 1 ? "bg-cyan-500" : "bg-white/20")}></div>
                                <div className={cn("h-1.5 w-8 rounded-full transition-all duration-300", step === 2 ? "bg-cyan-500" : "bg-white/20")}></div>
                            </div>
                        </div>

                        {/* Right Side: Form / Payment Selection */}
                        <div className="md:col-span-3 p-8 relative bg-black flex flex-col">
                            
                            {/* Language Switcher */}
                            <div className="flex justify-end mb-6 gap-2">
                                {[
                                    { code: 'en', label: 'EN', iso: 'us' },
                                    { code: 'ar', label: 'AR', iso: 'ae' },
                                    { code: 'tr', label: 'TR', iso: 'tr' }
                                ].map((l) => (
                                    <button
                                        key={l.code}
                                        onClick={() => setLang(l.code as Lang)}
                                        className={cn(
                                            "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider border flex items-center gap-1.5",
                                            lang === l.code 
                                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]" 
                                                : "bg-transparent border-transparent text-gray-600 hover:text-gray-300 hover:bg-white/5"
                                        )}
                                    >
                                        <div className="w-5 h-3.5 flex-shrink-0 overflow-hidden rounded-sm border border-white/10">
                                            <img src={getFlagEmoji(l.iso)} alt={l.label} className="w-full h-full object-cover" />
                                        </div>
                                        <span>{l.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Step 1: Personal Details */}
                            {step === 1 && (
                            <div className="space-y-6 animate-fade-in-up flex-1">
                                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 text-sm border border-cyan-500/20">1</span>
                                    {t.step1Title}
                                    </h3>

                                {(step === 1 || (selectedPaymentMethod !== 'standard' && selectedPaymentMethod !== 'external')) && (
                                <div className="group/input">
                                        <div className="relative">
                                            <div className="absolute left-3 rtl:right-3 rtl:left-auto top-[42px] -translate-y-1/2 text-gray-500 z-10">
                                                <Globe className="w-5 h-5" />
                                            </div>
                                            <div className="[&_button]:pl-10 [&_button]:rtl:pr-10 [&_button]:rtl:pl-3">
                                                <SearchableSelect
                                                    label={t.countryLabel}
                                                    options={countries.map(c => ({
                                                        label: c.name,
                                                        value: c.name,
                                                        icon: getFlagEmoji(c.iso),
                                                        isImageIcon: true
                                                    }))}
                                                    value={country}
                                                    onChange={handleCountryChange}
                                                    placeholder={t.countryPlaceholder}
                                                />
                                            </div>
                                        </div>
                                        {errors.country && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-fade-in"><AlertTriangle className="w-3 h-3"/> {errors.country}</p>}
                                </div>
                                )}

                                    <div className="group/input">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">{t.emailLabel}</label>
                                        <div className="relative">
                                            <div className="absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within/input:text-cyan-400">
                                                <Mail className="w-5 h-5" />
                                            </div>
                                            <input 
                                                    type="email" 
                                                    value={email} 
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setEmail(v);
                                                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                                    setErrors(prev => ({ ...prev, email: !v ? t.emailRequired : (!emailRegex.test(v) ? t.emailInvalid : undefined) }));
                                                }} 
                                                    className="w-full bg-black border border-white/10 rounded-xl py-3.5 pl-10 rtl:pr-10 rtl:pl-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
                                                    placeholder={t.emailPlaceholder} 
                                                />
                                        </div>
                                        {errors.email && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-fade-in"><AlertTriangle className="w-3 h-3"/> {errors.email}</p>}
                                    </div>

                                {(step === 1 || (selectedPaymentMethod !== 'standard' && selectedPaymentMethod !== 'external')) && (
                                <div className="group/input">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">{t.phoneLabel}</label>
                                        {settings.zello_phone && settings.zello_phone.trim() ? (
                                            <div className="relative">
                                                <div className="absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 text-gray-500 transition-colors">
                                                    <Phone className="w-4 h-4" />
                                                </div>
                                                <input 
                                                    type="text" 
                                                    value={settings.zello_phone.trim()} 
                                                    readOnly
                                                    className="w-full bg-black border border-white/10 rounded-xl py-3.5 pl-10 rtl:pr-10 rtl:pl-4 text-white placeholder-gray-600"
                                                />
                                            </div>
                                        ) : (
                                            <div className="relative flex">
                                                <div className="flex items-center justify-center bg-black border border-white/10 border-r-0 rtl:border-l-0 rtl:border-r rounded-l-xl rtl:rounded-l-none rtl:rounded-r-xl px-3 min-w-[60px] text-gray-400 font-mono text-sm">
                                                    {countryCode || '+..'}
                                                </div>
                                                <div className="relative flex-1">
                                                    <div className="absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within/input:text-cyan-400">
                                                        <Phone className="w-4 h-4" />
                                                    </div>
                                                    <input 
                                                        type="tel" 
                                                        value={localPhone} 
                                                        onChange={(e) => {
                                                            const v = e.target.value.replace(/\D/g, '');
                                                            setLocalPhone(v);
                                                            const full = (countryCode || '') + v;
                                                            setErrors(prev => ({ ...prev, phone: !v ? t.phoneRequired : ((full.length < 8 || full.length > 20) ? t.phoneInvalid : undefined) }));
                                                        }}
                                                        className="w-full bg-black border border-white/10 rounded-r-xl rtl:rounded-r-none rtl:rounded-l-xl py-3.5 pl-10 rtl:pr-10 rtl:pl-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
                                                        placeholder={t.phonePlaceholder} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {errors.phone && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-fade-in"><AlertTriangle className="w-3 h-3"/> {errors.phone}</p>}
                                </div>
                                )}

                                    {(() => {
                                        const productTitle = (product?.title || '').toLowerCase();
                                        const isCheatloop = productTitle.includes('cheatloop');
                                        const isSinki = productTitle.includes('sinki');
                                        const isCodCheatloop = isCheatloop && (
                                            productTitle.includes('call of duty') || 
                                            productTitle.includes('cod') || 
                                            productTitle.includes('mw') || 
                                            productTitle.includes('warzone') || 
                                            productTitle.includes('mobile')
                                        );
                                        const fullPhoneNumberLocal = (settings.zello_phone && settings.zello_phone.trim()) ? settings.zello_phone.trim() : (countryCode + localPhone);
                                        const hasIdentityLocal = !!email || !!fullPhoneNumberLocal;
                                        const showUsername = showUsernameField;
                                        if (!showUsername) return null;
                                        const label = isCheatloop ? t.cheatloopUsername : (isSinki ? t.sinkiUsername : 'اسم المستخدم');
                                        return (
                                            <div className="group/input animate-fade-in">
                                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                                                    {label}
                                                </label>
                                                {knownLoading && (
                                                    <div className="mb-3 text-xs text-cyan-300 flex items-center gap-2">
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                        <span>جارٍ التحقق من السجل...</span>
                                                    </div>
                                                )}
                                                {knownError && (
                                                    <p className="text-red-400 text-xs mb-3 flex items-center gap-1 animate-fade-in">
                                                        <AlertTriangle className="w-3 h-3"/> {knownError}
                                                    </p>
                                                )}
                                                <div className="relative">
                                                    <div className="absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within/input:text-cyan-400">
                                                        <Mail className="w-5 h-5" />
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={username} 
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setUsername(v);
                                                            setErrors(prev => ({ ...prev, username: !v ? t.usernameRequired : undefined }));
                                                        }} 
                                                        className="w-full bg-black border border-white/10 rounded-xl py-3.5 pl-10 rtl:pr-10 rtl:pl-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
                                                        placeholder="Username" 
                                                    />
                                                </div>
                                                {errors.username && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-fade-in"><AlertTriangle className="w-3 h-3"/> {errors.username}</p>}
                                                
                                                {(isCheatloop || isSinki) && !isCodCheatloop && (
                                                    <div className="flex flex-wrap gap-3 mt-4">
                                                        <a 
                                                            href={`https://wa.me/${settings.whatsapp_number?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(t.forgotUsernameMsg + (product?.title || ''))}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-2 transition-all bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-xl border border-cyan-500/20 hover:border-cyan-500/40"
                                                        >
                                                            <MessageCircle className="w-4 h-4" />
                                                            {t.forgotUsername}
                                                        </a>
                                                        <a 
                                                            href={`https://wa.me/${settings.whatsapp_number?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(t.newUserMsg + (product?.title || ''))}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs font-medium text-green-400 hover:text-green-300 flex items-center gap-2 transition-all bg-green-500/10 hover:bg-green-500/20 px-4 py-2.5 rounded-xl border border-green-500/20 hover:border-green-500/40"
                                                        >
                                                            <UserPlus className="w-4 h-4" />
                                                            {t.newUser}
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const productTitle = (product?.title || '').toLowerCase();
                                        const isCheatloop = productTitle.includes('cheatloop');
                                        const isSinki = productTitle.includes('sinki');
                                        const showUsername = showUsernameField;
                                        if (showUsername) return null;
                                        if (!showUsernameButtonVisible || !(isCheatloop || isSinki)) return null;
                                        return (
                                            <div className="mt-3">
                                                <button
                                                    onClick={() => setShowUsernameField(true)}
                                                    className="w-full py-3.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 flex items-center justify-center gap-2"
                                                >
                                                    <UserPlus className="w-4 h-4" />
                                                      {(() => {
                                                        const brand = isCheatloop ? 'Cheatloop' : (isSinki ? 'Sinki' : (product?.title || '').trim());
                                                        if (lang === 'ar') return `إدخال اسم المستخدم في ${brand}`;
                                                        if (lang === 'tr') return `Kullanıcı adını ${brand} içinde girin`;
                                                        return `Enter username in ${brand}`;
                                                      })()}
                                                </button>
                                                {errors.username && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 animate-fade-in"><AlertTriangle className="w-3 h-3"/> {errors.username}</p>}
                                            </div>
                                        );
                                    })()}

                                    <div className="pt-6 mt-auto">
                                        <div className="flex flex-col gap-3">
                                            <button 
                                                onClick={handleMethodNext} 
                                                className="group w-full relative py-4 px-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:-translate-y-0.5 overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 skew-y-12 pointer-events-none" />
                                                <div className="relative flex items-center justify-center gap-2">
                                                    <span>{t.next}</span>
                                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-6 animate-fade-in-up flex-1 flex flex-col">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 text-sm border border-cyan-500/20">2</span>
                                            {t.step2Title}
                                        </h3>
                                        <div />
                                    </div>

                                    {showUsernameStep2 && (
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm text-gray-300">يمكنك تعيين اسم المستخدم الخاص بك (اختياري)</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                                                <div className="relative">
                                                    <div className="absolute left-3 rtl:right-3 rtl:left-auto top-1/2 -translate-y-1/2 text-gray-500">
                                                        <Mail className="w-5 h-5" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={username}
                                                        onChange={(e) => { setUsername(e.target.value); setAssignError(null); setAssignSuccess(null); }}
                                                        className="w-full bg-black border border-white/10 rounded-xl py-3.5 pl-10 rtl:pr-10 rtl:pl-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                                        placeholder="Username"
                                                    />
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        setAssignError(null); setAssignSuccess(null);
                                                        if (!username.trim()) { setAssignError('اسم المستخدم مطلوب'); return; }
                                                        const productTitle = (product?.title || '').toLowerCase();
                                                        const brand = productTitle.includes('cheatloop') ? 'cheatloop' :
                                                                      productTitle.includes('sinki') ? 'sinki' : null;
                                                        if (!brand) { setAssignError('لا يمكن تحديد المنتج'); return; }
                                                        setAssignLoading(true);
                                                        try {
                                                            try {
                                                                await verifiedUserService.addVerified(username.trim(), brand);
                                                            } catch {
                                                                await verifiedUserService.updateVerifiedByIdentity(username.trim(), brand as any, true);
                                                            }
                                                            setAssignSuccess('تم تعيين اسم المستخدم بنجاح');
                                                        } catch (e: any) {
                                                            setAssignError(e?.message || 'فشل تعيين اسم المستخدم');
                                                        } finally {
                                                            setAssignLoading(false);
                                                        }
                                                    }}
                                                    disabled={assignLoading}
                                                    className="px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold disabled:opacity-50"
                                                >
                                                    {assignLoading ? 'جاري الإدخال...' : 'إدخال'}
                                                </button>
                                            </div>
                                            {assignError && <p className="mt-2 text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {assignError}</p>}
                                            {assignSuccess && <p className="mt-2 text-green-400 text-xs">{assignSuccess}</p>}
                                        </div>
                                    )}

                                    {renderPaymentMethods()}

                                    <div className="mt-auto pt-6 border-t border-white/5">
                                        <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-500/10 p-4 rounded-xl mb-6">
                                            <Info className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                            <p className="text-xs text-yellow-200/80 leading-relaxed">{t.infoNote}</p>
                                        </div>

                                        {errors.general && (
                                            errors.general === 'أنت محظور' ? (
                                                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-6">
                                                    <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                                    <div className="text-sm">
                                                        <div className="text-red-400 font-bold mb-1">أنت محظور</div>
                                                        <div className="text-red-300">لا يمكنك إتمام الشراء بسبب الحظر الحالي. إذا كان ذلك خطأً، تواصل معنا عبر واتساب لإزالة الحظر.</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center text-sm text-red-400 mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20 animate-pulse">
                                                    {errors.general === 'UNAUTHORIZED_ACCESS' || errors.general.includes('x-api-key') || errors.general.includes('401')
                                                        ? (lang === 'ar' ? 'عذراً، بوابة الدفع غير مهيأة بشكل صحيح. يرجى التواصل مع الدعم الفني.' : 'Sorry, the payment gateway is not configured correctly. Please contact support.')
                                                        : errors.general}
                                                </div>
                                            )
                                        )}

                                        <div className="pt-2">
                                            <button 
                                                onClick={handleSubmit}
                                                disabled={!selectedPaymentMethod}
                                                className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/40 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <span>{t.proceedToPurchaseButton}</span>
                                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Verification Modal */}
            {showVerificationModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowVerificationModal(false)}></div>
                    <div className="relative bg-[#0a0a0c] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl animate-fade-in">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20">
                                <AlertTriangle className="w-8 h-8 text-yellow-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-4">Username Not Verified</h2>
                            <p className="text-gray-400 mb-8 leading-relaxed">
                                Your username is not in our verified list. Please contact us on WhatsApp to verify your account.
                            </p>
                            
                            <div className="space-y-3">
                                <a 
                                    href={`https://wa.me/${settings.whatsapp_number?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(lang === 'ar' ? `مرحباً، أريد توثيق اسم المستخدم الخاص بي: ${username} لمنتج ${product?.title}` : `Hello, I want to verify my username: ${username} for product ${product?.title}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
                                >
                                    <Phone className="w-5 h-5" />
                                    <span>Contact on WhatsApp</span>
                                </a>
                                <button 
                                    onClick={() => setShowVerificationModal(false)}
                                    className="w-full py-3 text-gray-500 hover:text-white transition-colors text-sm font-medium"
                                >
                                    Go Back
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrePurchaseInfoPage;
