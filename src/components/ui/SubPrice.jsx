import { calcExVat, formatPrice } from '@/lib/utils';

// @prop {boolean} taxFree — 비과세 항목(택배비/퀵비 등). true면 받은 금액 전액이 공급가, 부가세 0.
//   (2026-07-15) 우리 상품이 아닌 실비 대납이라 부가세 계산에서 뺀다. lib/utils.js calcOrderVat와 동일 규칙.

/**
 * 보조 가격 표시 컴포넌트 — 부가세 포함 합계 옆/아래에 공급가/부가세를 통일된 스타일로.
 *
 * 전체 화면에서 라벨/폰트/줄바꿈을 일관 적용하기 위한 헬퍼.
 * - 라벨: "공급가" / "부가세" 통일
 * - 폰트: data-attr 기반으로 size 토큰 적용 (xs=10px, sm=11px)
 * - calcExVat 1회 계산 후 재사용 (성능)
 *
 * @prop {number|string} total — 부가세 포함 합계. NaN/null/undefined → 0 안전 처리
 * @prop {'inline'|'stacked'|'supply-only'} layout — 표시 방식
 *   inline: 한 줄로 (공급가 X · 부가세 Y) — 좁은 셀 부적합
 *   stacked: 두 줄 (공급가 X / 부가세 Y) — 카드 합계 영역에 적합 (기본)
 *   supply-only: 공급가만 — 품목 라인 인라인용
 * @prop {'sm'|'xs'} size — 폰트 크기. 기본 sm (text-[11px])
 * @prop {boolean} showWon — '원' 단위 표시 여부 (기본 true)
 * @prop {string} className — 추가 클래스 (스택 wrapper에 적용)
 */
export default function SubPrice({
  total,
  layout = 'stacked',
  size = 'sm',
  showWon = true,
  taxFree = false,
  className = '',
}) {
  const t = Number(total);
  const safe = Number.isFinite(t) && t > 0 ? t : 0;
  // 비과세면 받은 금액 전액이 공급가, 부가세 0
  const ex = taxFree ? safe : calcExVat(safe);
  const vat = safe - ex;

  const sizeCls = size === 'xs' ? 'text-[10px]' : 'text-[11px]';
  const won = showWon ? '원' : '';
  const baseStyle = { color: 'var(--muted-foreground)' };
  const lineCls = `${sizeCls} font-normal leading-tight whitespace-nowrap`;

  if (layout === 'supply-only') {
    return (
      <span className={lineCls} style={baseStyle}>
        공급가 {formatPrice(ex)}{won}
      </span>
    );
  }

  if (layout === 'inline') {
    return (
      <p className={`${lineCls} ${className}`} style={baseStyle}>
        공급가 {formatPrice(ex)}{won}
        {taxFree ? ' · 비과세' : ` · 부가세 ${formatPrice(vat)}${won}`}
      </p>
    );
  }

  return (
    <div className={className}>
      <p className={lineCls} style={baseStyle}>공급가 {formatPrice(ex)}{won}</p>
      {/* 비과세는 "부가세 0원"보다 "비과세"라고 써야 왜 0인지 바로 안다 */}
      <p className={lineCls} style={baseStyle}>{taxFree ? '비과세 (부가세 없음)' : `부가세 ${formatPrice(vat)}${won}`}</p>
    </div>
  );
}
