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
  const [dragOver, setDragOver] = useState(false); // 파일 드래그 중 하이라이트
  const [linking, setLinking] = useState(false); // 연결 변경 in-flight 잠금
  const [linkSearch, setLinkSearch] = useState(''); // 거래처 연결 검색어
  const [linkOpen, setLinkOpen] = useState(false);  // 연결 드롭다운 열림
  const fileRef = useRef(null);

  // 거래처가 200곳이 넘어 select 스크롤로 찾는 게 고역 → 검색형 콤보박스.
  // 공백 차이(YB모터스/YB 모터스)로 못 찾는 일이 많아 공백 제거 후 비교.
  const normName = (s) => String(s || '').toLowerCase().replace(/\s/g, '');
  const linkCandidates = useMemo(() => {
    const sorted = [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    const q = normName(linkSearch);
    if (!q) return sorted.slice(0, 80);
    return sorted.filter((c) => normName(c.name).includes(q)).slice(0, 80);
  }, [customers, linkSearch]);

  // 다른 등록증을 열면 이전 검색어가 남지 않게 초기화
  useEffect(() => { setLinkOpen(false); setLinkSearch(''); }, [viewer?.id]);

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

  // 새 등록증 추가 — 버튼 선택 / 드래그앤드롭 공용. 여러 장 동시 가능(사진첩에서 통째로 끌어다 놓는 경우)
  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(
      (f) => /^image\//i.test(f.type || '') || /\.pdf$/i.test(f.name || '')
    );
    if (files.length === 0) {
      showToast?.('이미지 또는 PDF 파일만 올릴 수 있습니다', 'error');
      return;
    }
    setUploading(true);
    let ok = 0;
    const failed = [];
    for (const file of files) {
      let uploaded = null;
      try {
        uploaded = await uploadCertToLibrary(file);
        const name = (file.name || '새 등록증').replace(/\.(jpe?g|png|webp|gif|bmp|heic|pdf)$/i, '');
        const res = await supabase.addBusinessCert({ name, storagePath: uploaded.path, url: uploaded.url });
        if (!res.ok) throw new Error(res.error);
        setCerts((prev) => [{ ...res.data, customers: null }, ...prev]);
        ok++;
      } catch (err) {
        // DB 행 생성이 실패하면 방금 올린 파일이 어디에도 안 보이는 orphan으로 남는다 → 정리
        if (uploaded?.path) await deleteImages([uploaded.path]).catch(() => {});
        console.error('cert upload 실패:', file.name, err);
        failed.push(file.name);
      }
    }
    setUploading(false);
    // 여러 장 중 일부만 실패해도 어떤 파일인지 알려줘야 다시 올릴 수 있다
    if (ok > 0 && failed.length === 0) showToast?.(`등록증 ${ok}장이 추가되었습니다`, 'success');
    else if (ok > 0) showToast?.(`${ok}장 추가 · ${failed.length}장 실패 (${failed[0]}${failed.length > 1 ? ' 외' : ''})`, 'warning');
    else showToast?.(`업로드 실패 (${failed[0] || ''})`, 'error');
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []); // input.value 초기화 전에 먼저 복사(FileList는 초기화 시 비워질 수 있음)
    if (fileRef.current) fileRef.current.value = '';
    await uploadFiles(files);
  };

  // ===== 드래그앤드롭 =====
  // dragenter/leave가 자식 위를 지날 때마다 발생해 깜빡이므로 depth 카운트로 안정화
  const dragDepth = useRef(0);
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragOver = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();               // 없으면 브라우저가 파일을 새 탭으로 열어버림
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (uploading) return; // 업로드 중 재드롭 시 동시 실행되어 진행표시가 꼬이는 것 방지
    await uploadFiles(e.dataTransfer.files);
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
    <div
      className="flex-1 overflow-auto p-3 sm:p-4 transition-colors"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={dragOver ? { background: 'color-mix(in srgb, var(--primary) 6%, var(--background))' } : undefined}
    >
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
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleUpload} />
      </div>

      {/* 드래그앤드롭 존 — 항상 보이게 둬서 "끌어다 놓아도 된다"는 걸 알 수 있게. 클릭해도 파일 선택 */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full mb-3 rounded-xl border-2 border-dashed py-4 px-3 flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-60"
        style={{
          borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
          background: dragOver ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'var(--card)',
        }}
      >
        <Upload className="w-6 h-6" style={{ color: dragOver ? 'var(--primary)' : 'var(--muted-foreground)' }} />
        <p className="text-sm font-bold" style={{ color: dragOver ? 'var(--primary)' : 'var(--foreground)' }}>
          {uploading ? '업로드 중…' : dragOver ? '여기에 놓으면 등록됩니다' : '사업자등록증을 여기로 끌어다 놓으세요'}
        </p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          클릭해서 선택할 수도 있습니다 · 이미지/PDF · 여러 장 동시 가능
        </p>
      </button>

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
              {/* 거래처 연결 — 검색형 (200곳+ 리스트 스크롤 대신 타이핑으로 찾기) */}
              <div className="relative flex items-center gap-1.5 flex-1 min-w-[200px]">
                <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  value={linkOpen ? linkSearch : (viewer.customer_id ? custName(viewer) : '')}
                  onChange={(e) => { setLinkSearch(e.target.value); setLinkOpen(true); }}
                  onFocus={() => { setLinkOpen(true); setLinkSearch(''); }}
                  onBlur={() => setTimeout(() => setLinkOpen(false), 150)} // 항목 클릭이 먼저 처리되게 지연
                  disabled={linking}
                  placeholder="거래처명 검색해서 연결…"
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-lg text-sm border disabled:opacity-50"
                  style={{ background: 'var(--background)', borderColor: linkOpen ? 'var(--primary)' : 'var(--border)' }}
                />
                {viewer.customer_id && !linkOpen && (
                  <button
                    onClick={() => handleLink(viewer, '')}
                    disabled={linking}
                    title="거래처 연결 해제"
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border disabled:opacity-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {linkOpen && (
                  // 모달 하단이라 위로 펼침
                  <div
                    className="absolute bottom-full left-6 right-0 mb-1 max-h-64 overflow-auto rounded-lg border shadow-lg z-10"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { handleLink(viewer, ''); setLinkOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] border-b"
                      style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
                    >
                      거래처 연결 안 함
                    </button>
                    {linkCandidates.map((c) => (
                      <button
                        key={c.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { handleLink(viewer, c.id); setLinkOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--accent)] break-keep"
                        style={{
                          color: 'var(--foreground)',
                          background: String(c.id) === String(viewer.customer_id) ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : undefined,
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                    {linkCandidates.length === 0 && (
                      <div className="px-3 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>검색 결과가 없습니다</div>
                    )}
                  </div>
                )}
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
