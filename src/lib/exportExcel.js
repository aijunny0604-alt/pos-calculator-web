import { customerOrders } from './paymentIdentity';
import { kstDate } from './invoiceLedger';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const fmt = (n) => Number(n || 0);
const safeName = (s) => String(s || '').replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 20);

function styleHeader(row, color = 'FFE0E7FF') {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

export async function exportPaymentsExcel({ records, history, customers }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'pos-payments';
  wb.created = new Date();

  const customerName = (id) => customers.find((c) => String(c.id) === String(id))?.name || `#${id}`;

  // Sheet 1: 결제 레코드
  const s1 = wb.addWorksheet('결제 레코드');
  s1.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '업체', key: 'customer', width: 20 },
    { header: '주문 ID', key: 'order_id', width: 10 },
    { header: '세금계산서 번호', key: 'invoice_number', width: 16 },
    { header: '발행일', key: 'invoice_date', width: 12 },
    { header: '납기일', key: 'due_date', width: 12 },
    { header: '총액', key: 'total_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '입금액', key: 'paid_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '잔금', key: 'balance', width: 14, style: { numFmt: '#,##0' } },
    { header: '상태', key: 'payment_status', width: 10 },
    { header: '메모', key: 'memo', width: 30 },
    { header: '생성일', key: 'created_at', width: 18 },
  ];
  records.forEach((r) => s1.addRow({
    ...r,
    customer: customerName(r.customer_id),
    total_amount: fmt(r.total_amount),
    paid_amount: fmt(r.paid_amount),
    balance: fmt(r.balance),
  }));
  s1.getRow(1).font = { bold: true };
  s1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

  // Sheet 2: 입금 이력
  const s2 = wb.addWorksheet('입금 이력');
  s2.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '결제 레코드 ID', key: 'payment_record_id', width: 14 },
    { header: '구분', key: 'type_label', width: 8 },
    { header: '금액', key: 'amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '방법', key: 'method', width: 10 },
    { header: '메모', key: 'memo', width: 30 },
    { header: '입금일시', key: 'paid_at', width: 20 },
  ];
  history.forEach((h) => s2.addRow({ ...h, type_label: h.type === 'expense' ? '출금' : '입금', amount: fmt(h.amount) }));
  s2.getRow(1).font = { bold: true };
  s2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

  // Sheet 3: 업체별 미수 합계
  const s3 = wb.addWorksheet('업체별 미수');
  s3.columns = [
    { header: '업체', key: 'customer', width: 20 },
    { header: '미수 건수', key: 'count', width: 12 },
    { header: '이월 잔금 (음수=선입금)', key: 'balance', width: 16, style: { numFmt: '#,##0' } },
  ];
  const byCustomer = new Map();
  for (const r of records) {
    if (!r.customer_id) continue;
    const prev = byCustomer.get(String(r.customer_id)) || { count: 0, balance: 0 };
    byCustomer.set(String(r.customer_id), {
      count: prev.count + (Number(r.balance) > 0 ? 1 : 0),
      balance: prev.balance + Number(r.balance),
    });
  }
  const sorted = [...byCustomer.entries()].sort((a, b) => b[1].balance - a[1].balance);
  for (const [id, v] of sorted) {
    s3.addRow({ customer: customerName(id), count: v.count, balance: v.balance });
  }
  s3.getRow(1).font = { bold: true };
  s3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = kstDate();
  saveAs(blob, `pos-payments_${dateStr}.xlsx`);
}

