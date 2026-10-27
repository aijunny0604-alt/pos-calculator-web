// 네이버 공식 정산·부가세 조회: 요청과 반환 필드를 고정해 계좌·구매자 정보를 전달하지 않는다.
const FIELDS = {
  'settlement-case': ['settleBasisDate','settleExpectDate','settleCompleteDate','payDate','orderId','productOrderId','productOrderType','settleType','productId','productName','paySettleAmount','totalPayCommissionAmount','freeInstallmentCommissionAmount','sellingInterlockCommissionAmount','benefitSettleAmount','settleExpectAmount'],
  'commission-details': ['orderNo','productOrderId','productOrderType','productId','productName','settleType','settleBasisDate','settleExpectDate','settleCompleteDate','taxReturnDate','commissionBasisAmount','commissionType','commissionAmount'],
  'vat-case': ['settleBasisDate','orderId','productOrderId','productOrderType','detailType','status','productName','totalSalesAmount','taxationSalesAmount','taxExemptionSalesAmount','creditCardAmount','cashInComeDeductionAmount','cashOutGoingEvidenceAmount','cashExclusionIssuanceAmount','otherAmount'],
};
const PATHS = { 'settlement-case': 'settle/case', 'commission-details': 'settle/commission-details', 'vat-case': 'vat/case' };
export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
export function financeQuery(type, input, now = new Date()) {
  if (!PATHS[type]) throw new Error('지원하지 않는 조회입니다.');
  const page = Number(input.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('페이지 번호를 확인해주세요.');
  const params = new URLSearchParams({pageNumber:String(page),pageSize:'50'});
  if (type === 'vat-case') {
    const start = input.start || '', end = input.end || '';
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
    const firstOfMonth = today.slice(0,7) + '-01';
    if (!validDate(start) || !validDate(end) || start > end || end >= firstOfMonth || Date.parse(end) - Date.parse(start) > 93*86400000) throw new Error('부가세는 전월 말일까지 최대 94일을 조회할 수 있습니다.');
    params.set('startDate',start); params.set('endDate',end);
  } else {
    const date = input.date || '';
    if (!validDate(date)) throw new Error('조회일을 YYYY-MM-DD로 입력해주세요.');
    params.set('searchDate',date);
    params.set('periodType','SETTLE_CASEBYCASE_SETTLE_BASIS_DATE');
    if (input.orderId) {
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(input.orderId)) throw new Error('주문 번호를 확인해주세요.');
      params.set('orderId',input.orderId);
    }
  }
  return { url:`https://api.commerce.naver.com/external/v1/pay-settle/${PATHS[type]}?${params}`, page };
}
export function financeResult(type, data, page, now = new Date()) {
  if (!FIELDS[type] || !Array.isArray(data?.elements)) throw new Error('네이버 응답 형식을 확인할 수 없습니다.');
  const elements = data.elements.map(row => Object.fromEntries(FIELDS[type].filter(key => row && Object.hasOwn(row,key)).map(key => [key,row[key]])));
  const totalPages = Number.isInteger(data.pagination?.totalPages) ? data.pagination.totalPages : null;
  return { elements, page, last: totalPages === null ? elements.length < 50 : page >= totalPages, totalPages, totalElements: Number.isInteger(data.pagination?.totalElements) ? data.pagination.totalElements : null, fetchedAt:now.toISOString() };
}
