# 네이버 스토어(엠파츠) 상품 카탈로그 조회 — Plan

> 작성일: 2026-06-10
> 상태: Plan (스코프 확정 대기)
> 한 줄: MOVIS에서 "HKS 흡기필터 관련 상품 다 찾아줘" → **네이버 스토어에 실제 등록된 전 상품·옵션**을 조회. (로컬 POS 625개가 아니라 네이버 카탈로그 전체)

## 1. 목적 (Why)

현재 MOVIS `searchProducts`는 **우리 POS DB(625개, 주문된 것 위주)**만 검색. 사장님이 원하는 건 **네이버 스마트스토어(엠파츠)에 올라간 모든 상품 + 옵션** 조회 — 아직 안 팔린 옵션 변형까지.

## 2. 데이터 출처 (확인됨)

네이버 커머스 API (`https://api.commerce.naver.com`, sync.js OAuth/`callNaver()` 재사용):
- `POST /external/v1/products/search` — 상품 목록(요약: channelProductNo, 상품명, salePrice, 판매상태, sellerManagementCode, categoryId, 대표이미지, modifiedDate). 페이징.
- `GET /external/v1/products/channel-products/{channelProductNo}` — 상품 단건(**옵션조합 optionCombinations / optionInfo 포함**).

⚠️ 옵션은 목록 API에 안 옴 → 옵션까지 필요하면 **상품 수만큼 단건 호출**.

## 3. 아키텍처 (주문 sync와 동일 패턴)

```
매장PC sync.js (IP 화이트리스트 통과)
  └ syncNaverCatalog(): products/search 페이징 → (옵션 옵션) 단건조회
       → Supabase upsert: external_products (+ options JSONB)
Supabase: external_products 테이블 (신규)
MOVIS: searchNaverCatalog 도구 → external_products 토큰검색 (방금 만든 매칭 로직 재사용)
```

### 신규 테이블 `external_products`
| 컬럼 | 설명 |
|------|------|
| channel_product_no (PK) | 네이버 채널상품번호 |
| name | 상품명 |
| status_type | 판매중/품절/판매중지 |
| sale_price | 판매가 |
| seller_management_code | 판매자 관리코드 |
| category_name | 카테고리 |
| representative_image | 대표 이미지 URL |
| options (JSONB) | 옵션조합 [{name, price, stock, code}] — 옵션 동기화 시 |
| product_url | 상품 딥링크 (smartstore.naver.com/main/products/{no}) |
| synced_at | 마지막 동기화 시각 |

### 신규 MOVIS 도구 `searchNaverCatalog({keyword, limit, inStockOnly})`
- external_products 토큰 매칭 검색 (searchProducts와 동일 알고리즘)
- 옵션 포함 반환: "HKS 오픈흡기 필터 — 사이즈: 200-80/200-100, 재고…"
- 판매상태/상품URL 같이 반환 → 바로 네이버 페이지 이동
- 시스템프롬프트: "네이버 스토어 상품/옵션은 searchNaverCatalog, 우리 POS 등록분은 searchProducts" 구분 안내

## 4. 스코프 결정 필요 (2가지)

### A. 동기화 주기
- **하루 1회 자동 + 수동 [지금 동기화] 버튼** (권장) — 카탈로그는 자주 안 변함, API 부담↓
- 실시간(주문처럼 1분) — 불필요하게 무거움
- 수동 트리거만 — 가장 가벼움

### B. 옵션 깊이
- **옵션조합까지 전부** — 단건 N콜(상품 수만큼), 느리지만 완전. 일 1회면 감당 가능
- **상품 목록만(옵션 제외)** — 빠름, 상품명·가격·판매상태만. 옵션은 나중에

## 5. 작업 분해

1. Supabase 마이그레이션: `external_products` 테이블 + 인덱스 + RLS(SELECT anon)
2. sync.js `syncNaverCatalog()` — products/search 페이징 upsert (+옵션 단건조회 옵션)
3. sync.js 스케줄: 일 1회(또는 결정된 주기) + RPC `request_naver_catalog_sync_now()`
4. App.jsx: external_products 로드(또는 도구 내 Supabase 직접 쿼리)
5. MOVIS `searchNaverCatalog` 도구 + 시스템프롬프트 안내
6. (선택) 스토어주문/MOVIS에 [네이버 상품 검색] UI
7. 검증: 실제 엠파츠 상품 수 vs 동기화 건수 일치, 옵션 표시, 판매상태 정확

## 6. 안전장치

- sync.js 수정 → **매장 PC 재시작 필수** (CLAUDE.md 규칙). 라이브 시간 피해서 배포
- 상품 API 호출 rate-limit(주문 sync처럼 sleep) — 429 방지
- external_products는 **읽기 전용 캐시** (네이버가 ground truth). POS products와 분리 → 기존 주문/매칭 로직 무영향
- 옵션 단건조회는 modifiedDate 비교로 **변경된 상품만** 갱신 (전수 재조회 회피)

## 7. 기존 개선과의 관계

- 방금 `searchProducts` 토큰매칭 개선은 **POS DB(625) 검색**용으로 유지
- 본 기획은 **네이버 카탈로그 검색**용 `searchNaverCatalog` 신규 — 둘은 별개 소스, 공존
