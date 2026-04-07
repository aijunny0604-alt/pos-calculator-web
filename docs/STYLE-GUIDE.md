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

### 제품명 표시 규칙

> **주의**: 제품명 표시 영역에 `truncate`, `line-clamp`, `text-overflow: ellipsis` 사용 금지.
> 반드시 `break-words leading-snug` 패턴 사용하여 모바일에서 전체 제품명 표시.

- `truncate` → `break-words leading-snug` (줄바꿈 허용 + 행간 조밀)
- `items-center` → `items-start` (멀티라인 상단 정렬)
- `max-w-[140px]` 등 하드코딩 제거
- `min-w-0` 추가 (flex 자식 축소 허용)

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

### 날짜 계산 규칙

> **주의**: 날짜 계산 시 `+09:00` 오프셋과 `toISOString()`(UTC) 조합 금지.
> 반드시 `offsetDateKST()` 또는 `T00:00:00Z` + `setUTCDate()` 패턴 사용.

- 관련 변경 이력: [CHANGELOG.md](CHANGELOG.md) 2026-03-28 날짜 필터 버그 수정 참조