// 단일 업체 종합 리포트 (5시트, 주문 품목 포함)
export async function exportCustomerReport({ customer, records, history, settings, orders = [], customers = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.company_name || 'pos-payments';
  wb.created = new Date();

  const myRecords = records.filter((r) => String(r.customer_id) === String(customer.id));
  const myRecordIds = new Set(myRecords.map((r) => String(r.id)));
  const myHistory = history.filter((h) => myRecordIds.has(String(h.payment_record_id)));
  const totalAmt = myRecords.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const paidAmt = myRecords.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const balance = myRecords.reduce((s, r) => s + Number(r.balance || 0), 0);
  const today = kstDate();

  // 시트 1: 요약
  const s0 = wb.addWorksheet('요약');
  s0.columns = [{ width: 20 }, { width: 30 }];
  s0.addRow(['📊 업체 종합 리포트']).font = { bold: true, size: 14 };
  s0.addRow([]);
  s0.addRow(['발행일', today]);
  s0.addRow(['업체명', customer.name || `#${customer.id}`]);
  s0.addRow(['전화', customer.phone || '-']);
  s0.addRow(['주소', customer.address || '-']);
  s0.addRow([]);
  s0.addRow(['━━ 결제 요약 ━━']).font = { bold: true };
  s0.addRow(['총 결제 건수', `${myRecords.length}건`]);
  s0.addRow(['총 청구 금액', totalAmt]).getCell(2).numFmt = '#,##0"원"';
  s0.addRow(['순입금 (입금−출금)', paidAmt]).getCell(2).numFmt = '#,##0"원"';
  s0.addRow(['이월 잔금 (음수=선입금)', balance]).getCell(2).numFmt = '#,##0"원"';
  s0.addRow(['입출금 이력', `${myHistory.length}건`]);
  s0.addRow([]);
  if (settings) {
    s0.addRow(['━━ 발행 정보 ━━']).font = { bold: true };
    s0.addRow(['회사', settings.company_name || '']);
    s0.addRow(['연락처', settings.company_phone || '']);
    s0.addRow(['계좌', settings.bank_account || '']);
  }

  // 시트 2: 미수 결제
  const s1 = wb.addWorksheet('미수 결제');
  s1.columns = [
    { header: '세금계산서', key: 'invoice_number', width: 18 },
    { header: '발행일', key: 'invoice_date', width: 12 },
    { header: '납기일', key: 'due_date', width: 12 },
    { header: '주문 ID', key: 'order_id', width: 16 },
    { header: '총액', key: 'total_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '입금', key: 'paid_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '잔금', key: 'balance', width: 14, style: { numFmt: '#,##0' } },
    { header: '구분', key: 'category_label', width: 10 },
    { header: '공급가액', key: 'supply_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '부가세', key: 'vat_amount', width: 12, style: { numFmt: '#,##0' } },
    { header: '비과세', key: 'is_vat_exempt_label', width: 8 },
    { header: '상태', key: 'payment_status', width: 8 },
    { header: '세금계산서', key: 'invoice_status', width: 10 },
  ];
  myRecords.filter((r) => Number(r.balance) > 0).forEach((r) => s1.addRow({
    ...r,
    total_amount: fmt(r.total_amount),
    paid_amount: fmt(r.paid_amount),
    balance: fmt(r.balance),
    category_label: r.category || 'sales',
    supply_amount: fmt(r.supply_amount ?? (Number(r.total_amount) - Number(r.vat_amount || 0))),
    vat_amount: fmt(r.vat_amount),
    is_vat_exempt_label: r.is_vat_exempt ? '비과세' : '',
    payment_status: r.payment_status === 'partial' ? '부분' : '미수',
    invoice_status: r.invoice_issued ? '✅ 발행' : '⏳ 미발행',
  }));
  styleHeader(s1.getRow(1), 'FFFECACA');

  // 시트 3: 입금 이력
  const s2 = wb.addWorksheet('입금 이력');
  s2.columns = [
    { header: '입금일시', key: 'paid_at', width: 18 },
    { header: '구분', key: 'type', width: 8 },
    { header: '금액', key: 'amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '방법', key: 'method', width: 10 },
    { header: '결제 레코드', key: 'record_label', width: 20 },
    { header: '메모', key: 'memo', width: 30 },
  ];
  myHistory.forEach((h) => {
    const rec = myRecords.find((r) => String(r.id) === String(h.payment_record_id));
    s2.addRow({
      ...h,
      type: h.type === 'expense' ? '출금' : '입금',
      amount: fmt(h.amount),
      record_label: rec ? (rec.invoice_number || `#${rec.id}`) : '-',
    });
  });
  styleHeader(s2.getRow(1), 'FFD1FAE5');

  // 시트 4: 주문 품목 상세
  // 명시 업체 ID / 원장 연결 / 전체 거래처의 유일 일치 순으로 범위를 확인한다.
  const myOrders = customerOrders(customer, orders, records, customers);
  const s4 = wb.addWorksheet('주문 품목 상세');
  s4.columns = [
    { header: '주문일', key: 'order_date', width: 16 },
    { header: '주문 ID', key: 'order_id', width: 18 },
    { header: '품목명', key: 'name', width: 30 },
    { header: '수량', key: 'quantity', width: 8 },
    { header: '단가', key: 'price', width: 12, style: { numFmt: '#,##0' } },
    { header: '소계', key: 'subtotal', width: 14, style: { numFmt: '#,##0' } },
    { header: '주문 원금', key: 'order_total', width: 14, style: { numFmt: '#,##0' } },
    { header: '반품액', key: 'return_total', width: 14, style: { numFmt: '#,##0' } },
    { header: '반품 후 금액', key: 'net_total', width: 14, style: { numFmt: '#,##0' } },
  ];
  myOrders.forEach((o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    if (items.length === 0) {
      s4.addRow({
        order_date: (o.created_at || '').slice(0, 16).replace('T', ' '),
        order_id: o.id,
        name: '(품목 정보 없음)',
        order_total: fmt(o.total),
        return_total: fmt(o.total_returned), net_total: fmt(o.total) - fmt(o.total_returned),
      });
      return;
    }
    items.forEach((it, idx) => {
      const qty = Number(it.quantity || 1);
      const price = Number(it.price || 0);
      s4.addRow({
        order_date: idx === 0 ? (o.created_at || '').slice(0, 16).replace('T', ' ') : '',
        order_id: idx === 0 ? o.id : '',
        name: it.name || it.product_name || '(이름 없음)',
        quantity: qty,
        price: fmt(price),
        subtotal: fmt(qty * price),
        order_total: idx === 0 ? fmt(o.total) : '',
        return_total: idx === 0 ? fmt(o.total_returned) : '',
        net_total: idx === 0 ? fmt(o.total) - fmt(o.total_returned) : '',
      });
    });
  });
  styleHeader(s4.getRow(1), 'FFFEF3C7');

  // 시트 5: 전체 결제 레코드
  const s3 = wb.addWorksheet('전체 결제 레코드');
  s3.columns = [
    { header: '세금계산서', key: 'invoice_number', width: 18 },
    { header: '발행일', key: 'invoice_date', width: 12 },
    { header: '주문 ID', key: 'order_id', width: 16 },
    { header: '총액', key: 'total_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '입금', key: 'paid_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '잔금', key: 'balance', width: 14, style: { numFmt: '#,##0' } },
    { header: '구분', key: 'category_label', width: 10 },
    { header: '공급가액', key: 'supply_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '부가세', key: 'vat_amount', width: 12, style: { numFmt: '#,##0' } },
    { header: '비과세', key: 'is_vat_exempt_label', width: 8 },
    { header: '상태', key: 'payment_status', width: 8 },
    { header: '세금계산서', key: 'invoice_status', width: 10 },
    { header: '생성일', key: 'created_at', width: 18 },
  ];
  myRecords.forEach((r) => s3.addRow({
    ...r,
    total_amount: fmt(r.total_amount),
    paid_amount: fmt(r.paid_amount),
    balance: fmt(r.balance),
    category_label: r.category || 'sales',
    supply_amount: fmt(r.supply_amount ?? (Number(r.total_amount) - Number(r.vat_amount || 0))),
    vat_amount: fmt(r.vat_amount),
    is_vat_exempt_label: r.is_vat_exempt ? '비과세' : '',
    payment_status: r.payment_status === 'paid' ? '완납' : r.payment_status === 'partial' ? '부분' : '미수',
    invoice_status: r.invoice_issued ? '✅ 발행' : '⏳ 미발행',
  }));
  styleHeader(s3.getRow(1), 'FFE0E7FF');

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${safeName(customer.name) || customer.id}_${today}.xlsx`);
}

// 필터된 결제 레코드 + 입금 이력 Excel
export async function exportFilteredExcel({ records, history, customers, label = '필터결과' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'pos-payments';
  wb.created = new Date();
  const customerName = (id) => customers.find((c) => String(c.id) === String(id))?.name || `#${id}`;
  const recordIds = new Set(records.map((r) => String(r.id)));
  const filteredHistory = history.filter((h) => recordIds.has(String(h.payment_record_id)));

  const s1 = wb.addWorksheet('결제 레코드');
  s1.columns = [
    { header: '업체', key: 'customer', width: 20 },
    { header: '세금계산서', key: 'invoice_number', width: 16 },
    { header: '발행일', key: 'invoice_date', width: 12 },
    { header: '납기', key: 'due_date', width: 12 },
    { header: '총액', key: 'total_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '입금', key: 'paid_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '잔금', key: 'balance', width: 14, style: { numFmt: '#,##0' } },
    { header: '구분', key: 'category_label', width: 10 },
    { header: '공급가액', key: 'supply_amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '부가세', key: 'vat_amount', width: 12, style: { numFmt: '#,##0' } },
    { header: '비과세', key: 'is_vat_exempt_label', width: 8 },
    { header: '상태', key: 'payment_status', width: 8 },
    { header: '세금계산서', key: 'invoice_status', width: 10 },
  ];
  records.forEach((r) => s1.addRow({
    ...r,
    customer: customerName(r.customer_id),
    total_amount: fmt(r.total_amount),
    paid_amount: fmt(r.paid_amount),
    balance: fmt(r.balance),
    category_label: r.category || 'sales',
    supply_amount: fmt(r.supply_amount ?? (Number(r.total_amount) - Number(r.vat_amount || 0))),
    vat_amount: fmt(r.vat_amount),
    is_vat_exempt_label: r.is_vat_exempt ? '비과세' : '',
    payment_status: r.payment_status === 'paid' ? '완납' : r.payment_status === 'partial' ? '부분' : '미수',
    invoice_status: r.invoice_issued ? '✅ 발행' : '⏳ 미발행',
  }));
  styleHeader(s1.getRow(1), 'FFE0E7FF');

  const s2 = wb.addWorksheet('입금 이력');
  s2.columns = [
    { header: '업체', key: 'customer', width: 20 },
    { header: '입금일시', key: 'paid_at', width: 18 },
    { header: '구분', key: 'type', width: 8 },
    { header: '금액', key: 'amount', width: 14, style: { numFmt: '#,##0' } },
    { header: '방법', key: 'method', width: 10 },
    { header: '메모', key: 'memo', width: 30 },
  ];
  filteredHistory.forEach((h) => {
    const rec = records.find((r) => String(r.id) === String(h.payment_record_id));
    s2.addRow({
      ...h,
      type: h.type === 'expense' ? '출금' : '입금',
      amount: fmt(h.amount),
      customer: rec ? customerName(rec.customer_id) : '-',
    });
  });
  styleHeader(s2.getRow(1), 'FFD1FAE5');

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${safeName(label)}_${kstDate()}.xlsx`);
}
