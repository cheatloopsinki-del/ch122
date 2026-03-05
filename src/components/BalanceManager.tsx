import React, { useEffect, useState, useMemo } from 'react';
import { brandBalancesService, BrandBalance, BalanceTransaction, ProductKey, ProductKeyCost } from '../lib/supabase';
import { DollarSign, RefreshCcw, Save, History, Eye, Info, EyeOff, Copy, Download, Search, Trash2 } from 'lucide-react';

const BalanceManager: React.FC = () => {
  const [balances, setBalances] = useState<BrandBalance[]>([]);
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({ cheatloop: '', sinki: '' });
  const [filterBrand, setFilterBrand] = useState<'all' | 'cheatloop' | 'sinki'>('all');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchKeys, setBatchKeys] = useState<Record<string, ProductKey[]>>({});
  const [activeLog, setActiveLog] = useState<'balance' | 'debits'>('balance');
  const [prices, setPrices] = useState<Record<'cheatloop' | 'sinki', ProductKeyCost[]>>({ cheatloop: [], sinki: [] });
  const [batchReveal, setBatchReveal] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchView, setBatchView] = useState<'grid' | 'list'>('grid');
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const b = await brandBalancesService.getBalances();
      setBalances(b);
      const t = await brandBalancesService.getTransactions(100);
      setTransactions(t);
      const cheatPrices = await brandBalancesService.getProductPrices('cheatloop');
      const sinkiPrices = await brandBalancesService.getProductPrices('sinki');
      setPrices({ cheatloop: cheatPrices, sinki: sinkiPrices });
      const cheat = b.find(x => x.brand === 'cheatloop');
      const sinki = b.find(x => x.brand === 'sinki');
      setInputs({
        cheatloop: cheat ? String(cheat.current_balance) : '',
        sinki: sinki ? String(sinki.current_balance) : '',
      });
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSet = async (brand: 'cheatloop' | 'sinki') => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const val = parseFloat(inputs[brand] || '0');
      const newTotal = await brandBalancesService.setTotalBalance(brand, isNaN(val) ? 0 : val);
      setSuccess(`تم تعيين الرصيد الجديد (${brand}): $${newTotal}`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => filterBrand === 'all' ? true : t.brand === filterBrand)
      .map(t => ({
        ...t,
        unitPrice: t.keys_count && t.keys_count > 0 ? Number((t.amount / t.keys_count).toFixed(2)) : null
      }));
  }, [transactions, filterBrand]);

  const toggleKeysView = async (t: BalanceTransaction) => {
    if (!t.key_batch_id) return;
    if (expandedBatchId === t.key_batch_id) {
      setExpandedBatchId(null);
      setBatchSearch('');
      setBatchReveal(false);
      return;
    }
    try {
      const keys = await brandBalancesService.getBatchKeys(t.key_batch_id);
      setBatchKeys(prev => ({ ...prev, [t.key_batch_id as string]: keys }));
      setExpandedBatchId(t.key_batch_id);
      setBatchSearch('');
      setBatchReveal(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const maskKey = (s: string) => s.length <= 8 ? s : `${s.substring(0, 4)}...${s.substring(s.length - 4)}`;

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setSuccess('تم النسخ!');
        setTimeout(() => setSuccess(null), 1500);
        return;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('copy failed');
      setSuccess('تم النسخ!');
      setTimeout(() => setSuccess(null), 1500);
    } catch {
      setError('فشل النسخ');
      setTimeout(() => setError(null), 1500);
    }
  };

  const handleCopyAllBatch = async (keys: ProductKey[]) => {
    const vals = keys.map(k => batchReveal ? (k.key_value || '') : maskKey(k.key_value || '')).filter(Boolean);
    if (vals.length === 0) return;
    await copyText(vals.join('\n'));
  };

  const handleDownloadBatch = (keys: ProductKey[]) => {
    const content = keys.map(k => batchReveal ? (k.key_value || '') : maskKey(k.key_value || '')).filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keys-${expandedBatchId || 'batch'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearLog = async () => {
    const scopeBrand = filterBrand === 'all' ? undefined : filterBrand;
    const scopeAction = activeLog === 'debits' ? 'debit' : undefined;
    const msg = activeLog === 'debits'
      ? `سيتم حذف سجلات خصم المفاتيح${scopeBrand ? ` لعلامة ${scopeBrand}` : ' لجميع العلامات'}. هل أنت متأكد؟`
      : `سيتم حذف جميع سجلات تغيّر الرصيد${scopeBrand ? ` لعلامة ${scopeBrand}` : ' لجميع العلامات'}. هل أنت متأكد؟`;
    if (!window.confirm(msg)) return;
    setClearing(true);
    setError(null);
    setSuccess(null);
    try {
      const count = await brandBalancesService.clearTransactions(scopeAction as any, scopeBrand as any);
      setSuccess(`تم حذف ${count} سجل`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600/30 to-purple-600/30 border border-white/10 text-white font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            إدارة الرصيد الإجمالي
          </div>
          <div className="hidden md:flex gap-2">
            <span className="px-2 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">Cheatloop: <span className="text-cyan-400 font-mono">${balances.find(b => b.brand === 'cheatloop')?.current_balance ?? 0}</span></span>
            <span className="px-2 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-300">Sinki: <span className="text-cyan-400 font-mono">${balances.find(b => b.brand === 'sinki')?.current_balance ?? 0}</span></span>
          </div>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors flex items-center gap-2">
          <RefreshCcw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>}
      {success && <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300 text-sm">{success}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-2xl border border-white/10 p-6 shadow-lg shadow-cyan-500/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-gray-400 text-xs">العلامة</div>
              <div className="text-white font-bold">Cheatloop</div>
            </div>
            <div className="text-right">
              <div className="text-gray-400 text-xs">الرصيد الحالي</div>
              <div className="text-cyan-400 font-mono font-bold">
                ${balances.find(b => b.brand === 'cheatloop')?.current_balance ?? 0}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">إدخال اجمالي الرصيد</label>
            <input
              value={inputs.cheatloop}
              onChange={e => setInputs({ ...inputs, cheatloop: e.target.value })}
              type="number"
              className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
              placeholder="مثال: 1000"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => handleSet('cheatloop')}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              حفظ
            </button>
          </div>
        </div>

        <div className="bg-white/5 rounded-2xl border border-white/10 p-6 shadow-lg shadow-purple-500/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-gray-400 text-xs">العلامة</div>
              <div className="text-white font-bold">Sinki</div>
            </div>
            <div className="text-right">
              <div className="text-gray-400 text-xs">الرصيد الحالي</div>
              <div className="text-cyan-400 font-mono font-bold">
                ${balances.find(b => b.brand === 'sinki')?.current_balance ?? 0}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">إدخال اجمالي الرصيد</label>
            <input
              value={inputs.sinki}
              onChange={e => setInputs({ ...inputs, sinki: e.target.value })}
              type="number"
              className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
              placeholder="مثال: 1000"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => handleSet('sinki')}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              حفظ
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <div className="flex items-center gap-2 text-white font-bold mb-3">
          <Info className="w-5 h-5 text-cyan-400" />
          قائمة أسعار المنتجات
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilterBrand('cheatloop')}
            className={`px-3 py-1 rounded-full text-xs border ${filterBrand === 'cheatloop' ? 'bg-cyan-600/20 border-cyan-500 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
          >
            Cheatloop
          </button>
          <button
            onClick={() => setFilterBrand('sinki')}
            className={`px-3 py-1 rounded-full text-xs border ${filterBrand === 'sinki' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
          >
            Sinki
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(filterBrand === 'cheatloop' ? prices.cheatloop : prices.sinki).map(p => (
            <div key={`${p.brand}-${p.product_label}`} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-gray-200 text-sm">{p.product_label}</span>
              <span className="text-cyan-400 font-mono font-bold text-sm">${p.cost}</span>
            </div>
          ))}
          {((filterBrand === 'cheatloop' ? prices.cheatloop : prices.sinki).length === 0) && (
            <div className="text-gray-500 text-xs">لا توجد أسعار معرفة في قاعدة البيانات لهذه العلامة.</div>
          )}
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveLog('balance')}
              className={`px-3 py-2 rounded-lg text-xs font-bold border ${activeLog === 'balance' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
            >
              سجل تغيّر الرصيد
            </button>
            <button
              onClick={() => setActiveLog('debits')}
              className={`px-3 py-2 rounded-lg text-xs font-bold border ${activeLog === 'debits' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
            >
              سجل احتساب المفاتيح المدخلة
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClearLog}
              disabled={clearing}
              className="px-3 py-1 rounded-lg text-xs border bg-red-600/20 border-red-500/40 text-red-200 hover:bg-red-600/30 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              تصفير السجل
            </button>
            <button
              onClick={() => setFilterBrand('all')}
              className={`px-3 py-1 rounded-lg text-xs border ${filterBrand === 'all' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilterBrand('cheatloop')}
              className={`px-3 py-1 rounded-lg text-xs border ${filterBrand === 'cheatloop' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
            >
              Cheatloop
            </button>
            <button
              onClick={() => setFilterBrand('sinki')}
              className={`px-3 py-1 rounded-lg text-xs border ${filterBrand === 'sinki' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
            >
              Sinki
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left p-2">التاريخ</th>
                <th className="text-left p-2">العلامة</th>
                <th className="text-left p-2">العملية</th>
                <th className="text-left p-2">المنتج</th>
                <th className="text-left p-2">المبلغ</th>
                <th className="text-left p-2">قبل</th>
                <th className="text-left p-2">بعد</th>
                <th className="text-left p-2">ملاحظة</th>
                {activeLog === 'debits' && (
                  <>
                    <th className="text-left p-2">عدد المفاتيح</th>
                    <th className="text-left p-2">السعر/مفتاح</th>
                    <th className="text-left p-2">عرض المفاتيح</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(activeLog === 'balance' ? filteredTransactions : filteredTransactions.filter(t => t.action === 'debit')).map(t => (
                <>
                  <tr key={t.id} className="border-t border-white/10">
                    <td className="p-2 text-gray-300">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="p-2 text-white font-bold">{t.brand}</td>
                    <td className={`p-2 font-bold ${t.action === 'debit' ? 'text-red-400' : t.action === 'credit' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {t.action}
                    </td>
                    <td className="p-2 text-gray-300">{t.product_title || '-'}</td>
                    <td className="p-2 text-gray-300">${t.amount}</td>
                    <td className="p-2 text-gray-300">{t.balance_before != null ? `$${t.balance_before}` : '-'}</td>
                    <td className="p-2 text-gray-300">{t.balance_after != null ? `$${t.balance_after}` : '-'}</td>
                    <td className="p-2 text-gray-300">{t.note || '-'}</td>
                    {activeLog === 'debits' && (
                      <>
                        <td className="p-2 text-gray-300">{t.keys_count ?? '-'}</td>
                        <td className="p-2 text-gray-300">{t.unitPrice != null ? `$${t.unitPrice}` : '-'}</td>
                        <td className="p-2">
                          {t.action === 'debit' && t.key_batch_id ? (
                            <button
                              onClick={() => toggleKeysView(t)}
                              className="px-3 py-1 rounded-lg bg-black/40 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                              title="عرض المفاتيح المضافة في هذه العملية"
                            >
                              <Eye className="w-4 h-4" />
                              عرض
                            </button>
                          ) : <span className="text-gray-500">—</span>}
                        </td>
                      </>
                    )}
                  </tr>
                  {activeLog === 'debits' && expandedBatchId === t.key_batch_id && (
                    <tr>
                      <td colSpan={activeLog === 'debits' ? 11 : 8} className="p-3 bg-black/40 border-t border-white/10">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <button
                            onClick={() => setBatchReveal(!batchReveal)}
                            className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-xs flex items-center gap-2 hover:bg-white/10 transition-colors"
                          >
                            {batchReveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {batchReveal ? 'إخفاء المفاتيح' : 'إظهار المفاتيح'}
                          </button>
                          <button
                            onClick={() => handleCopyAllBatch(batchKeys[t.key_batch_id as string] || [])}
                            className="px-3 py-1 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-200 text-xs flex items-center gap-2 hover:bg-cyan-600/30 transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                            نسخ الكل
                          </button>
                          <button
                            onClick={() => handleDownloadBatch(batchKeys[t.key_batch_id as string] || [])}
                            className="px-3 py-1 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs flex items-center gap-2 hover:bg-purple-600/30 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            تنزيل TXT
                          </button>
                          <div className="flex items-center bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                            <div className="px-2 text-gray-400">
                              <Search className="w-4 h-4" />
                            </div>
                            <input
                              value={batchSearch}
                              onChange={e => setBatchSearch(e.target.value)}
                              placeholder="بحث في المفاتيح"
                              className="px-2 py-1 bg-transparent text-white text-xs focus:outline-none"
                            />
                          </div>
                          <div className="ml-auto flex gap-1">
                            <button
                              onClick={() => setBatchView('grid')}
                              className={`px-2 py-1 rounded-lg text-xs border ${batchView === 'grid' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
                            >
                              شبكة
                            </button>
                            <button
                              onClick={() => setBatchView('list')}
                              className={`px-2 py-1 rounded-lg text-xs border ${batchView === 'list' ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-gray-300'}`}
                            >
                              قائمة
                            </button>
                          </div>
                        </div>
                        {(() => {
                          const all = batchKeys[t.key_batch_id as string] || [];
                          const filtered = all.filter(k => {
                            const val = batchReveal ? (k.key_value || '') : maskKey(k.key_value || '');
                            return batchSearch ? val.toLowerCase().includes(batchSearch.toLowerCase()) : true;
                          }).sort((a, b) => {
                            if (a.is_used !== b.is_used) return a.is_used ? 1 : -1;
                            return (a.key_value || '').localeCompare(b.key_value || '');
                          });
                          if (filtered.length === 0) {
                            return <div className="text-gray-500 text-xs">لا توجد مفاتيح مسجلة لهذه الدفعة أو لا تطابق نتائج البحث.</div>;
                          }
                          if (batchView === 'grid') {
                            return (
                              <div className="grid md:grid-cols-3 gap-2">
                                {filtered.map(k => (
                                  <div key={k.id} className={`p-2 bg-white/5 border rounded-lg text-gray-200 font-mono text-xs flex items-center justify-between ${k.is_used ? 'border-red-500/30' : 'border-green-500/30'}`}>
                                    <span className="truncate">{batchReveal ? k.key_value : maskKey(k.key_value)}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] ${k.is_used ? 'bg-red-600/20 text-red-300' : 'bg-green-600/20 text-green-300'}`}>{k.is_used ? 'مستخدم' : 'متاح'}</span>
                                      <button onClick={() => copyText(k.key_value || '')} className="p-1 bg-black/40 border border-white/10 rounded hover:bg-white/10 transition-colors">
                                        <Copy className="w-3.5 h-3.5 text-gray-300" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="text-left p-2">المفتاح</th>
                                    <th className="text-left p-2">الحالة</th>
                                    <th className="text-left p-2">البريد المستخدم</th>
                                    <th className="text-left p-2">تاريخ الاستخدام</th>
                                    <th className="text-left p-2">نسخ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filtered.map(k => (
                                    <tr key={k.id} className="border-t border-white/10">
                                      <td className="p-2 font-mono text-gray-200">{batchReveal ? k.key_value : maskKey(k.key_value)}</td>
                                      <td className="p-2">{k.is_used ? <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-300">مستخدم</span> : <span className="px-2 py-0.5 rounded bg-green-600/20 text-green-300">متاح</span>}</td>
                                      <td className="p-2 text-gray-300">{k.used_by_email || '-'}</td>
                                      <td className="p-2 text-gray-300">{k.used_at ? new Date(k.used_at).toLocaleString() : '-'}</td>
                                      <td className="p-2">
                                        <button onClick={() => copyText(k.key_value || '')} className="px-2 py-1 rounded bg-black/40 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors">
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td className="p-3 text-center text-gray-500" colSpan={9}>لا يوجد سجلات حالياً</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BalanceManager;
