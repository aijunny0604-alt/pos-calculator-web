import { useState } from 'react';
import PaymentsPage from './PaymentsPage';
import PaymentRegisterModal from '@/components/PaymentRegisterModal';
import PaymentEditModal from '@/components/PaymentEditModal';
import CustomerDetailModal from '@/components/CustomerDetailModal';
import BulkPaymentModal from '@/components/BulkPaymentModal';

/**
 * PaymentsPage + 관련 모달 3종을 묶은 컨테이너.
 * App.jsx 복잡도를 낮추기 위해 자체 모달 state 관리.
 *
 * Phase 3 기준. Phase 4 이후 CustomerDetailModal은 CustomerList에서도 공유.
 */
export default function PaymentsContainer({ customers = [] }) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerPrefill, setRegisterPrefill] = useState({ customerId: null, recordId: null });

  const [editHistory, setEditHistory] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [bulkPay, setBulkPay] = useState(null); // { customer, records }

  const handleOpenPayment = (customerId = null, recordId = null) => {
    setRegisterPrefill({ customerId, recordId });
    setRegisterOpen(true);
  };
  const handleEditHistory = (h) => setEditHistory(h);
  const handleOpenCustomer = (c) => setCustomerDetail(c);

  const reload = () => window.location.reload();

  return (
    <>
      <PaymentsPage
        customers={customers}
        onOpenPayment={handleOpenPayment}
        onEditHistory={handleEditHistory}
        onOpenCustomer={handleOpenCustomer}
      />

      <PaymentRegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={() => { setRegisterOpen(false); reload(); }}
        initialCustomerId={registerPrefill.customerId}
        initialRecordId={registerPrefill.recordId}
      />

      <PaymentEditModal
        open={!!editHistory}
        history={editHistory}
        onClose={() => setEditHistory(null)}
        onSaved={() => { setEditHistory(null); reload(); }}
      />

      <CustomerDetailModal
        open={!!customerDetail}
        customer={customerDetail}
        onClose={() => setCustomerDetail(null)}
        onAddPayment={(cid, rid) => { setCustomerDetail(null); handleOpenPayment(cid, rid); }}
        onEditHistory={(h) => { setCustomerDetail(null); setEditHistory(h); }}
        onBulkPay={(cust, records) => { setCustomerDetail(null); setBulkPay({ customer: cust, records }); }}
      />

      <BulkPaymentModal
        open={!!bulkPay}
        customer={bulkPay?.customer}
        records={bulkPay?.records}
        onClose={() => setBulkPay(null)}
        onSaved={() => { setBulkPay(null); reload(); }}
      />
    </>
  );
}
