// 제품 이미지 데모 모드 — URL에 ?demo=images 있을 때만 샘플 이미지 표시
// 실제 구현 전 레이아웃 미리보기용. 사용자 승인 후 제거되고 Supabase Storage 연동으로 대체됨.

// 카테고리 또는 제품 키워드 → Unsplash 자동차 부품 이미지 매핑
const CATEGORY_IMAGES = {
  '모듈': [
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  ],
  '져스트 스피커': [
    'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&h=400&fit=crop',
  ],
  '배선/부품': [
    'https://images.unsplash.com/photo-1635352435460-7f5b46ea73f2?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=400&h=400&fit=crop',
  ],
  'A/S': [
    'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=400&h=400&fit=crop',
  ],
  'BOV/블로우오프': [
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&h=400&fit=crop',
  ],
  'CH 뻥레조 소음기': [
    'https://images.unsplash.com/photo-1542282088-fe8426682b8f?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1620288627223-53302f4e8c74?w=400&h=400&fit=crop',
  ],
  'GFB': [
    'https://images.unsplash.com/photo-1617886903355-df116483a857?w=400&h=400&fit=crop',
  ],
  'HKS': [
    'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=400&h=400&fit=crop',
  ],
  'IRP': [
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400&h=400&fit=crop',
  ],
};

const FALLBACK = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&h=400&fit=crop';

/**
 * 데모 모드 여부 확인 — URL에 ?demo=images 있을 때 true (실제 이미지 없을 때 샘플 대체용)
 * 실제 이미지가 있으면 모바일에서도 표시됨 (MainPOS 카드 레이아웃이 반응형으로 처리)
 */
export function isImageDemoMode() {
  try {
    if (typeof window === 'undefined') return false;
    const qs = new URLSearchParams(window.location.search);
    return qs.get('demo') === 'images';
  } catch { return false; }
}

/**
 * 제품 ID/카테고리 기준 샘플 이미지 URL 반환 (데모용)
 */
export function getSampleImage(product) {
  if (!product) return null;
  // 제품 id를 해시하여 카테고리 내 여러 이미지 중 하나 선택
  const pool = CATEGORY_IMAGES[product.category] || [FALLBACK];
  const idNum = Number(String(product.id).replace(/\D/g, '')) || 0;
  return pool[idNum % pool.length];
}
