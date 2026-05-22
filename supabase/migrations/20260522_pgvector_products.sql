-- ════════════════════════════════════════════════════════════════
-- pgvector 활성화 + products 테이블에 embedding 컬럼 추가
-- 실행: Supabase Studio → SQL Editor → 전체 붙여넣기 → Run
-- 소요: 1초
-- ════════════════════════════════════════════════════════════════

-- 1. pgvector extension 활성화 (Supabase 무료 플랜 지원)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. products 테이블에 embedding 컬럼 추가 (768차원 = Gemini text-embedding-004)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

-- 3. 인덱스 (코사인 거리 기반 검색용) — hnsw (Codex 권장 m=16, ef_construction=64)
-- hnsw: 빠른 검색 (1000개 ~1ms) + 점진적 삽입 가능 (rebuild 불필요)
-- 메모리: 제품당 ~6KB × 768dim = 5~25MB (1000~5000개) — Supabase Free 안전
CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. 벡터 검색 RPC 함수 (의미 기반 매칭)
-- 사용: supabase.rpc('search_products_by_vector', { query_embedding: [0.1,...], match_threshold: 0.5, match_limit: 10 })
CREATE OR REPLACE FUNCTION search_products_by_vector(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_limit int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  name text,
  category text,
  stock int,
  wholesale int,
  retail int,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id,
    p.name,
    p.category,
    p.stock,
    p.wholesale,
    p.retail,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_limit;
$$;

-- 5. customers 테이블에도 동일 적용 (선택적 — 거래처 검색)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS customers_embedding_idx
  ON customers
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION search_customers_by_vector(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_limit int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  name text,
  phone text,
  address text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id, c.name, c.phone, c.address,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM customers c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_limit;
$$;

-- 6. RLS (Row Level Security) 정책 — 익명 사용자도 검색 가능
-- (Supabase Free 플랜 + 익명 키 사용 시)
GRANT EXECUTE ON FUNCTION search_products_by_vector TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_customers_by_vector TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- 완료! 다음:
-- 1. Admin 페이지에서 "벡터 인덱싱" 버튼 클릭 (제품 1000개 약 17분 1회)
-- 2. 그 후 자동으로 신규/수정 시 임베딩 업데이트
-- 3. productMatch가 벡터 검색을 0단계로 우선 사용
-- ════════════════════════════════════════════════════════════════
