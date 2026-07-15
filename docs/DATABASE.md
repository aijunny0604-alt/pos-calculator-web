# 데이터베이스 (Database)
> Supabase 연결 정보, 테이블 스키마, API 래퍼 함수
> 관련: [프로젝트 구조](ARCHITECTURE.md) | [문제 해결](TROUBLESHOOT.md)

---

## 2. Supabase 연결 정보

- URL: `https://jubzppndcclhnvgbvrxr.supabase.co`
- 키: `src/lib/supabase.js`에 하드코딩 (publishable key)
- 테이블: `orders`, `products`, `customers`, `customer_returns`, `saved_carts`, `ai_learning`
- 2026-03-19 새 Supabase 프로젝트로 이전 완료 (이전: icqxomltplewrhopafpq → 현재: jubzppndcclhnvgbvrxr)

### 프로젝트 이전 이력 (2026-03-19)
- **이전 프로젝트**: `icqxomltplewrhopafpq` (egress 초과로 차단됨, 별도 계정)
- **새 프로젝트**: `jubzppndcclhnvgbvrxr` (Free 플랜, lyjcg0604@naver 계정)
- 새 프로젝트에 테이블 5개 생성 (products, customers, orders, customer_returns, saved_carts)
- D드라이브 CSV 원본 → REST API 벌크 insert로 데이터 864건 이전
- `App.jsx:186-187` WebSocket URL/키를 새 프로젝트로 변경
- `supabase.js`는 이미 새 프로젝트 URL이었음 (변경 불필요)
- RLS 정책 + Realtime 구독 설정 완료
- **스키마 참고**: customers.id는 TEXT(UUID), customer_returns는 items JSONB 형식
- **데이터 검증**: 브라우저 테스트 완료 (products 585, customers 117, orders 152, customer_returns 8, saved_carts 2)

### API 래퍼 (src/lib/supabase.js)
- Supabase REST API를 직접 호출하는 래퍼 함수 (~206줄)
- 응답 정규화: `Array.isArray(data) ? data[0] : data`
- 주요 함수: `getProducts`, `getCustomers`, `getOrders`, `getSavedCarts`, `saveProduct`, `addProduct`, `updateProduct`, `updateOrder`, `updateCustomer` 등
- `saveProduct`은 id가 있으면 `updateProduct(PATCH)` 호출 → 새 제품은 `addProduct(POST)` 사용 필수

> **주의**: 새 제품 추가 시 반드시 `supabase.addProduct(POST)`를 사용할 것.
> `saveProduct`은 id가 있으면 `updateProduct(PATCH)`를 호출하므로 새 제품에 사용 금지.

### WebSocket 실시간 구독 (App.jsx)
- 4개 테이블(orders, products, customers, saved_carts) 구독
- INSERT: `payload.record`를 로컬 state에 직접 추가
- UPDATE: `payload.record`로 해당 항목만 교체
- DELETE: `payload.old_record.id`로 해당 항목만 제거
- 전체 테이블 재조회 없이 개별 이벤트 반영 (API 최적화)

### API 호출 최적화 (2026-03-19 적용)
| 항목 | 최적화 전 | 최적화 후 |
|------|----------|----------|
| 일간 API 호출 | ~1,080회 | ~232회 (-78%) |
| 월간 트래픽 | 5GB+ (초과) | ~0.5GB |

- visibilitychange 쓰로틀링: 탭 전환 시 30초 이내 재호출 차단
- 폴링 주기: 5분(300000ms)
- WebSocket 이벤트 개별 반영 (전체 재조회 제거)

---

## 테이블 스키마

