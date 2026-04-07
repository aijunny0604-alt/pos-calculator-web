# Plan: AI 주문인식 학습 기능

> Feature: ai-recognition-learning
> Created: 2026-04-07
> Phase: Plan

---

## 1. 목표

AI 주문인식(TextAnalyze.jsx) 실패/수정 시 해당 데이터를 학습하여 다음 인식 정확도를 높인다.
관리자 페이지에서 학습 데이터 관리 + 백업/복원 기능을 제공한다.

## 2. 배경

- 현재: Gemini AI + 패턴 매칭으로 주문 텍스트 파싱
- 문제: 사용자가 수동 수정해도 그 데이터가 버려짐 → 같은 실수 반복
- 핵심 코드: `TextAnalyze.jsx:685-689` selectProduct() — state만 변경, DB 저장 없음

## 3. 기능 요구사항

### 3-1. 학습 데이터 수집 (TextAnalyze.jsx)
- 사용자가 제품을 수동 교정할 때 (원래 텍스트 → 정답 제품) 자동 저장
- 매칭 실패 후 수동 선택할 때도 저장
- 장바구니 추가(addSelectedToCart) 시점에 일괄 저장

### 3-2. 학습 데이터 활용 (TextAnalyze.jsx)
- 인식 시 Supabase 학습 테이블을 먼저 조회
- 동일/유사 텍스트가 있으면 학습된 제품 우선 매칭
- Gemini AI 호출 전에 학습 데이터로 1차 매칭 시도 → 히트 시 AI 호출 절약

### 3-3. 관리자 페이지 — 학습 관리 탭 (AdminPage.jsx)
- 학습 데이터 목록 조회 (원본 텍스트, 매칭된 제품, 학습 일시, 사용 횟수)
- 개별 삭제 / 전체 초기화
- 잘못된 학습 수정 (제품 재매핑)

### 3-4. 학습 데이터 백업/복원 (AdminPage.jsx)
- 기존 DB백업 탭에 학습 데이터 포함
- 또는 학습 관리 탭에서 별도 JSON 내보내기/가져오기
- 학습 초기화 전 자동 백업 경고

## 4. Supabase 테이블 설계

```sql
CREATE TABLE ai_learning (
  id SERIAL PRIMARY KEY,
  original_text TEXT NOT NULL,          -- "카본 93 듀얼"
  normalized_text TEXT NOT NULL,        -- 정규화된 텍스트 (검색용)
  product_id INT NOT NULL,             -- 매칭된 제품 ID
  product_name TEXT NOT NULL,          -- 제품명 스냅샷
  quantity INT DEFAULT 1,              -- 학습된 수량
  hit_count INT DEFAULT 0,            -- 활용된 횟수
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 5. 수정 대상 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/lib/supabase.js` | ai_learning CRUD 함수 추가 |
| `src/pages/TextAnalyze.jsx` | 학습 저장 + 학습 기반 매칭 로직 |
| `src/pages/AdminPage.jsx` | 학습 관리 탭 UI + 백업 연동 |
| `src/App.jsx` | aiLearningData state + 전달 |

## 6. 구현 순서

1. Supabase `ai_learning` 테이블 생성
2. `supabase.js`에 CRUD 함수 추가
3. `TextAnalyze.jsx` — 학습 저장 로직 (selectProduct, addSelectedToCart)
4. `TextAnalyze.jsx` — 학습 기반 매칭 (findProduct 앞단에 학습 조회)
5. `AdminPage.jsx` — 학습 관리 탭 UI
6. `AdminPage.jsx` — 백업/복원에 ai_learning 포함
7. 빌드 + 테스트 + 배포

## 7. 리스크

- Supabase Free 플랜 egress 제한 → 학습 데이터 조회를 앱 시작 시 1회만 로드 + 로컬 캐시
- 잘못된 학습 누적 → 관리자 삭제/초기화 기능 필수
- 동의어 맵과 학습 데이터 충돌 → 학습 데이터 우선, 동의어는 폴백
