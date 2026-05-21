// AI 학습 데이터 (ai_learning) 분석
// 사용자가 AI 주문 인식 교정 시 자동 저장된 매핑 데이터

export function getLearningStats(aiLearningData = [], { limit = 20 } = {}) {
  if (!Array.isArray(aiLearningData) || aiLearningData.length === 0) {
    return { total: 0, byProduct: [], recent: [], byReason: [], message: 'AI 학습 데이터가 없습니다.' };
  }
  // 제품별 학습 카운트
  const productMap = new Map();
  const reasonMap = new Map();
  for (const l of aiLearningData) {
    const pkey = l?.product_name || '(미지정)';
    if (!productMap.has(pkey)) productMap.set(pkey, { productName: pkey, count: 0 });
    productMap.get(pkey).count++;
    const rkey = l?.reason || '(사유없음)';
    if (!reasonMap.has(rkey)) reasonMap.set(rkey, { reason: rkey, count: 0 });
    reasonMap.get(rkey).count++;
  }
  const byProduct = Array.from(productMap.values()).sort((a, b) => b.count - a.count).slice(0, limit);
  const byReason = Array.from(reasonMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  // 최근 교정 사례
  const sorted = [...aiLearningData].sort((a, b) => {
    const ad = new Date(a?.created_at || 0).getTime();
    const bd = new Date(b?.created_at || 0).getTime();
    return bd - ad;
  });
  const recent = sorted.slice(0, limit).map((l) => ({
    originalText: l?.original_text || '',
    productName: l?.product_name || '',
    quantity: l?.quantity,
    reason: l?.reason || '',
    createdAt: l?.created_at,
  }));
  return {
    total: aiLearningData.length,
    byProduct,
    byReason,
    recent,
  };
}
