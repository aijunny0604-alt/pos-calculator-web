# 디자인 시스템 & 스타일 가이드
> CSS 변수, 반응형 기준, z-index 계층, 주요 CSS 클래스
> 관련: [프로젝트 구조](ARCHITECTURE.md)

---

### CSS 변수 (index.css :root)
```css
--background, --foreground, --primary, --card, --border
--success (#16a34a), --destructive (#dc2626), --warning (#f59e0b)
```

### 반응형 기준
- 모바일: < 768px (하단 네비, 1열 레이아웃)
- 데스크톱: >= 768px (좌측 사이드바 256px + 유동 콘텐츠)

### z-index 계층 구조
| z-index | 요소 | 위치 |
|---------|------|------|
| z-[80] | 주문 저장 로딩 오버레이 | MainPOS.jsx (OrderPage `z-50`, successModal `z-[70]` 위에 표시) |
| z-50 | 모달/다이얼로그 | 각 페이지 내 fixed 모달 |
| z-[45] | 모바일 사이드바 오버레이 | AppLayout.jsx |
| z-40 | 풀스크린 페이지 sticky 헤더 | OrderHistory, CustomerList, ShippingLabel 등 |
| z-30 | 모바일 하단 네비게이션 | MobileNav.jsx |

> **주의**: `will-change`, `transform` 등 stacking context를 생성하는 CSS를 `main`, `nav`, `aside`에 적용하면 z-index 비교가 깨짐. `index.css`에서 `will-change: scroll-position` 제거한 이유.

### 주요 CSS 클래스 (index.css)
- `.card-interactive` - 카드 호버/클릭 spring 애니메이션
- `.no-print` - 인쇄 시 숨김
- `.custom-scroll` - 커스텀 스크롤바 (4px 얇은 디자인)
- `.modal-fs-transition` - 모달 풀스크린 토글 애니메이션
- `overscroll-behavior-y: contain` → `html, body`, `main`에만 적용 (다른 곳 금지)

### 텍스트 표시 규칙 (제품명 / 고객정보 / 메모)

> **주의**: 사용자 데이터 표시 영역에 `truncate`, `line-clamp`, `text-overflow: ellipsis` 사용 금지.
> 모바일에서 글자가 단어 중간에서 잘리거나 한 글자씩 깨지지 않도록 데이터 성격별 패턴 구분:

**데이터 성격별 적용 패턴**
| 데이터 | 클래스 | 이유 |
|--------|--------|------|
| 제품명, 일반 메모 | `break-words leading-snug` | 긴 영문/숫자 조합도 줄바꿈 |
| 한국어 주소, 고객명 | `break-keep leading-snug` | 단어(어절) 단위 줄바꿈 — 글자 낱개 깨짐 방지 |
| 혼합 텍스트 | `break-words leading-snug` | 안전한 기본값 |

**공통 보조 클래스 (flex 레이아웃 필수)**
- `items-center` → `items-start` (멀티라인 상단 정렬)
- flex 자식에 `min-w-0` (flex-shrink 허용, 넘침 방지)
- 아이콘 · 복사 버튼에 `flex-shrink-0` (줄어들지 않도록)
- 모바일에서 줄바꿈이 심한 라인은 `flex-col sm:flex-row` 조합으로 세로 전환
- `max-w-[140px]` 등 고정 width 하드코딩 제거

**안티패턴 (금지)**
```jsx
// ❌ 한국어 주소에 truncate — 긴 주소 잘림
<span className="truncate">{address}</span>

// ❌ min-w-0 누락 — flex 자식이 컨테이너를 벗어남
<div className="flex"><span>{longText}</span></div>

// ❌ 아이콘에 flex-shrink-0 누락 — 좁은 화면에서 아이콘 깨짐
<div className="flex"><Icon /><span className="min-w-0">{text}</span></div>
```

### 모바일 헤더 패턴
- 풀스크린 페이지에서 공통 사용:
  - **모바일**: 메뉴(≡) 버튼 → 사이드바 열기
  - **데스크톱**: 뒤로가기(←) 버튼 → 대시보드로 이동
```jsx
<button className="md:hidden" onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}>
  <Menu />
</button>
<button className="hidden md:flex" onClick={() => setCurrentPage('dashboard')}>
  <ArrowLeft />
</button>
```

