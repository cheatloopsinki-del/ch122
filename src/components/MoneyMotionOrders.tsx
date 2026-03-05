import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { moneyMotionService } from '../lib/moneyMotionService';
import { Search, RefreshCw, CreditCard, Clock, Copy } from 'lucide-react';

interface MMOrder {
  id: string;
  created_at: string;
  checkout_session_id: string;
  status: string;
  total_in_cents: number;
  event: string;
  customer_email?: string;
  payment_type?: string;
  card_brand?: string;
  last_four?: string;
  store_id?: string;
  raw_payload?: any;
}

const MoneyMotionOrders: React.FC = () => {
  const [orders, setOrders] = useState<MMOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [copying, setCopying] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  const extractWebhookUrl = async () => {
    try {
      const url = await moneyMotionService.getDefaultWebhookUrl();
      setWebhookUrl(url);
      setCopying(true);
      await navigator.clipboard.writeText(url);
      setTimeout(() => setCopying(false), 1200);
    } catch (e) {
      // fallback to origin if service not ready
      const fallback = `${window.location.origin}/api/moneymotion/webhook`;
      setWebhookUrl(fallback);
      setCopying(true);
      await navigator.clipboard.writeText(fallback);
      setTimeout(() => setCopying(false), 1200);
    }
  };

  const handleCreateAndLinkWebhook = async () => {
    setLinkError(null);
    setLinkSuccess(null);
    try {
      setLinking(true);
      const url = webhookUrl || await moneyMotionService.getDefaultWebhookUrl();
      if (!webhookSecret) {
        throw new Error('يرجى إدخال Webhook Secret أولاً');
      }
      // حفظ السر والرابط في إعدادات الموقع
      await moneyMotionService.updateSettings({
        moneymotion_webhook_secret: webhookSecret,
        moneymotion_webhook_url: url
      });
      // إنشاء الويب هوك عبر API وربطه بالأحداث الأساسية
      const events = ['checkout_session:new','checkout_session:complete','checkout_session:refunded','checkout_session:expired','checkout_session:disputed'];
      await moneyMotionService.createWebhook(url, webhookSecret, events);
      setLinkSuccess('تم إنشاء وربط الـ Webhook بنجاح');
    } catch (err: any) {
      setLinkError(err?.message || 'فشل إنشاء وربط الـ Webhook');
    } finally {
      setLinking(false);
    }
  };

  const load = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('money_motion_orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setOrders(data as MMOrder[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = orders.filter(o => {
    const term = q.toLowerCase();
    return (
      !term ||
      (o.customer_email || '').toLowerCase().includes(term) ||
      (o.checkout_session_id || '').toLowerCase().includes(term) ||
      (o.status || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-xl">طلبات MoneyMotion</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl border border-white/10"
          >
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          <button
            onClick={extractWebhookUrl}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl border border-white/10"
            title="استخراج ونسخ رابط الـ Webhook"
          >
            <Copy className={`w-4 h-4 ${copying ? 'animate-pulse' : ''}`} /> {copying ? 'نُسخ الرابط' : 'استخراج رابط الـ Webhook'}
          </button>
        </div>
      </div>

      {webhookUrl && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-200">
          رابط الـ Webhook الحالي: <span className="font-mono">{webhookUrl}</span>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <input
            type="text"
            placeholder="أدخل Webhook Secret (الهاش)"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="w-full px-4 py-3 bg-black border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>
        <div className="flex">
          <button
            onClick={handleCreateAndLinkWebhook}
            disabled={linking || !webhookSecret}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl border border-white/10"
          >
            {linking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />} إنشاء وربط Webhook
          </button>
        </div>
      </div>

      {linkError && (
        <div className="text-red-400 text-xs mt-2">{linkError}</div>
      )}
      {linkSuccess && (
        <div className="text-green-400 text-xs mt-2">{linkSuccess}</div>
      )}

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="بحث بالبريد أو Session ID أو الحالة..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pr-10 pl-4 py-3 bg-black border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-all"
        />
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
        <table className="w-full text-right text-sm">
          <thead className="bg-black/40 text-gray-400 border-b border-white/10 uppercase text-[10px] tracking-wider font-bold">
            <tr>
              <th className="p-4">التاريخ</th>
              <th className="p-4">البريد</th>
              <th className="p-4">Session</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">المبلغ</th>
              <th className="p-4">الطريقة</th>
              <th className="p-4">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-400">
                  جارٍ التحميل...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-400">
                  لا توجد طلبات
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 text-gray-300 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="p-4 text-white">{o.customer_email || '-'}</td>
                  <td className="p-4 font-mono text-[10px] text-gray-400">
                    {(o.checkout_session_id || '').substring(0, 12)}...
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-lg text-xs ${
                        o.status === 'completed'
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : o.status === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                          : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-cyan-400">
                    ${((o.total_in_cents || 0) / 100).toLocaleString()}
                  </td>
                  <td className="p-4 text-gray-300 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> {o.payment_type || '-'}{' '}
                    {o.card_brand ? ` (${o.card_brand} ****${o.last_four || ''})` : ''}
                  </td>
                  <td className="p-4">
                    <details>
                      <summary className="cursor-pointer text-gray-400">عرض الخام</summary>
                      <pre className="whitespace-pre-wrap break-all text-xs text-gray-500">
                        {JSON.stringify(o.raw_payload || {}, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MoneyMotionOrders;
