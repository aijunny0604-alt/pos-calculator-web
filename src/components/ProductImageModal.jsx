import { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, ArrowLeft, ArrowRight, ImageIcon, Loader2 } from 'lucide-react';
import { uploadMany, deleteImages, formatBytes } from '@/lib/imageUpload';
import { supabase } from '@/lib/supabase';

/**
 * 제품 이미지 관리 모달
 * - 드래그&드롭 여러 장 업로드 (자동 리사이즈 + WebP 변환)
 * - 썸네일 그리드 (첫 장 = 카드 대표)
 * - 순서 변경 (◄ ►)
 * - 개별 삭제 (Storage + DB)
 */
export default function ProductImageModal({ product, onClose, onSaved, showToast }) {
  const [images, setImages] = useState(() => Array.isArray(product?.image_urls) ? product.image_urls : []);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !uploading && !saving) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, uploading, saving]);

  const handleFiles = async (fileList) => {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      showToast?.('이미지 파일만 업로드할 수 있습니다', 'error');
      return;
    }
    setUploading(true);
    setProgress({ current: 0, total: files.length });
    try {
      const results = await uploadMany(files, product.id, (c, t) => setProgress({ current: c, total: t }));
      const ok = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      if (ok.length > 0) {
        setImages((prev) => [...prev, ...ok]);
        showToast?.(`${ok.length}장 업로드 완료`, 'success');
      }
      if (failed.length > 0) {
        showToast?.(`${failed.length}장 실패`, 'error');
      }
    } catch (e) {
      showToast?.('업로드 실패: ' + e.message, 'error');
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleDelete = async (idx) => {
    const target = images[idx];
    if (!target) return;
    if (!window.confirm('이 이미지를 삭제하시겠습니까?')) return;
    // Storage 파일 삭제
    if (Array.isArray(target.paths)) {
      await deleteImages(target.paths).catch(() => {});
    }
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveImage = (idx, direction) => {
    const next = [...images];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= next.length) return;
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setImages(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await supabase.updateProduct(product.id, { image_urls: images });
      if (!updated) throw new Error('저장 실패');
      showToast?.('이미지 정보 저장됨', 'success');
      onSaved?.(images);
      onClose?.();
    } catch (e) {
      showToast?.('저장 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={() => !uploading && !saving && onClose?.()}
    >
      <div
        className="relative w-full sm:max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border bg-[var(--card)] shadow-2xl animate-modal-up overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold flex items-center gap-2 truncate">
              <ImageIcon className="w-5 h-5 text-[var(--primary)]" />
              이미지 관리
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] truncate">{product?.name}</p>
          </div>
          <button
            onClick={() => !uploading && !saving && onClose?.()}
            disabled={uploading || saving}
            className="p-2 rounded-lg hover:bg-[var(--muted)] disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* 드롭존 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
            style={{
              borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
              background: dragOver ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--background)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                <p className="text-sm font-semibold">업로드 중… ({progress.current}/{progress.total})</p>
                <p className="text-xs text-[var(--muted-foreground)]">자동 리사이즈 + WebP 변환 중</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-[var(--muted-foreground)]">
                <Upload className="w-8 h-8" />
                <p className="text-sm font-semibold text-[var(--foreground)]">클릭 또는 드래그하여 이미지 업로드</p>
                <p className="text-xs">여러 장 동시 선택 가능 · JPG/PNG/WebP · 자동 최적화 (원본 유지 안 됨)</p>
              </div>
            )}
          </div>

          {/* 이미지 썸네일 그리드 */}
          {images.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--muted-foreground)]">
              등록된 이미지가 없습니다. 위 영역에 업로드하세요.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">등록된 이미지 ({images.length}장)</h4>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  첫 번째 이미지가 카드에 표시됩니다
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden border bg-[var(--muted)]"
                    style={{
                      borderColor: idx === 0 ? 'var(--primary)' : 'var(--border)',
                      boxShadow: idx === 0 ? '0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent)' : 'none',
                    }}
                  >
                    <div className="aspect-square">
                      <img
                        src={img.thumb}
                        alt={`이미지 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    {idx === 0 && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--primary)] text-white">
                        대표
                      </span>
                    )}
                    {/* Hover 오버레이 */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(idx, -1); }}
                        disabled={idx === 0}
                        className="w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center disabled:opacity-30"
                        title="앞으로"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-gray-700" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveImage(idx, 1); }}
                        disabled={idx === images.length - 1}
                        className="w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center disabled:opacity-30"
                        title="뒤로"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-gray-700" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(idx); }}
                        className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-2 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {images.length > 0 ? `총 ${images.length}장 · 저장 시 반영됩니다` : '저장하지 않으면 업로드한 이미지도 DB에 연결되지 않습니다'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => !uploading && !saving && onClose?.()}
              disabled={uploading || saving}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-[var(--muted)] disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={uploading || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