### 모바일 사이드바 통신
- 풀스크린 페이지는 AppLayout의 state에 직접 접근 불가
- **Custom DOM Event 패턴** 사용:
```javascript
// 페이지에서 사이드바 토글 (열기/닫기)
window.dispatchEvent(new CustomEvent('toggle-sidebar'));

// AppLayout에서 수신
useEffect(() => {
  const toggleHandler = () => setSidebarOpen(prev => !prev);
  window.addEventListener('toggle-sidebar', toggleHandler);
  return () => window.removeEventListener('toggle-sidebar', toggleHandler);
}, []);
```

### 모달 표준 패턴 (필수)

> **주의**: 새 모달 작성 시 아래 패턴 반드시 적용. 누락 시 모바일에서 스크롤 불가 / 콘텐츠 잘림 발생.

#### 1. 모달 컨테이너 (외곽)
```jsx
<div
  className="relative w-full overflow-hidden flex flex-col shadow-2xl border modal-fs-transition"
  style={{
    maxWidth: isFullscreen ? '100vw' : 'min(48rem, calc(100vw - 2rem))',
    height: isFullscreen ? '100vh' : 'auto',          // ❌ h-full 금지 (콘텐츠 짧아도 풀스크린)
    maxHeight: isFullscreen ? '100vh' : '85vh',
    borderRadius: isFullscreen ? '0' : '1rem',
  }}
>
```

#### 2. 스크롤 본문 (내부)
```jsx
<div
  className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 modal-scroll-area"
  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
  onTouchMove={(e) => e.stopPropagation()}
>
```

#### 핵심 속성 설명
| 속성 | 역할 |
|-----|------|
| `min-h-0` | flex-1 자식의 최소 높이를 0으로 강제 → 스크롤 활성화 (필수) |
| `overscroll-contain` | 모달 끝에서 배경 스크롤 전파 차단 |
| `modal-scroll-area` | OrderPage의 touchmove 차단에서 자동 허용되는 마커 |
| `WebkitOverflowScrolling: touch` | iOS Safari 관성 스크롤 |
| `touchAction: pan-y` | 구형 갤럭시 세로 스크롤 보장 |
| `onTouchMove stopPropagation` | 이중 모달일 때 상위 모달 스크롤 차단 방지 |
| `height: auto` | 콘텐츠 짧으면 모달도 작아짐 (UX 개선) |
| `min(Xrem, calc(100vw - 2rem))` | 360px 이하 갤럭시에서 가로 잘림 방지 |

#### 페이지 레벨 스크롤 (모달 아닌 경우)
```jsx
<div className="flex-1 min-h-0 overflow-y-auto">  {/* min-h-0만 추가 */}
```

> 자세한 변경 내역은 [CHANGELOG.md](CHANGELOG.md) 2026-04-13 모달 스크롤 일괄 수정 참조

---

### 확인·작업 모달 톤 (2026-07-22 정립)

> 위 "모달 표준 패턴"이 **구조**(스크롤·모바일 안전)라면, 이건 **외형**이다.
> 기준 구현: [CustomerDetailModal.jsx](../src/components/CustomerDetailModal.jsx),
> 적용 예: SmartStoreOrders 5종(발송·방문수령·일괄발송·주문취소) + OrderDetail 주문수정 확인

**4단 구조로 통일한다.**

```jsx
{/* 백드롭 — 모바일은 하단 시트로 올라오게 items-end */}
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                bg-black/60 sm:p-4 backdrop-blur-sm animate-modal-backdrop">
  <div className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col
                  rounded-t-3xl sm:rounded-2xl border bg-[var(--card)]
                  shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)]
                  animate-modal-up overflow-hidden modal-card-safe">

    {/* 1. 액센트 바 — 모달 성격을 색으로 */}
    <div className="absolute top-0 left-0 right-0 h-1.5 pointer-events-none"
      style={{ background: 'linear-gradient(90deg, #03c75a 0%, #22c55e 55%, #03c75a 100%)' }} />

    {/* 2. 헤더 — 아이콘 타일 + 제목 + 부제 + 닫기 */}
    <div className="px-5 pt-6 pb-4 border-b flex items-start gap-3.5"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, #03c75a 9%, var(--card)) 0%, var(--card) 70%)' }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md"
        style={{ background: 'linear-gradient(135deg, #03c75a, #16a34a)', color: 'white' }}>
        <Truck className="w-5 h-5" />
      </div>
      …제목 / 부제 / X 버튼
    </div>

    {/* 3. 본문 — 스크롤 */}
    <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4" style={{ minHeight: 0 }}>…</div>

    {/* 4. 푸터 — 고정. 취소는 좁게, 주 액션은 flex-1 */}
    <div className="px-5 py-4 border-t flex gap-2.5 flex-shrink-0">…</div>
  </div>
</div>
```

