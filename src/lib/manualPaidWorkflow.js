// 같은 화면의 여러 훅/연속 클릭을 직렬화한다. 다른 기기의 경쟁은 서버 트랜잭션이 필요하다.
const pending = new Set();
export async function runManualPaidChange(api, orderId, method) {
  const key = String(orderId || '');
  if (!key || (method !== null && !['card','cash','transfer','other'].includes(method))) return {success:false,reason:'invalid_args'};
  if (pending.has(key)) return {success:false,reason:'busy'};
  pending.add(key);
  try {
    if (method === null) {
      if (!await api.revokeAutoPaidHistory(orderId)) return {success:false,reason:'revoke_failed'};
      if (!await api.deleteManualPaid(orderId)) return {success:false,reason:'marker_delete_failed'};
      return {success:true};
    }
    // 같은 결제수단도 다시 검증한다. 이전 실패를 로컬 표시만 보고 건너뛰지 않는다.
    const result = await api.syncOrderPaidRecord(orderId, method);
    if (!result?.success) return result || {success:false,reason:'exception'};
    const marker = await api.upsertManualPaid(orderId, method);
    if (String(marker?.order_id) !== key || marker?.method !== method) return {success:false,reason:'marker_save_failed'};
    return {...result, marker};
  } catch {
    return {success:false,reason:'exception'};
  } finally { pending.delete(key); }
}

export function manualPaidError(result) {
  const messages = {
    busy:'이 주문의 결제를 처리 중입니다. 잠시 기다려주세요.',
    no_customer:'거래처를 정확히 연결하지 못했습니다. 업체명·연락처와 거래처 등록을 확인해주세요.',
    no_order:'최신 주문을 조회하지 못했습니다. 새로고침 후 확인해주세요.',
    zero_total:'정산할 주문 금액이 없습니다.',
    return_review_required:'반품 주문에 결제 원장이 없습니다. 실제 청구·환불 금액을 확인한 뒤 원장을 등록해주세요.',
    order_ledger_mismatch:'주문과 결제 원장의 금액 또는 업체가 다릅니다. 명세서를 대조한 뒤 처리해주세요.',
    duplicate_records:'한 주문에 결제 원장이 여러 건 연결되어 있습니다. 명세서를 확인해주세요.',
    marker_save_failed:'입금은 반영됐지만 완불 표시 저장을 확인하지 못했습니다. 새로고침 후 다시 확인해주세요.',
    revoke_failed:'자동 입금 취소를 완료하지 못했습니다. 완불 표시는 유지했습니다. 입금 이력을 확인해주세요.',
    marker_delete_failed:'자동 입금 취소 후 완불 표시 삭제를 확인하지 못했습니다. 새로고침 후 취소를 다시 시도해주세요.',
  };
  return messages[result?.reason] || '입금 처리 결과를 확인하지 못했습니다. 완불 표시를 변경하지 않았습니다. 입금 이력을 새로고침해 확인해주세요.';
}
