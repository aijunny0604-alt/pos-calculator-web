import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, FileText, Upload, Trash2, X, Link2, Building, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadCertToLibrary, deleteImages } from '@/lib/imageUpload';

// PDF 판정 — url 확장자 또는 storage_path(확장자 숨겨진 URL 대비)
const isPdf = (cert) => /\.pdf($|\?)/i.test(cert?.url || '') || /\.pdf$/i.test(cert?.storage_path || '');

/**
 * 사업자등록증 보관함 — 업로드해둔 모든 등록증을 상호명으로 검색·열람.
 * 거래처와 매칭된 건은 거래처 상세에도 연결됨.
 */
export default function CertLibrary({ customers = [], showToast }) {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'linked' | 'unlinked'
  const [viewer, setViewer] = useState(null);   // 확대 볼 cert
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false); // 연결 변경 in-flight 잠금
  const fileRef = useRef(null);

  // 거래처명 해결 — 임베드(customers) 실패 시 customers prop으로 폴백
  const custName = (cert) =>
    cert?.customers?.name ||
    customers.find((x) => String(x.id) === String(cert?.customer_id))?.name ||
    '거래처 연결됨';

  const load = async () => {
    setLoading(true);
    const res = await supabase.getBusinessCerts();
    if (res && res.needsMigration) { setNeedsMigration(true); setCerts([]); }
    else { setNeedsMigration(false); setCerts(Array.isArray(res) ? res : []); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s/g, '');
    return certs.filter((c) => {
      if (filter === 'linked' && !c.customer_id) return false;
      if (filter === 'unlinked' && c.customer_id) return false;
      if (!q) return true;
      const hay = ((c.name || '') + (c.customers?.name || '')).toLowerCase().replace(/\s/g, '');
      return hay.includes(q);
    });
  }, [certs, search, filter]);

  const linkedCount = certs.filter((c) => c.customer_id).length;

  // 거래처 연결 변경 — 1거래처=1등록증 유지, 이전 거래처 정리, 연속클릭 잠금
  const handleLink = async (cert, customerId) => {
    if (linking) return;
    const prevCustomerId = cert.customer_id;
    if (String(prevCustomerId || '') === String(customerId || '')) return; // 변화 없음
    setLinking(true);
    try {
      const res = await supabase.updateBusinessCert(cert.id, { customerId: customerId || null });
      if (!res.ok) { showToast?.('연결 실패: ' + (res.error || ''), 'error'); return; }

      // ① 이전 거래처(A→다른값)의 등록증 링크 비우기
      if (prevCustomerId && String(prevCustomerId) !== String(customerId)) {
        await supabase.setCustomerCert(prevCustomerId, null, null);
      }

      // ② 새 거래처에 연결 시: 같은 거래처를 이미 가리키던 다른 등록증 행 해제(1:1 유지)
      let displaced = [];
      if (customerId) {
        displaced = certs.filter((c) => c.id !== cert.id && String(c.customer_id) === String(customerId));
        for (const d of displaced) await supabase.updateBusinessCert(d.id, { customerId: null });
        const cr = await supabase.setCustomerCert(customerId, cert.url, cert.storage_path);
        if (!cr.ok) showToast?.('연결은 됐지만 거래처 상세 반영 실패' + (cr.needsMigration ? ' (컬럼 없음)' : ''), 'error');
      }

      const cust = customers.find((x) => String(x.id) === String(customerId));
      const displacedIds = new Set(displaced.map((d) => d.id));
      setCerts((prev) => prev.map((c) => {
        if (c.id === cert.id) return { ...c, customer_id: customerId || null, customers: cust ? { name: cust.name } : null };
        if (displacedIds.has(c.id)) return { ...c, customer_id: null, customers: null };
        return c;
      }));
      setViewer((v) => v && v.id === cert.id
        ? { ...v, customer_id: customerId || null, customers: cust ? { name: cust.name } : null } : v);
      showToast?.(customerId ? `"${cust?.name}"에 연결됨` : '연결 해제됨', 'success');
    } finally {
      setLinking(false);
    }
  };

  // 삭제 (보관함 + Storage + 거래처 연결 해제)
  const handleDelete = async (cert) => {
    if (!window.confirm(`"${cert.name}" 등록증을 삭제할까요?\n(보관함에서 제거되고 연결된 거래처에서도 사라집니다)`)) return;
    // DB 삭제 먼저 — 실패하면 아무것도 건드리지 않음(정합성)
    const del = await supabase.deleteBusinessCert(cert.id);
    if (!del.ok) { showToast?.('삭제 실패: ' + (del.error || ''), 'error'); return; }
    // 거래처 상세 링크 비우기 — 단, 같은 거래처를 가리키는 '다른' 등록증이 없을 때만
    if (cert.customer_id) {
      const otherSame = certs.some((c) => c.id !== cert.id && String(c.customer_id) === String(cert.customer_id));
      if (!otherSame) await supabase.setCustomerCert(cert.customer_id, null, null);
    }
    if (cert.storage_path) await deleteImages([cert.storage_path]).catch(() => {});
    setCerts((prev) => prev.filter((c) => c.id !== cert.id));
    setViewer(null);
    showToast?.('삭제되었습니다', 'success');
  };

  // 새 등록증 추가
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadCertToLibrary(file);
      const name = (file.name || '새 등록증').replace(/\.(jpe?g|png|webp|gif|bmp|heic|pdf)$/i, '');
      const res = await supabase.addBusinessCert({ name, storagePath: up.path, url: up.url });
      if (!res.ok) throw new Error(res.error);
      setCerts((prev) => [{ ...res.data, customers: null }, ...prev]);
      showToast?.('등록증이 추가되었습니다', 'success');
    } catch (err) {
      showToast?.('업로드 실패: ' + (err.message || err), 'error');
    } finally {
      setUploading(false);
    }
  };

  if (needsMigration) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center">
        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted-foreground)' }} />
        <p className="font-bold mb-2">보관함 테이블이 아직 없습니다</p>
        <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
          Supabase에서 <code>business_certs</code> 테이블을 생성해야 합니다. (SQL 실행 후 새로고침)
        </p>
        <button onClick={load} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
          <RefreshCw className="w-4 h-4 inline mr-1" />다시 확인
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명으로 검색…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
            style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--muted)' }}>
          {[['all', `전체 ${certs.length}`], ['linked', `연결됨 ${linkedCount}`], ['unlinked', `미연결 ${certs.length - linkedCount}`]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-md transition-colors"
              style={{ background: filter === k ? 'var(--card)' : 'transparent', color: filter === k ? 'var(--primary)' : 'var(--muted-foreground)' }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="px-3 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}>
          <Upload className="w-4 h-4" />{uploading ? '업로드 중…' : '등록증 추가'}
        </button>
        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {certs.length === 0 ? '보관된 사업자등록증이 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((cert) => (
            <button key={cert.id} onClick={() => setViewer(cert)}
              className="group text-left rounded-xl overflow-hidden border transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: 'var(--card)', borderColor: cert.customer_id ? 'var(--primary)' : 'var(--border)' }}>
              <div className="aspect-[4/3] bg-[var(--muted)] flex items-center justify-center overflow-hidden">
                {isPdf(cert) ? (
                  <div className="flex flex-col items-center gap-1 text-[var(--muted-foreground)]">
                    <FileText className="w-8 h-8" /><span className="text-[11px] font-bold">PDF</span>
                  </div>
                ) : (
                  <img src={cert.url} alt={cert.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                )}
              </div>
              <div className="p-2">
                <p className="text-sm font-bold leading-snug break-keep line-clamp-2" style={{ color: 'var(--foreground)' }}>{cert.name}</p>
                {cert.customer_id ? (
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold" style={{ color: 'var(--primary)' }}>
                    <Building className="w-3 h-3" />{custName(cert)}
                  </span>
                ) : (
                  <span className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>미연결</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 확대 보기 모달 */}
      {viewer && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,0.72)' }} onClick={() => setViewer(null)}>
          <div className="w-full max-w-3xl max-h-[92vh] rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--card)' }} onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <p className="font-black text-lg break-keep leading-snug">{viewer.name}</p>
                {viewer.customer_id && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--primary)' }}>
                    <Building className="w-3.5 h-3.5" />{custName(viewer)}
                  </span>
                )}
              </div>
              <button onClick={() => setViewer(null)} className="p-2 rounded-lg hover:bg-[var(--accent)] flex-shrink-0"><X className="w-5 h-5" /></button>
            </div>
            {/* 이미지/PDF */}
            <div className="flex-1 overflow-auto bg-[var(--muted)] flex items-center justify-center p-2">
              {isPdf(viewer) ? (
                <a href={viewer.url} target="_blank" rel="noreferrer" className="px-4 py-3 rounded-lg text-sm font-bold text-white flex items-center gap-2" style={{ background: 'var(--primary)' }}>
                  <ExternalLink className="w-4 h-4" />PDF 새 창에서 열기
                </a>
              ) : (
                <img src={viewer.url} alt={viewer.name} className="max-w-full max-h-[62vh] object-contain rounded" />
              )}
            </div>
            {/* 하단: 거래처 연결 + 삭제 */}
            <div className="px-4 py-3 border-t flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <select
                  value={viewer.customer_id || ''}
                  onChange={(e) => handleLink(viewer, e.target.value)}
                  disabled={linking}
                  className="flex-1 px-2 py-2 rounded-lg text-sm border disabled:opacity-50"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                  <option value="">거래처 연결 안 함</option>
                  {[...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <a href={viewer.url} target="_blank" rel="noreferrer"
                className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                <ExternalLink className="w-4 h-4" />원본
              </a>
              <button onClick={() => handleDelete(viewer)}
                className="px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 text-white"
                style={{ background: '#ef4444' }}>
                <Trash2 className="w-4 h-4" />삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