### orders
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT | 주문 ID (ORD-YYYYMMDD-XXXX) |
| items | JSONB | 주문 아이템 배열 [{id, name, price, quantity}] |
| customer_name | TEXT | 고객명 |
| customer_phone | TEXT | 전화번호 |
| customer_address | TEXT | 주소 |
| price_type | TEXT | 단가 기준 (wholesale/retail) |
| total | NUMERIC | 총 금액 (부가세 포함) |
| subtotal | NUMERIC | 공급가액 |
| vat | NUMERIC | 부가세 |
| memo | TEXT | 메모 |
| memo_checked | BOOLEAN | 메모 확인 완료 여부 (default: false) |
| returns | JSONB | 반품 내역 배열 [{returnId, itemId, itemName, price, quantity, total, returnedAt}] |
| total_returned | NUMERIC | 반품 총액 |
| created_at | TIMESTAMPTZ | 생성일시 |

> **주의**: `updated_at`, `status` 컬럼은 존재하지 않음. PATCH 시 이 키를 보내면 PGRST204 에러 발생.

### products
| 컬럼 | 설명 |
|------|------|
| id | 제품 ID (auto-increment 아님, 수동 생성 필요) |
| name | 제품명 |
| category | 카테고리 |
| wholesale | 도매가 |
| retail | 소매가 |
| stock | 재고 수량 |
| min_stock | 최소 재고 |

### customers
| 컬럼 | 설명 |
|------|------|
| id | 고객 ID (TEXT/UUID) |
| name | 업체명 |
| phone | 전화번호 |
| address | 주소 |
| memo | 메모 |

### customer_returns
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT | 자동 증가 PK |
| return_id | TEXT | 반품 ID (RET-timestamp) — 삭제 시 이 필드로 조회 |
| customer_name | TEXT | 고객명 |
| customer_id | TEXT | 고객 ID (nullable) |
| order_number | TEXT | 원주문 ID |
| items | JSONB | 반품 아이템 배열 [{returnId, itemId, itemName, price, quantity, total, returnedAt}] |
| total_amount | NUMERIC | 반품 총액 |
| returned_at | TIMESTAMPTZ | 반품 처리일시 |

> **주의**: `deleteCustomerReturn`은 `return_id`로 조회 (PK `id`가 아님).

### saved_carts
| 컬럼 | 설명 |
|------|------|
| id | 저장 장바구니 ID |
| items | 장바구니 아이템 (JSONB) |
| customer_name | 고객명 |
| created_at | 생성일시 |

### purchase_orders (v2026-07-15, 마이그008)
매입 발주 — 매입처(JSR)에 **우리가** 발주한 건. 🚨 네이버 "발주확인"(판매 주문상태)과 정반대 개념. 판매 `orders`와 무관.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT | 자동 증가 PK |
| po_number | TEXT | 비즈니스 키 `PO-YYMMDD` (**UNIQUE** — 중복 등록 시 409). 같은 날 2건이면 `-2` 접미 |
| supplier_name | TEXT | 매입처명 (기본 'JSR'). FK 아님 — 매입처 마스터 생기면 supplier_id UUID FK로 승격 |
| order_date | DATE | 발주일 (NOT NULL) |
| title | TEXT | 견적서 제목 원문 |
| items | JSONB | `[{name, spec, unit_price, qty, received_qty, note, status_override}]` |
| memo | TEXT | 메모 |
| quote_no | TEXT | 견적서 관리번호 (마이그009에서 ALTER 추가). 2장이면 쉼표 나열 |
| quote_url | TEXT | 발주서 이미지 공개 URL (증빙). 쉼표 다중 |
| quote_path | TEXT | Storage 경로. 쉼표 다중 |
| created_at / updated_at | TIMESTAMPTZ | updated_at은 트리거 자동 갱신 |

> **주의**: **상태 컬럼이 없다** — 프론트에서 계산(입고0=미입고 / 입고<수량=부분입고 / else 완료). `status_override`가 있으면 그게 우선(시트의 수동 "주문 취소" 재현).
> **주의**: `items[].qty` **음수 허용** (취소분 차감 행). **공급가액 = 단가 × 발주수량**(입고수량 아님) — 시트와 동일해야 합계가 맞음.
> **증빙**: 발주서 원본은 Storage `product-images/purchase-quotes/{관리번호}.png`.

