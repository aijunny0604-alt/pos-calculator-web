// Pure, deterministic checks shared by the client and regression tests.
export function validateArguments(value, schema, path = '입력') {
  const errors = [];
  if (!schema) return errors;
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: 허용된 값이 아닙니다`);
  const type = schema.type?.toLowerCase();
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: 객체가 필요합니다`];
    for (const key of schema.required || []) if (value[key] === undefined) errors.push(`${path}.${key}: 필수 항목입니다`);
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) errors.push(`${path}: 금지된 필드입니다`);else if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}.${key}: 정의되지 않은 항목입니다`);else errors.push(...validateArguments(item, schema.properties[key], `${path}.${key}`));
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) return [`${path}: 배열이 필요합니다`];
    if (value.length > 200) errors.push(`${path}: 한 번에 200개까지 가능합니다`);
    value.forEach((item, i) => errors.push(...validateArguments(item, schema.items, `${path}[${i}]`)));
  } else if (type === 'integer' || type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || type === 'integer' && !Number.isInteger(value)) errors.push(`${path}: 올바른 숫자가 필요합니다`);
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: 최소값 미만입니다`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: 최대값 초과입니다`);
  } else if (type === 'string' && typeof value !== 'string') errors.push(`${path}: 문자열이 필요합니다`);else if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: 참/거짓이 필요합니다`);
  return errors;
}
export function verifyWork(calls, context = {}) {
  const failures = calls.filter(c => c.name !== 'verifyWork' && c.result?.ok === false);
  const reads = calls.filter(c => c.result?.ok && !c.result?.data?.__pending && !['verifyWork', 'calculate'].includes(c.name));
  const pending = calls.filter(c => c.result?.data?.__pending);
  const warnings = [...new Set(calls.flatMap(c => c.result?.warnings || c.result?.data?.warnings || []))];
  for (const [key, state] of Object.entries(context.dataState || {})) {
    if (state.status === 'error') warnings.push(`${key}: 조회 실패 (${state.error || '미확인'})`);else if (state.coverage === 'partial') warnings.push(`${key}: 일부 자료만 불러왔습니다.`);
  }
  const issues = failures.map(c => `${c.name}: ${c.result.error}`);
  if (pending.length && !reads.length) issues.push('변경 전 원본 조회 근거가 없습니다. 먼저 대상을 조회하세요.');
  return {
    ok: issues.length === 0,
    data: {
      checkedAt: new Date().toISOString(),
      status: issues.length || warnings.length ? 'needs-attention' : 'checked',
      sourceTools: [...new Set(reads.map(c => c.name))],
      pendingCount: pending.length,
      issues,
      warnings,
      dataState: context.dataState || {},
      scope: '도구 입력·호출 결과·조회 근거·확인 대기 점검. 답변 전체의 사실 정확성을 보증하지 않습니다.'
    }
  };
}
export function validatePending(result, calls) {
  if (!result?.data?.__pending) return result;
  if (!calls.some(c => c.result?.ok && !c.result?.data?.__pending && !['verifyWork', 'calculate'].includes(c.name))) {
    return {
      ok: false,
      error: '변경 미리보기 전에 원본 제품/거래처/주문을 조회하고 대조하세요.'
    };
  }
  const invalid = validateAction(result.data.action, result.data.params);
  if (invalid.length) return {
    ok: false,
    error: invalid.join('\n')
  };
  return result;
}
export const MUTATION_INTENTS = ['sales_order', 'purchase_order', 'goods_received', 'goods_dispatched', 'inventory_correction', 'price_change', 'customer_update', 'catalog_update', 'payment', 'return', 'order_memo'];
export function validateIntent(name, intent, args) {
  if (!MUTATION_INTENTS.includes(intent)) return ['변경의 업무 목적을 먼저 분명하게 지정하세요.'];
  if (intent === 'purchase_order') return ['매입 발주는 판매 주문/재고 변경으로 처리할 수 없습니다. 발주서 초안을 제시하세요.'];
  if (/Stock|ByCondition/.test(name) && !['goods_received', 'goods_dispatched', 'inventory_correction', 'price_change'].includes(intent)) return ['재고 변경 목적이 아닙니다. 사용자의 요청을 다시 확인하세요.'];
  if (name === 'saveOrder' && intent !== 'sales_order') return ['판매 주문 요청만 saveOrder로 처리할 수 있습니다.'];
  const errors = [];
  const visit = obj => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, val] of Object.entries(obj)) {
      if (['stock', 'newStock', 'setStock', 'wholesale', 'retail'].includes(key) && typeof val === 'number' && (!Number.isSafeInteger(val) || val < 0)) errors.push(`${key}: 음수·소수·과도한 값은 적용할 수 없습니다.`);
      if (['quantity', 'qty'].includes(key) && typeof val === 'number' && (!Number.isSafeInteger(val) || val <= 0)) errors.push(`${key}: 수량은 양의 정수여야 합니다.`);
      if (typeof val === 'object') visit(val);
    }
  };
  visit(args);
  return errors;
}
export function validateAction(action, params = {}) {
  const errors = [];
  if (params.missing?.length || params.invalid?.length) errors.push('일부 대상이 누락되었습니다. 누락 항목을 해결한 뒤 전체 미리보기를 다시 만드세요.');
  if (action === 'saveOrder') {
    if (!params.customerName?.trim()) errors.push('판매 거래처가 필요합니다.');
    if (!Array.isArray(params.items) || !params.items.length) errors.push('주문 품목이 없습니다.');
    let total = 0;
    for (const item of params.items || []) {
      if (!item.name || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.price) || item.price < 0) errors.push('제품명·수량·단가가 올바르지 않습니다.');
      total += Number(item.price) * Number(item.quantity);
    }
    if (!Number.isSafeInteger(total) || total !== params.total) errors.push('품목별 단가×수량의 합계가 주문 총액과 다릅니다.');
  }
  const updates = params.updates || [params];
  const ids = updates.map(u => u.productId || u.customerId).filter(v => v !== undefined);
  if (new Set(ids.map(String)).size !== ids.length) errors.push('같은 대상이 중복으로 포함되어 있습니다.');
  for (const u of updates) {
    if (/Stock/.test(action) && (!Number.isSafeInteger(u.newStock) || u.newStock < 0)) errors.push('재고는 0 이상의 정수여야 합니다.');
    for (const key of ['wholesale', 'retail']) if (u[key] !== undefined && (!Number.isSafeInteger(u[key]) || u[key] < 0)) errors.push('금액은 0 이상의 정수여야 합니다.');
  }
  return [...new Set(errors)];
}
