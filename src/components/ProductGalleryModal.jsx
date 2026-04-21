import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * 제품 이미지 풀스크린 갤러리 뷰어
 * - 좌우 화살표 / 키보드 ←→ / 스와이프로 이미지 전환
 * - ESC로 닫기
 * - 하단 인디케이터 (1/N, 썸네일 바)
 */
export default function ProductGalleryModal({ images, productName, onClose, initialIndex = 0 }) {
  const [index, setIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState(null);

  const count = images?.length || 0;
  const current = images?.[index];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClose]);

  if (!current) return null;

  const onTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStart === null) return;
    const dx = e.changedTouches[0].clientX - touchStart;
    if (dx > 50 && index > 0) setIndex(index - 1);
    else if (dx < -50 && index < count - 1) setIndex(index + 1);
    setTouchStart(null);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col animate-modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 상단 바 */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{productName}</p>
          <p className="text-xs opacity-70">{index + 1} / {count}</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 중앙 이미지 */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.full || current.thumb}
          alt={productName}
          className="max-w-full max-h-full object-contain"
          style={{ touchAction: 'pinch-zoom' }}
        />

        {/* 좌우 버튼 (데스크톱) */}
        {count > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
              disabled={index === 0}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(count - 1, i + 1)); }}
              disabled={index === count - 1}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* 하단 썸네일 바 */}
      {count > 1 && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-3 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all"
              style={{
                borderColor: i === index ? 'white' : 'transparent',
                opacity: i === index ? 1 : 0.5,
              }}
            >
              <img src={img.thumb} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* 모바일 스와이프 안내 (처음만) */}
      <p className="md:hidden text-center text-[10px] text-white/50 pb-2">
        ← 스와이프하여 이전/다음 이미지
      </p>
    </div>
  );
}
