import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Trash2, Database, FileImage, Search, Camera, Loader2, Calendar } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { getTodayKST, formatPrice } from '@/lib/utils';

// 매입 증빙 보관함 — 견적서/명세서 사진을 '증거물' 차원으로 보관. 품목 처리 없음(발주와 별개).
const DOC_TYPES = ['견적서', '거래명세서', '세금계산서', '기타'];
const num = (v) => { const n = Number(String(v).replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : 0; };

async function uploadImage(file) {
  const ext = (file.name?.match(/\.(jpe?g|png|webp)$/i) || [, 'png'])[1];
  const path = `purchase-docs/doc-${getTodayKST()}-${Math.floor(performance.now())}.${ext}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type || 'image/png', 'x-upsert': 'true' },
    body: file,
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  return { url: `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`, path };
}

export default function PurchaseDocs({ showToast, onCount }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(null); // { id?, doc_date, supplier, doc_type, total_amount, memo, image_url, image_path, _file }
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [viewer, setViewer] = useState(null); // 확대보기 URL
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await supabase.getPurchaseDocs();
    if (res === null) { setLoadFailed(true); setRows([]); }
    else { setLoadFailed(false); setRows(res || []); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loadFailed) onCount?.(rows.length); }, [rows, loadFailed, onCount]);

  // 편집 모달에서 Ctrl+V 캡처 붙여넣기
  useEffect(() => {
    if (!editing) return;
    const onPaste = (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) attachFile(f);
    };
    const onKey = (e) => { if (e.key === 'Escape' && !saving) setEditing(null); };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, saving]);

  const openNew = () => setEditing({ doc_date: getTodayKST(), supplier: 'JSR', doc_type: '견적서', total_amount: '', memo: '', image_url: null, image_path: null, _file: null, _preview: null });
  const openEdit = (r) => setEditing({ ...r, total_amount: r.total_amount ?? '', _file: null, _preview: null });

  const attachFile = (file) => {
    if (!/^image\//.test(file.type || '')) { showToast?.('이미지 파일만 등록할 수 있어요', 'error'); return; }
    setEditing((e) => ({ ...e, _file: file, _preview: URL.createObjectURL(file) }));
  };

  const save = async () => {
    if (!editing.image_url && !editing._file) { showToast?.('증빙 이미지를 등록해주세요', 'error'); return; }
    if (!editing.doc_date) { showToast?.('문서 일자를 입력해주세요', 'error'); return; }
    setSaving(true);
    try {
      let image_url = editing.image_url, image_path = editing.image_path;
      if (editing._file) {
        const up = await uploadImage(editing._file);
        image_url = up.url; image_path = up.path;
      }
      const payload = {
        doc_date: editing.doc_date,
        supplier: (editing.supplier || 'JSR').trim(),
        doc_type: editing.doc_type || '견적서',
        total_amount: editing.total_amount === '' || editing.total_amount == null ? null : num(editing.total_amount),
        image_url, image_path,
        memo: (editing.memo || '').trim() || null,
        updated_at: new Date().toISOString(),
      };
      const res = editing.id ? await supabase.updatePurchaseDoc(editing.id, payload) : await supabase.addPurchaseDoc(payload);
      if (!res) { showToast?.('저장 실패 — 마이그레이션 015 적용 여부를 확인해주세요', 'error'); return; }
      setEditing(null);
      showToast?.(editing.id ? '증빙을 수정했습니다' : '증빙을 보관했습니다 📁', 'success');
      load();
    } catch (err) {
      console.error(err);
      showToast?.('이미지 업로드 실패 — 다시 시도해주세요', 'error');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    const ok = await supabase.deletePurchaseDoc(confirmDel.id);
    setConfirmDel(null);
    if (!ok) { showToast?.('삭제 실패', 'error'); return; }
    showToast?.('삭제했습니다', 'success');
    load();
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter((r) => `${r.supplier} ${r.doc_type} ${r.memo || ''} ${r.doc_date} ${r.total_amount || ''}`.toLowerCase().includes(ql));
  }, [rows, q]);

  if (loading) return <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>불러오는 중...</div>;
  if (loadFailed) return (
    <div className="p-4 rounded-xl border flex items-start gap-3" style={{ background: 'var(--card)', borderColor: 'var(--destructive)' }}>
      <Database className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--destructive)' }} />
      <div className="text-sm" style={{ color: 'var(--foreground)' }}>
        <div className="font-bold mb-1">증빙 보관 테이블을 찾을 수 없습니다</div>
        <div style={{ color: 'var(--muted-foreground)' }}>Supabase &gt; SQL Editor 에서 <b>migrations/015_purchase_docs.sql</b> 을 실행해주세요.</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border flex items-start gap-2.5 text-xs" style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'var(--primary)' }}>
        <FileImage className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
        <div style={{ color: 'var(--foreground)' }}>
          <b>견적서·명세서를 증거물로 보관</b>하는 곳입니다 — 품목 처리 없이 사진만.
          <br />JSR이 미출고 보전·대여를 섞어 보낸 견적서도 <b>일단 여기 저장</b>해두고, 돈 나가는 <b>새 발주분만</b> [발주 목록]에 등록하면 헷갈리지 않습니다.
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primary)' }}>
          <Plus className="w-4 h-4" /> 증빙 등록
        </button>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="매입처, 종류, 메모, 날짜 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
        </div>
        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{filtered.length}건</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <FileImage className="w-10 h-10 mx-auto mb-2 opacity-50" />
          {q ? '검색 결과가 없습니다' : '보관된 증빙이 없습니다. [증빙 등록]으로 견적서 사진을 올려보세요.'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              {r.image_url && (
                <button onClick={() => setViewer(r.image_url)} className="block w-full" style={{ background: 'var(--muted)' }}>
                  <img src={r.image_url} alt="증빙" loading="lazy" className="w-full h-40 object-cover object-top hover:opacity-90 transition" />
                </button>
              )}
              <div className="p-3">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ background: 'var(--primary)' }}>{r.doc_type}</span>
                  <span className="font-bold text-sm">{r.supplier}</span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{r.doc_date}</span>
                </div>
                {r.total_amount != null && <div className="text-base font-black" style={{ color: 'var(--foreground)' }}>₩{formatPrice(r.total_amount)}</div>}
                {r.memo && <div className="text-xs mt-0.5 whitespace-pre-line" style={{ color: 'var(--muted-foreground)' }}>{r.memo}</div>}
                <div className="flex items-center gap-1.5 mt-2">
                  <button onClick={() => openEdit(r)} className="px-2 py-1 rounded-lg text-xs font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>수정</button>
                  <button onClick={() => setConfirmDel(r)} className="p-1.5 rounded-lg ml-auto" style={{ color: 'var(--destructive)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 등록/수정 모달 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl border flex flex-col" style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <FileImage className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              <h3 className="text-base font-bold flex-1">{editing.id ? '증빙 수정' : '증빙 등록'}</h3>
              <button onClick={() => !saving && setEditing(null)}><X className="w-5 h-5 opacity-60" /></button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              {/* 이미지 드롭존 */}
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/')); if (f) attachFile(f); }}
                className="block rounded-xl border-2 border-dashed cursor-pointer overflow-hidden"
                style={{ borderColor: dragOver ? 'var(--primary)' : 'var(--border)', background: dragOver ? 'rgba(0,212,255,0.06)' : 'var(--background)' }}>
                {(editing._preview || editing.image_url) ? (
                  <img src={editing._preview || editing.image_url} alt="미리보기" className="w-full max-h-64 object-contain" style={{ background: 'var(--muted)' }} />
                ) : (
                  <div className="py-10 text-center">
                    <Camera className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--primary)' }} />
                    <div className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>증빙 사진 등록</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>클릭 · 드래그드롭 · Ctrl+V</div>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); }} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>문서 일자
                  <input type="date" value={editing.doc_date} onChange={(e) => setEditing({ ...editing, doc_date: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>매입처
                  <input value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>종류
                  <select value={editing.doc_type} onChange={(e) => setEditing({ ...editing, doc_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>합계 금액 (선택)
                  <input inputMode="numeric" value={editing.total_amount} onChange={(e) => setEditing({ ...editing, total_amount: e.target.value })} placeholder="0"
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-sm text-right" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                </label>
              </div>
              <label className="text-xs font-bold block" style={{ color: 'var(--muted-foreground)' }}>메모/태그 (선택)
                <textarea value={editing.memo} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} rows={2}
                  placeholder="예) 미출고 보전분 + 새 발주 혼합 / 대여품 XHAUST 포함"
                  className="mt-1 w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
              </label>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => !saving && setEditing(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'var(--primary)' }}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 확대보기 */}
      {viewer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setViewer(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}><X className="w-6 h-6" /></button>
          <img src={viewer} alt="증빙 원본" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* 삭제 확인 */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="font-bold mb-2">이 증빙을 삭제할까요?</div>
            <div className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>{confirmDel.supplier} · {confirmDel.doc_type} · {confirmDel.doc_date}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2 rounded-xl text-sm font-bold border" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>취소</button>
              <button onClick={doDelete} className="flex-1 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--destructive)' }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
