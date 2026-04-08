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
| 컬럼 | 설명 |
|------|------|
| id | 주문 ID |
| items | 주문 아이템 (JSONB) |
| customer_name | 고객명 |
| customer_phone | 전화번호 |
| customer_address | 주소 |
| total_amount | 총 금액 |
| created_at | 생성일시 |
| updated_at | 수정일시 |
| status | 상태 (완료/대기/반품 등) |

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
| 컬럼 | 설명 |
|------|------|
| id | 반품 ID |
| items | 반품 아이템 (JSONB) |
| order_id | 원주문 ID |
| created_at | 생성일시 |

### saved_carts
| 컬럼 | 설명 |
|------|------|
| id | 저장 장바구니 ID |
| items | 장바구니 아이템 (JSONB) |
| customer_name | 고객명 |
| created_at | 생성일시 |

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
