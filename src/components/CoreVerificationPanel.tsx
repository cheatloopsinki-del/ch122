import React, { useEffect, useMemo, useState } from 'react';
import { coreVerificationService, CoreOverviewRow, CoreLogRow, CoreBanRow, verifiedStatusService } from '../lib/supabase';
import { ShieldCheck, ShieldAlert, Search, RefreshCw, Filter, Ban, CheckCircle, XCircle, Eye, EyeOff, AlertCircle, Check, Layers, Lock } from 'lucide-react';

type Section = 'overview' | 'logs' | 'bans' | 'users';

const CoreVerificationPanel: React.FC = () => {
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [productType, setProductType] = useState<'cheatloop' | 'sinki' | ''>('');
  const [verified, setVerified] = useState<boolean | ''>('');
  const [banned, setBanned] = useState<boolean | ''>('');
  const [suspicion, setSuspicion] = useState<boolean | ''>('');

  const [overview, setOverview] = useState<CoreOverviewRow[]>([]);
  const [logs, setLogs] = useState<CoreLogRow[]>([]);
  const [bans, setBans] = useState<CoreBanRow[]>([]);
  const [users, setUsers] = useState<CoreOverviewRow[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, boolean>>({});
  const [logsUser, setLogsUser] = useState<string | null>(null);
  const [logsProduct, setLogsProduct] = useState<'cheatloop' | 'sinki' | ''>('');
  const [logsSort, setLogsSort] = useState<'date_desc' | 'date_asc' | 'suspicion_first' | 'verified_first'>('date_desc');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<CoreLogRow | null>(null);

  const loadOverview = async () => {
    setLoading(true); setError(null);
    try {
      const data = await coreVerificationService.fetchOverview({
        q: q || undefined,
        product_type: productType || undefined,
        verified: verified === '' ? undefined : verified,
        banned: banned === '' ? undefined : banned,
        suspicion: suspicion === '' ? undefined : suspicion
      });
      setOverview(data);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل النظرة العامة');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLoading(true); setError(null);
    try {
      const data = await coreVerificationService.fetchLogs({
        username: logsUser || undefined,
        product_type: (logsProduct || productType || '') as any || undefined,
        verified: verified === '' ? undefined : verified,
        suspicion: suspicion === '' ? undefined : suspicion
      });
      let out = [...data];
      if (logsSort === 'date_desc') {
        out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (logsSort === 'date_asc') {
        out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      } else if (logsSort === 'suspicion_first') {
        out.sort((a, b) => (b.suspicion ? 1 : 0) - (a.suspicion ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (logsSort === 'verified_first') {
        out.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
      setLogs(out);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل السجلات');
    } finally {
      setLoading(false);
    }
  };

  const loadBans = async () => {
    setLoading(true); setError(null);
    try {
      const data = await coreVerificationService.fetchActiveBans();
      setBans(data);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل الحظر');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'overview' || section === 'users') loadOverview();
    if (section === 'logs') loadLogs();
    if (section === 'bans') loadBans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const filteredUsers = useMemo(() => {
    return overview;
  }, [overview]);

  const handleUnban = async (cpuid: string) => {
    if (!confirm(`تأكيد فك الحظر للجهاز:\n${cpuid}`)) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await coreVerificationService.unbanDevice(cpuid);
      const userRow = overview.find(r => r.cpuid === cpuid);
      if (userRow) {
        await coreVerificationService.addLog({ username: userRow.username, product_type: userRow.product_type, cpuid, verified: userRow.verified_flag, suspicion: false, report_summary: 'فك حظر' });
      }
      setSuccess('تم فك الحظر بنجاح');
      await loadBans(); await loadOverview();
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: any) {
      setError(e?.message || 'فشل فك الحظر');
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async (cpuid: string, reason: string, username?: string, product_type?: 'cheatloop' | 'sinki') => {
    if (!cpuid || !reason) return;
    if (!confirm(`تأكيد الحظر للجهاز:\n${cpuid}\nالسبب: ${reason}`)) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await coreVerificationService.banDevice({ cpuid, reason, username, product_type });
      if (username && product_type) {
        await coreVerificationService.addLog({ username, product_type, cpuid, verified: false, suspicion: true, report_summary: `حظر: ${reason}` });
      }
      setSuccess('تم الحظر بنجاح');
      // تحديث متفائل للحالة في النظرة العامة
      setOverview(prev => prev.map(r => r.cpuid === cpuid ? { ...r, banned: true, reason } : r));
      await loadBans(); await loadOverview();
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: any) {
      setError(e?.message || 'فشل الحظر');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateVerified = async (username: string, product_type: 'cheatloop' | 'sinki', next: boolean) => {
    if (!confirm(`تأكيد تغيير حالة التوثيق: ${next ? 'مُوثّق' : 'غير مُوثّق'}`)) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      await coreVerificationService.updateVerifiedByIdentity(username, product_type, next);
      const cp = overview.find(r => r.username === username && r.product_type === product_type)?.cpuid || null;
      await coreVerificationService.addLog({ username, product_type, cpuid: cp || undefined, verified: next, suspicion: false, report_summary: 'تغيير يدوي من المشرف' });
      setSuccess('تم تحديث حالة التوثيق');
      await loadOverview(); await loadLogs();
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: any) {
      setError(e?.message || 'فشل تحديث حالة التوثيق');
    } finally {
      setLoading(false);
    }
  };

  const StatsBar = useMemo(() => {
    const total = overview.length;
    const verifiedCount = overview.filter(r => r.verified_flag).length;
    const unverifiedCount = total - verifiedCount;
    const suspiciousCount = overview.filter(r => r.any_suspicion).length;
    const withCpu = overview.filter(r => !!r.cpuid).length;
    return (
      <div className="grid md:grid-cols-5 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-xs text-gray-400">إجمالي</div>
          <div className="text-white text-lg font-bold">{total}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-xs text-gray-400">موثّق</div>
          <div className="text-green-400 text-lg font-bold">{verifiedCount}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-xs text-gray-400">غير موثّق</div>
          <div className="text-red-400 text-lg font-bold">{unverifiedCount}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-xs text-gray-400">اشتباه</div>
          <div className="text-yellow-400 text-lg font-bold">{suspiciousCount}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-xs text-gray-400">مع CPU</div>
          <div className="text-blue-400 text-lg font-bold">{withCpu}</div>
        </div>
      </div>
    );
  }, [overview]);

  const OverviewFilters = (
    <div className="grid md:grid-cols-7 gap-3">
      <div className="md:col-span-2 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم / المنتج / CPUID" className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500" />
      </div>
      <select value={productType} onChange={e => setProductType(e.target.value as any)} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">كل المنتجات</option>
        <option value="cheatloop">Cheatloop</option>
        <option value="sinki">Sinki</option>
      </select>
      <select value={verified === '' ? '' : verified ? 'true' : 'false'} onChange={e => setVerified(e.target.value === '' ? '' : e.target.value === 'true')} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">كل حالات التوثيق</option>
        <option value="true">مُوثّق</option>
        <option value="false">غير مُوثّق</option>
      </select>
      <select value={banned === '' ? '' : banned ? 'true' : 'false'} onChange={e => setBanned(e.target.value === '' ? '' : e.target.value === 'true')} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">الحظر</option>
        <option value="true">محظور</option>
        <option value="false">غير محظور</option>
      </select>
      <select value={suspicion === '' ? '' : suspicion ? 'true' : 'false'} onChange={e => setSuspicion(e.target.value === '' ? '' : e.target.value === 'true')} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">الاشتباه</option>
        <option value="true">مُشتبه</option>
        <option value="false">نظيف</option>
      </select>
      <button onClick={() => loadOverview()} className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
      </button>
    </div>
  );

  const LogsFilters = (
    <div className="grid md:grid-cols-6 gap-3">
      <div className="md:col-span-2 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={logsUser || ''} onChange={e => setLogsUser(e.target.value || null)} placeholder="بحث بالاسم" className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500" />
      </div>
      <select value={logsProduct || ''} onChange={e => setLogsProduct(e.target.value as any)} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">كل المنتجات</option>
        <option value="cheatloop">Cheatloop</option>
        <option value="sinki">Sinki</option>
      </select>
      <select value={verified === '' ? '' : verified ? 'true' : 'false'} onChange={e => setVerified(e.target.value === '' ? '' : e.target.value === 'true')} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">كل حالات التوثيق</option>
        <option value="true">مُوثّق</option>
        <option value="false">غير مُوثّق</option>
      </select>
      <select value={suspicion === '' ? '' : suspicion ? 'true' : 'false'} onChange={e => setSuspicion(e.target.value === '' ? '' : e.target.value === 'true')} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="">الاشتباه</option>
        <option value="true">مُشتبه</option>
        <option value="false">نظيف</option>
      </select>
      <select value={logsSort} onChange={e => setLogsSort(e.target.value as any)} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="date_desc">الأحدث أولًا</option>
        <option value="date_asc">الأقدم أولًا</option>
        <option value="suspicion_first">الاشتباه أولًا</option>
        <option value="verified_first">المُوثّقون أولًا</option>
      </select>
      <button onClick={() => loadLogs()} className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">إدارة التوثيق</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSection('overview')} className={`px-3 py-2 rounded-xl text-sm ${section==='overview' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-300'}`}>نظرة عامة</button>
          <button onClick={() => setSection('users')} className={`px-3 py-2 rounded-xl text-sm ${section==='users' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-300'}`}>المستخدمون</button>
          <button onClick={() => setSection('logs')} className={`px-3 py-2 rounded-xl text-sm ${section==='logs' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-300'}`}>السجلات</button>
          <button onClick={() => setSection('bans')} className={`px-3 py-2 rounded-xl text-sm ${section==='bans' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-300'}`}>الحظر</button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl">{error}</div>}
      {success && <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-xl">{success}</div>}

      {section === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-bold">مرشحات النظرة العامة</div>
              <button onClick={() => { setQ(''); setProductType(''); setVerified(''); setBanned(''); setSuspicion(''); }} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 text-xs">إعادة ضبط</button>
            </div>
            {OverviewFilters}
          </div>
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <div className="text-white font-bold mb-3">إحصائيات سريعة</div>
            {StatsBar}
          </div>
        </div>
      )}
      {section === 'logs' && (
        <div className="space-y-4">
          {LogsFilters}
        </div>
      )}

      {section === 'overview' && (
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-black/40 text-gray-400 text-xs font-bold uppercase">
                <tr>
                  <th className="p-3">اسم المستخدم</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3 text-center">توثيق</th>
                  <th className="p-3 text-center">اشتباه</th>
                  <th className="p-3 text-center">محظور</th>
                  <th className="p-3">CPU ID</th>
                  <th className="p-3">آخر محاولة</th>
                  <th className="p-3">آخر تسجيل</th>
                  <th className="p-3">آخر IP</th>
                  <th className="p-3">ملخص أخير</th>
                  <th className="p-3 text-center">المحاولات</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {overview.map((row) => (
                  <tr key={`${row.username}-${row.product_type}`} className="hover:bg-white/5">
                    <td className="p-3 font-bold text-white">{row.username}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.product_type==='cheatloop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                        {row.product_type}
                      </span>
                    </td>
                    <td className="p-3 text-center">{row.verified_flag ? <CheckCircle className="w-4 h-4 text-green-400 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}</td>
                    <td className="p-3 text-center">{row.any_suspicion ? <AlertCircle className="w-4 h-4 text-yellow-400 inline" /> : <Check className="w-4 h-4 text-green-400 inline" />}</td>
                    <td className="p-3 text-center">{row.banned ? <Ban className="w-4 h-4 text-red-400 inline" /> : <Check className="w-4 h-4 text-green-400 inline" />}</td>
                    <td className="p-3 font-mono text-xs text-gray-300">{row.cpuid || '-'}</td>
                    <td className="p-3 text-xs text-gray-300">{row.last_attempt ? new Date(row.last_attempt).toLocaleString('ar-EG') : '-'}</td>
                    <td className="p-3 text-xs text-gray-300">{row.latest_created_at ? new Date(row.latest_created_at).toLocaleString('ar-EG') : '-'}</td>
                    <td className="p-3 text-xs text-gray-300">{row.latest_ip || '-'}</td>
                    <td className="p-3 text-xs text-gray-300">
                      {row.latest_report_summary ? (
                        <button
                          onClick={() => {
                            setSummaryData({
                              id: `${row.username}-${row.product_type}-${row.latest_created_at || row.last_attempt || ''}`,
                              username: row.username,
                              product_type: row.product_type,
                              cpuid: row.cpuid || null,
                              verified: !!row.verified_flag,
                              suspicion: !!row.any_suspicion,
                              report_summary: row.latest_report_summary || null,
                              created_at: (row.latest_created_at || row.last_attempt || new Date().toISOString())
                            });
                            setSummaryOpen(true);
                          }}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 text-xs"
                        >
                          عرض الملخص
                        </button>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center text-xs text-gray-300">{row.attempts_count ?? 0}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => { setLogsUser(row.username); setLogsProduct(row.product_type); setSection('logs'); setQ(''); loadLogs(); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs border border-white/10">سجلات</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {overview.length === 0 && (
                  <tr><td className="p-8 text-center text-gray-500" colSpan={10}>لا توجد بيانات مطابقة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'logs' && (
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-black/40 text-gray-400 text-xs font-bold uppercase">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الاسم</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3">CPU ID</th>
                  <th className="p-3 text-center">توثيق</th>
                  <th className="p-3 text-center">اشتباه</th>
                  <th className="p-3">ملخص التقرير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5">
                    <td className="p-3 text-xs text-gray-300">{new Date(log.created_at).toLocaleString('en-GB')}</td>
                    <td className="p-3 font-bold text-white">{log.username}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.product_type==='cheatloop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>{log.product_type}</span></td>
                    <td className="p-3 font-mono text-xs text-gray-300">{log.cpuid || '-'}</td>
                    <td className="p-3 text-center">{log.verified ? <CheckCircle className="w-4 h-4 text-green-400 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}</td>
                    <td className="p-3 text-center">{log.suspicion ? <AlertCircle className="w-4 h-4 text-yellow-400 inline" /> : <Check className="w-4 h-4 text-green-400 inline" />}</td>
                    <td className="p-3 text-xs text-gray-300">
                      {log.report_summary ? (
                        <button
                          onClick={() => { setSummaryData(log); setSummaryOpen(true); }}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 text-xs"
                        >
                          عرض الملخص
                        </button>
                      ) : (
                        <span className="text-gray-500">لا يوجد</span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td className="p-8 text-center text-gray-500" colSpan={7}>لا توجد سجلات</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'bans' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Ban className="w-5 h-5 text-red-400" /> حظر يدوي</h3>
            <BanForm onSubmit={handleBan} />
          </div>
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-black/40 text-gray-400 text-xs font-bold uppercase">
                  <tr>
                    <th className="p-3">CPU ID</th>
                    <th className="p-3">الاسم</th>
                    <th className="p-3">المنتج</th>
                    <th className="p-3">السبب</th>
                    <th className="p-3">تاريخ الإنشاء</th>
                    <th className="p-3">تاريخ الرفع</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bans.map((b) => (
                    <tr key={b.id} className="hover:bg-white/5">
                      <td className="p-3 font-mono text-xs text-gray-300">{b.cpuid}</td>
                      <td className="p-3 font-bold text-white">{b.username || '-'}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${b.product_type==='cheatloop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>{b.product_type}</span></td>
                      <td className="p-3 text-xs text-gray-300">{b.reason || '-'}</td>
                      <td className="p-3 text-xs text-gray-300">{new Date(b.created_at).toLocaleString('en-GB')}</td>
                      <td className="p-3 text-xs text-gray-300">{b.lifted_at ? new Date(b.lifted_at).toLocaleString('en-GB') : '-'}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleUnban(b.cpuid)} className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-xs border border-red-600/30">فك الحظر</button>
                      </td>
                    </tr>
                  ))}
                  {bans.length === 0 && <tr><td className="p-8 text-center text-gray-500" colSpan={7}>لا توجد حالات حظر نشطة</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'users' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <h3 className="text-white font-bold mb-3">إضافة موثّق</h3>
            <AddVerifiedForm onAdd={async (username, product_type) => {
              setLoading(true); setError(null); setSuccess(null);
              try {
                await coreVerificationService.addVerified(username, product_type);
                setSuccess('تم إضافة الموثّق بنجاح');
                loadOverview();
                setTimeout(() => setSuccess(null), 1500);
              } catch (e: any) {
                setError(e?.message || 'فشل إضافة الموثّق');
              } finally {
                setLoading(false);
              }
            }} onAddMany={async (list, product_type) => {
              setLoading(true); setError(null); setSuccess(null);
              try {
                const count = await coreVerificationService.addVerifiedMany(list, product_type);
                setSuccess(`تمت إضافة ${count} من القائمة`);
                loadOverview();
                setTimeout(() => setSuccess(null), 1500);
              } catch (e: any) {
                setError(e?.message || 'فشل إضافة القائمة');
              } finally {
                setLoading(false);
              }
            }} />
          </div>

          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <div className="text-xs text-gray-400">المحدد: {Object.values(selectedUsers).filter(Boolean).length}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const toDelete = overview.filter(r => selectedUsers[`${r.username}::${r.product_type}`]);
                    if (toDelete.length === 0) return;
                    if (!confirm(`تأكيد حذف ${toDelete.length} مستخدمًا؟`)) return;
                    setLoading(true); setError(null); setSuccess(null);
                    try {
                      for (const r of toDelete) {
                        await coreVerificationService.deleteUser(r.username, r.product_type);
                      }
                      setSuccess('تم حذف المحددين');
                      setSelectedUsers({});
                      await loadOverview();
                      setTimeout(() => setSuccess(null), 1500);
                    } catch (e: any) {
                      setError(e?.message || 'فشل الحذف الجماعي');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-sm ${Object.values(selectedUsers).filter(Boolean).length ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-300'}`}
                  disabled={!Object.values(selectedUsers).filter(Boolean).length}
                >
                  حذف المحددين
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-black/40 text-gray-400 text-xs font-bold uppercase">
                  <tr>
                    <th className="p-3">
                      <input
                        type="checkbox"
                        checked={overview.length > 0 && overview.every(r => selectedUsers[`${r.username}::${r.product_type}`])}
                        onChange={e => {
                          const all: Record<string, boolean> = {};
                          if (e.target.checked) {
                            for (const r of overview) all[`${r.username}::${r.product_type}`] = true;
                          }
                          setSelectedUsers(all);
                        }}
                      />
                    </th>
                    <th className="p-3">الاسم</th>
                    <th className="p-3">المنتج</th>
                    <th className="p-3">CPU ID</th>
                    <th className="p-3 text-center">توثيق</th>
                        <th className="p-3 text-center">الحظر</th>
                        <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((row) => (
                    <tr key={`u-${row.username}-${row.product_type}`} className="hover:bg-white/5">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={!!selectedUsers[`${row.username}::${row.product_type}`]}
                          onChange={e => {
                            const key = `${row.username}::${row.product_type}`;
                            setSelectedUsers(prev => ({ ...prev, [key]: e.target.checked }));
                          }}
                        />
                      </td>
                      <td className="p-3 font-bold text-white">{row.username}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.product_type==='cheatloop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                          {row.product_type}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-300">{row.cpuid || '-'}</td>
                      <td className="p-3 text-center">{row.verified_flag ? <CheckCircle className="w-4 h-4 text-green-400 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}</td>
                      <td className="p-3 text-center">
                        {row.banned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold">
                            <ShieldAlert className="w-3 h-3" /> محظور
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold">
                            <ShieldCheck className="w-3 h-3" /> غير محظور
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleUpdateVerified(row.username, row.product_type, !row.verified_flag)} className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 rounded-lg text-xs border border-cyan-600/30">تبديل التوثيق</button>
                        <button
                          onClick={async () => {
                            setLoading(true); setError(null); setSuccess(null);
                            try {
                              await verifiedStatusService.setIdentityBan(row.username, row.product_type, !row.banned);
                              setSuccess(!row.banned ? 'تم حظر المستخدم' : 'تم إلغاء الحظر');
                              await loadOverview();
                              setTimeout(() => setSuccess(null), 1500);
                            } catch (e: any) {
                              setError(e?.message || 'فشل تعديل الحظر');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className={`ml-2 px-2 py-1 rounded-lg text-xs border ${row.banned ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border-green-600/30' : 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-600/30'}`}
                        >
                          {row.banned ? 'إلغاء الحظر' : 'حظر'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && <tr><td className="p-8 text-center text-gray-500" colSpan={5}>لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {summaryOpen && summaryData && (
        <ReportSummaryModal
          log={summaryData}
          onClose={() => { setSummaryOpen(false); setSummaryData(null); }}
        />
      )}
    </div>
  );
};

const BanForm: React.FC<{ onSubmit: (cpuid: string, reason: string, username?: string, product_type?: 'cheatloop' | 'sinki') => void }> = ({ onSubmit }) => {
  const [cpuid, setCpuid] = useState('');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [productType, setProductType] = useState<'cheatloop' | 'sinki'>('cheatloop');
  return (
    <div className="grid md:grid-cols-5 gap-3">
      <input value={cpuid} onChange={e => setCpuid(e.target.value)} placeholder="CPU ID" className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm" />
      <input value={username} onChange={e => setUsername(e.target.value)} placeholder="اسم المستخدم (اختياري)" className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm" />
      <select value={productType} onChange={e => setProductType(e.target.value as any)} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="cheatloop">Cheatloop</option>
        <option value="sinki">Sinki</option>
      </select>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب الحظر" className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm" />
      <button onClick={() => onSubmit(cpuid.trim(), reason.trim(), username.trim() || undefined, productType)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl">حظر</button>
    </div>
  );
};

export default CoreVerificationPanel;

const AddVerifiedForm: React.FC<{ onAdd: (username: string, product_type: 'cheatloop' | 'sinki') => void; onAddMany: (list: string[], product_type: 'cheatloop' | 'sinki') => void }> = ({ onAdd, onAddMany }) => {
  const [username, setUsername] = useState('');
  const [productType, setProductType] = useState<'cheatloop' | 'sinki'>('cheatloop');
  const [bulk, setBulk] = useState('');
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <input value={username} onChange={e => setUsername(e.target.value)} placeholder="اسم المستخدم" className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm" />
      <select value={productType} onChange={e => setProductType(e.target.value as any)} className="px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm">
        <option value="cheatloop">Cheatloop</option>
        <option value="sinki">Sinki</option>
      </select>
      <button onClick={() => username && onAdd(username.trim(), productType)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl">إضافة</button>
      <div className="md:col-span-3">
        <textarea value={bulk} onChange={e => setBulk(e.target.value)} placeholder="قائمة أسماء (كل سطر اسم)" className="w-full px-3 py-2 bg-black border border-white/10 rounded-xl text-white text-sm min-h-[100px]" />
        <div className="flex justify-end mt-2">
          <button onClick={() => bulk.trim() && onAddMany(bulk.split('\n'), productType)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl">إضافة القائمة</button>
        </div>
      </div>
    </div>
  );
};

const ReportSummaryModal: React.FC<{ log: CoreLogRow; onClose: () => void }> = ({ log, onClose }) => {
  const text = (log.report_summary || '').trim();
  const lines = text ? text.split('\n').map(l => l.trim()).filter(Boolean) : [];
  const groups: { title: string; items: string[] }[] = [];
  let cur = { title: 'عام', items: [] as string[] };
  for (const ln of lines) {
    const isHeader = ln.endsWith(':') || (/^نتائج|^عمليات|^خدمات|^ملفات|^تحقق|^الفحص|^Downloads|^Desktop|^الأقراص|^الإصدارات|^التوقيع/i).test(ln);
    if (isHeader) {
      if (cur.items.length) groups.push(cur);
      cur = { title: ln.replace(/:$/, ''), items: [] };
    } else {
      cur.items.push(ln);
    }
  }
  if (cur.items.length) groups.push(cur);
  const colorOf = (s: string) => {
    const t = s.toLowerCase();
    if (t.includes('ok') || t.includes('لا يوجد') || t.includes('نظيف')) return 'text-green-400';
    if (t.includes('مشكوك') || t.includes('اشتباه') || t.includes('كشف')) return 'text-yellow-400';
    if (t.includes('خطأ') || t.includes('فشل')) return 'text-red-400';
    return 'text-gray-300';
  };
  const badgeOf = (s: string) => {
    const t = s.toLowerCase();
    if (t.includes('ok') || t.includes('لا يوجد') || t.includes('نظيف')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (t.includes('مشكوك') || t.includes('اشتباه') || t.includes('كشف')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (t.includes('خطأ') || t.includes('فشل')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-white/5 text-gray-300 border-white/10';
  };
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl bg-black rounded-2xl border border-white/10 shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="text-white font-bold">{log.username}</div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${log.product_type==='cheatloop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>{log.product_type}</span>
              <span className="text-xs text-gray-300 font-mono">{log.cpuid || '-'}</span>
              <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString('en-GB')}</span>
            </div>
            <button onClick={onClose} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/10 text-xs">
              إغلاق
            </button>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-4">
              {log.verified ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
              {log.suspicion ? <AlertCircle className="w-4 h-4 text-yellow-400" /> : <Check className="w-4 h-4 text-green-400" />}
            </div>
            {text ? (
              <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-3">
                {groups.map((sec, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="text-white font-bold text-sm">{sec.title}</div>
                    <div className="mt-2 space-y-1">
                      {sec.items.map((it, j) => (
                        <div key={j} className={`flex items-start gap-2 text-xs`}>
                          <span className={`px-2 py-0.5 rounded-full border ${badgeOf(it)}`}>{it.includes(':') ? it.split(':')[0] : 'حالة'}</span>
                          <span className={`${colorOf(it)} break-words`}>{it.includes(':') ? it.split(':').slice(1).join(':').trim() : it}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">لا يوجد ملخص</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
