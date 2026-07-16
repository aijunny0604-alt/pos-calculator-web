// 네이버 커머스 API 호환 택배사 코드 — 단일 소스.
// SmartStoreOrders(발송처리 모달)와 ShippingLabel(송장→네이버 발송 연동)이 공유.
//
// ⚠️ 코드는 네이버 커머스 API deliveryCompanyCode 정식 값이어야 함. 틀리면 발송 시
//    HTTP 200 partial-fail "104119 택배사코드 확인"으로 거부됨.
// (2026-06-02 교정: 로젠택배는 LOGEN 이 아니라 KGB(옛 KGB택배) — 실측 검증됨.
//  문도현 주문 KGB 코드로 발송 성공 / 정승원 LOGEN 코드로 104119 거부 확인.)
//
// ✅ 실측 검증: KGB(로젠) = 발송 성공.  나머지는 네이버 표준 코드.
// 순서 = 드롭다운 노출 순서. 자주 쓰는 로젠(기본)·경동을 맨 위로. (2026-07-16 사장님 요청)
export const NAVER_COURIERS = [
  { code: 'KGB', name: '로젠택배' },      // ← 기본 택배사. 네이버 코드 KGB (LOGEN 아님!). 실측 검증.
  { code: 'KDEXP', name: '경동택배' },    // ← 2순위. 경동 = KDEXP (이전 KGB 라벨 오류 교정)
  { code: 'CJGLS', name: 'CJ대한통운' },
  { code: 'HANJIN', name: '한진택배' },
  { code: 'EPOST', name: '우체국택배' },
  { code: 'HYUNDAI', name: '롯데택배' },  // ← 롯데(구 현대택배) 네이버 코드 HYUNDAI
  { code: 'CU', name: 'CU편의점택배' },
  { code: 'CVSNET', name: 'GS Postbox(편의점)' },
  { code: 'DAESIN', name: '대신택배' },
  { code: 'ILYANG', name: '일양로지스' },
];

// 기본 택배사 코드 — 새 발송처리 시 초기 선택값. 단일 소스로 두어 4곳(SmartStore 2 + ShippingLabel + OrderHistory)이 공유
export const DEFAULT_COURIER_CODE = 'KGB'; // 로젠택배