### supplier_prices (v2026-07-15, 마이그009)
매입 단가표 — 매입처 견적서에서 판독한 규격별 단가 **이력**. 최신단가 = 같은 spec 중 `quoted_at` 최대 행.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT | 자동 증가 PK |
| supplier_name | TEXT | 매입처 (기본 'JSR') |
| item_name | TEXT | 품목명 |
| spec | TEXT | 규격명 — 발주서 표기가 정답 (`N100R_200L_64`) |
| unit_price | NUMERIC | 단가 |
| quoted_at | DATE | 견적서 작성일 |
| quote_no | TEXT | 출처 견적서 관리번호 (증빙 추적) |
| note | TEXT | 비고 |
| created_at | TIMESTAMPTZ | 생성일시 |

> **주의**: 여긴 **JSR 매입가**(우리가 지불). `products.wholesale`(업체에 파는 도매가)과 **완전 별개**이며 이름 체계도 다름(규격코드 vs 제품명).
> **주의**: `UNIQUE(supplier_name, spec, quoted_at, unit_price)` — 재실행/재판독 시 중복 방지.
> **제외 규칙**: 단가 0원(미출고품 무상보전이라 단가 아님)·수량 음수(취소차감)·더미행(자동차_부품)은 단가표에 넣지 않음.

### supplier_ledger (v2026-07-15, 마이그010)
매입처 수불 장부 — 빌려준 물건 / 예전 미입고 / 불량품 누적. ⚠️ `purchase_orders` 미입고와 별개(거긴 발주서 건의 입고 잔량, 여긴 발주서와 무관하게 오간 것).

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGINT | 자동 증가 PK |
| supplier_name | TEXT | 매입처 (기본 'JSR') |
| kind | TEXT | **CHECK**: `lent`(빌려줌·돌려받을 것) / `pending`(미입고) / `done`(완료) / `defect`(불량품) |
| occurred_on | DATE | 발생일. **불량품은 NULL** |
| item_name | TEXT | 품목 |
| spec | TEXT | 규격 (nullable) |
| qty | NUMERIC | 수량 |
| unit | TEXT | 단위 ('개' / '세트') |
| note | TEXT | 비고 |
| resolved | BOOLEAN | 정리 완료 여부 |
| resolved_at | TIMESTAMPTZ | 정리 일시 |
| created_at / updated_at | TIMESTAMPTZ | updated_at은 트리거 자동 갱신 |

> **주의**: **비즈니스 유니크키가 없다** → seed는 "테이블에 데이터 있으면 건너뜀" 방식으로 재실행 안전성 확보.
> **정책**: 돌려받거나 입고되면 **삭제 대신 `resolved` 토글** (이력 보존).

### ai_learning (신규)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | - | 기본 키 |
| original_text | TEXT | 원본 입력 텍스트 |
| normalized_text | TEXT | 정규화된 텍스트 |
| product_id | INT | 매칭된 제품 ID |
| product_name | TEXT | 매칭된 제품명 |
| quantity | INT | 수량 |
| hit_count | INT | 적중 횟수 |
| reason | TEXT | 매칭 사유 |
| created_at | TIMESTAMP | 생성일시 |
| updated_at | TIMESTAMP | 수정일시 |

---

## DB 백업/복원 (AdminPage.jsx → 'DB백업' 탭)
- **백업**: 6개 테이블(제품/거래처/주문/장바구니/반품/AI학습) → `pos-backup-YYYYMMDD.json` 다운로드
- **복원**: JSON 파일 업로드 → 미리보기(테이블별 건수) → 2단계 확인 후 **6개 테이블 전체** 복원
- **메타데이터**: `_meta.version`, `_meta.createdAt`, `_meta.app` 포함
- **마지막 백업 날짜**: localStorage에 저장, UI 표시

> 파일 구조 및 아키텍처 패턴은 [ARCHITECTURE.md](ARCHITECTURE.md) 참조.