**색 배정** — 모달 성격에 따라 액센트/아이콘/주버튼을 한 색으로 묶는다.

| 성격 | 색 | 예 |
|---|---|---|
| 네이버 연동 | `#03c75a` → `#16a34a` | 발송 처리, 일괄 발송 |
| 주의·보류 | `#f59e0b` → `#d97706` | 방문수령, 주문 수정 확인 |
| 파괴적 | `#ff4d6d` → `#e11d48` | 주문 취소 |
| 일반 | `var(--primary)` | 내부주문 전환 |

**규칙**
- **주 액션 버튼은 못 누를 때 이유를 라벨로 말한다** — `송장번호를 입력하세요` / `취소 사유를 입력하세요`.
  `disabled`만 걸어두면 왜 안 되는지 알 수 없다
- **작업 대상 요약 카드를 본문 맨 위에** — 구매자/금액/주문번호. 엉뚱한 건에 처리하는 사고 방지
- **입력 포커스 링은 모달 색으로** — `focus:ring-2 focus:ring-[#03c75a]/35`.
  기본 파랑을 두면 테마와 부딪힌다
- **주 입력은 크게** — 송장번호처럼 그 모달의 핵심 입력은 `text-lg font-mono` + `autoFocus` + Enter 제출
- 목록형 모달은 **진행 상황을 헤더 부제에** (`선택 3건 · 송장 입력 1건`), 행 상태는 **좌측 색 띠**로

---

### 날짜 계산 규칙

> **주의**: 날짜 계산 시 `+09:00` 오프셋과 `toISOString()`(UTC) 조합 금지.
> 반드시 `offsetDateKST()` 또는 `T00:00:00Z` + `setUTCDate()` 패턴 사용.

- 관련 변경 이력: [CHANGELOG.md](CHANGELOG.md) 2026-03-28 날짜 필터 버그 수정 참조

---

### ConfirmDialog 안전 사용 규칙

> **주의**: ConfirmDialog는 z-50 fixed 모달. 다른 모달 안에서 호출할 때 stacking + 이벤트 버블링이 모두 문제가 될 수 있음.

#### 1. window.confirm / window.alert 사용 금지
모바일(특히 iOS Safari)에서 native dialog는 스레드 차단 + 깨진 것처럼 보임. 반드시 `<ConfirmDialog>` 사용.

#### 2. 부모 모달의 backdrop이 `onClick={onClose}`일 때
ConfirmDialog를 부모 wrapper **안**에 렌더하면, 다이얼로그 버튼 클릭이 버블링되어 부모도 닫힘. 두 가지 안전 패턴:

**패턴 A (권장): Fragment로 분리 + 명시적 z-index wrapper**
```jsx
return (
  <>
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      {/* 부모 모달 콘텐츠 */}
    </div>
    {confirmDelete && (
      <div className="fixed inset-0 z-[110]">
        <ConfirmDialog isOpen onConfirm={...} onCancel={...} />
      </div>
    )}
  </>
);
```

**패턴 B: 부모 모달을 먼저 닫고 다이얼로그 오픈 (clean stack)**
```jsx
onClick={() => {
  const target = { id: detailCart.id, name: detailCart.name };
  setDetailCart(null);   // 1) 부모 닫기
  setPendingDelete(target); // 2) 다이얼로그 오픈
}}
```

#### 3. z-index 가이드 (ConfirmDialog 내장 z-50)
- 부모 모달이 z-50인 경우: ConfirmDialog가 JSX 후행이면 paint 순서로 위에 그려짐 — **OK이지만 같은 부모 안에 z-[60]+ 자식이 있으면 위험**. 명시적 wrapper 권장
- 부모 모달이 z-[60]+인 경우: 반드시 wrapper로 부모보다 위 z 지정 (z-[65], z-[110] 등)

#### 4. 파괴적 액션은 항상 ConfirmDialog 게이팅
삭제, 취소, 일괄 변경 등은 무확인 실행 금지. `destructive` prop 활성화로 시각적 경고 색 강제.

- 관련 변경 이력: [CHANGELOG.md](CHANGELOG.md) 2026-05-10 모바일 모달 안정화 참조
