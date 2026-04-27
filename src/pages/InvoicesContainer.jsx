import { useState } from 'react';
import InvoicesPage from './InvoicesPage';
import PaymentRegisterModal from '@/components/PaymentRegisterModal';
import BulkPaymentModal from '@/components/BulkPaymentModal';
import CustomerDetailModal from '@/components/CustomerDetailModal';

/**
 * InvoicesPage + 결제 관련 모달 3종을 묶은 컨테이너.
 * 명세서 화면에서 업체별 입금 등록 / 일괄 입금 / 업체 상세를
 * 페이지 이동 없이 같은 자리에서 처리.
 *
 * Phase 9: Cross-navigation (pos-payments-integration plan 참조)
 */
export default function InvoicesContainer({ customers = [], initialCustomerId = null }) {
  const [regOpen, setRegOpen] = useState(false);
  const [regPrefill, setRegPrefill] = useState({ customerId: null, recordId: null });

  const [bulkPay, setBulkPay] = useState(null); // { customer, records }
  const [customerDetail, setCustomerDetail] = useState(null);

  const handleOpenPayment = (customerId = null, recordId = null) => {
    setRegPrefill({ customerId, recordId });
    setRegOpen(true);
  };

  const handleOpenBulkPay = async (customerId) => {
    const cust = customers.find((c) => String(c.id) === String(customerId));
    if (!cust) return;
    const { supabase } = await import('@/lib/supabase');
    const records = await supabase.getPaymentRecords({ customerId: cust.id });
    const outstanding = (records || []).filter((r) => Number(r.balance) > 0);
    if (outstanding.length === 0) {
      alert('해당 업체에 미수 건이 없습니다');
      return;
    }
    setBulkPay({ customer: cust, records: outstanding });
  };

  const handleOpenCustomerDetail = (customerId) => {
    const cust = customers.find((c) => String(c.id) === String(customerId));
    if (!cust) return;
    setCustomerDetail(cust);
  };

  const reload = () => window.location.reload();

  return (
    <>
      <InvoicesPage
        customers={customers}
        initialCustomerId={initialCustomerId}
        onOpenPayment={handleOpenPayment}
        onOpenBulkPay={handleOpenBulkPay}
        onOpenCustomerDetail={handleOpenCustomerDetail}
      />

      <PaymentRegisterModal
        open={regOpen}
        onClose={() => setRegOpen(false)}
        onSaved={() => { setRegOpen(false); reload(); }}
        initialCustomerId={regPrefill.customerId}
        initialRecordId={regPrefill.recordId}
      />

      <BulkPaymentModal
        open={!!bulkPay}
        customer={bulkPay?.customer}
        records={bulkPay?.records}
        onClose={() => setBulkPay(null)}
        onSaved={() => { setBulkPay(null); reload(); }}
      />

      <CustomerDetailModal
        open={!!customerDetail}
        customer={customerDetail}
        onClose={() => setCustomerDetail(null)}
        onAddPayment={(cid, rid) => { setCustomerDetail(null); handleOpenPayment(cid, rid); }}
        onBulkPay={(cust, records) => { setCustomerDetail(null); setBulkPay({ customer: cust, records }); }}
      />
    </>
  );
}
