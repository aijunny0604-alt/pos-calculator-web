import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { calcVat, DEFAULT_CATEGORIES, getCategoryInfo } from '@/lib/vatHelper';

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PaymentRegisterModal({ open, onClose, onSaved, initialCustomerId, initialRecordId }) {
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);

  // 신규 레코드 입력
  const [newCategory, setNewCategory] = useState('sales');
  const [newSupply, setNewSupply] = useState('');
  const [newVatExempt, setNewVatExempt] = useState(false);
  const [newOrderId, setNewOrderId] = useState('');
  const [newInvoiceDate, setNewInvoiceDate] = useState(todayISO());
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [vatRate, setVatRate] = useState(10);

  // 자동 계산 (공급가액 입력 → 부가세 + 합계)
  const calc = useMemo(
    () => calcVat({ supply: newSupply, vatRate, isExempt: newVatExempt }),
    [newSupply, vatRate, newVatExempt]
  );

  // 입금/출금 정보
  const [type, setType] = useState('income'); // income | expense
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('계좌이체');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [autoNumber, setAutoNumber] = useState(true);

  // 입금 건 세금 구분 + 부가 항목 (택배비/퀵비/수수료 등)
  const [taxStatus, setTaxStatus] = useState('taxable'); // 'taxable' | 'exempt'
  const [extraFees, setExtraFees] = useState([]); // [{ id, label, amount }]

  const addExtraFee = (label = '기타') => {
    setExtraFees((prev) => [...prev, { id: Date.now() + Math.random(), label, amount: '' }]);
  };
  const updateExtraFee = (id, patch) => {
    setExtraFees((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  };
  const removeExtraFee = (id) => {
    setExtraFees((prev) => prev.filter((f) => f.id !== id));
  };

  // 실시간 합계 계산
  const totals = useMemo(() => {
    const base = Number(amount) || 0;
    const feesSum = extraFees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    return { base, feesSum, grand: base + feesSum };
  }, [amount, extraFees]);

  const resetForm = () => {
    setMode('existing');
    setCustomerId(initialCustomerId ? String(initialCustomerId) : '');
    setRecords([]);
    setRecordId(initialRecordId ? String(initialRecordId) : '');
    setNewCategory('sales'); setNewSupply(''); setNewVatExempt(false);
    setNewOrderId(''); setNewInvoiceNumber(''); setNewDueDate('');
    setNewInvoiceDate(todayISO());
    setType('income');
    setAmount(''); setMethod('계좌이체'); setMemo(''); setError('');
    setAutoNumber(true);
    setTaxStatus('taxable');
    setExtraFees([]);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    Promise.all([supabase.getCustomers(), supabase.getSettings()]).then(([cs, st]) => {
      setCustomers(cs);
      if (st?.expense_categories) setCategories(st.expense_categories);
      if (st?.default_vat_rate) setVatRate(Number(st.default_vat_rate));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCustomerId, initialRecordId]);

  // 카테고리 변경 시 자동으로 비과세 토글
  useEffect(() => {
    const cat = getCategoryInfo(categories, newCategory);
    setNewVatExempt(cat.vat_exempt);
  }, [newCategory, categories]);

  useEffect(() => {
    if (!customerId || mode !== 'existing') { setRecords([]); return; }
    setRecordsLoading(true);
    supabase.getPaymentRecords({ customerId, hasBalance: true })
      .then((r) => {
        setRecords(r);
        // initialRecordId 있으면 유지, 없으면 첫 번째 선택
        setRecordId((prev) => {
          if (prev && r.some((x) => String(x.id) === String(prev))) return prev;
          return r[0]?.id || '';
        });
      })
      .finally(() => setRecordsLoading(false));
  }, [customerId, mode]);

  const selectedRecord = useMemo(
    () => records.find((r) => String(r.id) === String(recordId)),
    [records, recordId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === String(customerId)),
    [customers, customerId]
  );

  const handleSubmit = async () => {
    setError('');
    const baseNum = Number(amount);
    if (!baseNum || baseNum <= 0) { setError('입금액을 입력하세요'); return; }
    if (!customerId) { setError('업체를 선택하세요'); return; }
    // 부가 항목 중 label만 있고 금액 비어있는 행은 저장 제외
    const validFees = extraFees.filter((f) => Number(f.amount) > 0 && (f.label || '').trim());
    const feesSum = validFees.reduce((s, f) => s + Number(f.amount), 0);
    const amountNum = baseNum + feesSum;

    setSubmitting(true);
    try {
      let targetRecordId = recordId;

      if (mode === 'new') {
        const supply = Number(newSupply);
        if (!supply || supply <= 0) { setError('공급가액을 입력하세요'); setSubmitting(false); return; }
        let invoiceNum = newInvoiceNumber || null;
        if (autoNumber && !invoiceNum) {
          invoiceNum = await supabase.nextInvoiceNumber();
        }
        const newRec = await supabase.addPaymentRecord({
          order_id: newOrderId || null,
          customer_id: customerId,
          total_amount: calc.total,
          supply_amount: calc.supply,
          vat_amount: calc.vat,
          is_vat_exempt: newVatExempt,
          category: newCategory,
          invoice_date: newInvoiceDate || null,
          invoice_number: invoiceNum,
          due_date: newDueDate || null,
        });
        if (!newRec || !newRec[0]) { setError('결제 레코드 생성 실패'); setSubmitting(false); return; }
        targetRecordId = newRec[0].id;
      }

      if (!targetRecordId) { setError('주문/세금계산서를 선택하세요'); setSubmitting(false); return; }

      // memo 앞에 [과세/비과세] + 부가항목 태그 자동 prepend
      const tags = [];
      tags.push(`[${taxStatus === 'exempt' ? '비과세' : '과세'}]`);
      if (validFees.length > 0) {
        validFees.forEach((f) => tags.push(`[${f.label} ${fmt(f.amount)}원]`));
      }
      const tagPrefix = tags.join(' ');
      const finalMemo = [tagPrefix, (memo || '').trim()].filter(Boolean).join(' ').trim();

      const saved = await supabase.addPaymentHistory({
        payment_record_id: Number(targetRecordId),
        amount: amountNum,
        method,
        memo: finalMemo || null,
        type,
      });
      if (!saved) { setError('입금 저장 실패'); setSubmitting(false); return; }

      onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || '알 수 없는 오류');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const isIncome = type === 'income';
  const accent = isIncome ? 'green' : 'red';
  const accentBg = isIncome ? 'bg-green-600' : 'bg-red-600';
  const accentHover = isIncome ? 'hover:bg-green-500' : 'hover:bg-red-500';

  // 빠른 금액 버튼 (잔금 기준 + 프리셋)
  const quickAmounts = [];
  if (selectedRecord) {
    quickAmounts.push({ label: '전액', value: selectedRecord.balance });
    if (selectedRecord.balance >= 500000) quickAmounts.push({ label: '절반', value: Math.round(selectedRecord.balance / 2) });
  }
  const presets = [100000, 500000, 1000000];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl border-2 shadow-2xl bg-[var(--card)] modal-scroll-area"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', borderColor: isIncome ? '#16a34a' : '#dc2626' }}
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* ─── Header: 제목 + 입/출금 대형 탭 ───────── */}
        <div className="p-5 border-b border-[var(--border)] sticky top-0 bg-[var(--card)] z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-black flex items-center gap-2.5">
              <span className="text-3xl">{isIncome ? '💵' : '💸'}</span>
              <span>{isIncome ? '입금 등록' : '출금 등록'}</span>
            </h3>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] text-xl"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          {/* 대형 입/출금 토글 */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-[var(--secondary)]">
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-3 rounded-lg text-base font-bold transition-all flex items-center justify-center gap-2 ${
                isIncome ? 'bg-green-600 text-white shadow-lg scale-[1.02]' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
              }`}
            >
              💵 받은 돈 (입금)
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-3 rounded-lg text-base font-bold transition-all flex items-center justify-center gap-2 ${
                !isIncome ? 'bg-red-600 text-white shadow-lg scale-[1.02]' : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'
              }`}
            >
              💸 나간 돈 (환불/비용)
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* ─── STEP 1: 업체 선택 ───────────────────── */}
          <StepSection stepNum={1} title="어느 업체인가요?" color={accent}>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-[var(--border)] bg-[var(--background)] font-semibold"
              style={{ fontSize: '16px' }}
            >
              <option value="">👇 업체를 선택해주세요</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name || `#${c.id}`}</option>
              ))}
            </select>
            {selectedCustomer && (
              <div className="mt-2 text-[13px] text-[var(--muted-foreground)] px-1">
                ✓ <span className="font-bold text-[var(--foreground)]">{selectedCustomer.name}</span> 선택됨
              </div>
            )}
          </StepSection>

          {/* ─── STEP 2: 어디서 정산? (기존 / 신규) ───── */}
          {customerId && (
            <StepSection
              stepNum={2}
              title={isIncome ? '어느 건에서 정산할까요?' : '어느 건에서 차감할까요?'}
              color={accent}
            >
              <div className="grid grid-cols-2 gap-2 mb-3">
                <BigModeButton
                  active={mode === 'existing'}
                  onClick={() => setMode('existing')}
                  emoji="💰"
                  title="이미 있는 미수에서"
                  subtitle="기존 주문/세금계산서"
                />
                <BigModeButton
                  active={mode === 'new'}
                  onClick={() => setMode('new')}
                  emoji="🆕"
                  title="새 건으로 등록"
                  subtitle="세금계산서/주문 새로 생성"
                />
              </div>

              {/* 기존 미수 선택 */}
              {mode === 'existing' && (
                <>
                  {recordsLoading ? (
                    <p className="text-sm text-[var(--muted-foreground)] p-3">불러오는 중...</p>
                  ) : records.length === 0 ? (
                    <div className="text-sm p-3.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-600">
                      이 업체는 현재 미수가 없어요. <b>"🆕 새 건으로 등록"</b>을 눌러주세요.
                    </div>
                  ) : (
                    <>
                      <select
                        value={recordId}
                        onChange={(e) => setRecordId(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl border-2 border-[var(--border)] bg-[var(--background)] font-semibold"
                        style={{ fontSize: '16px' }}
                      >
                        {records.map((r) => {
                          let tag;
                          if (r.invoice_number) tag = `세금 ${r.invoice_number}`;
                          else if (r.order_id) tag = `주문 #${r.order_id}`;
                          else tag = `결제 #${r.id}`;
                          const dateTag = r.invoice_date ? ` (${String(r.invoice_date).slice(5)})` : '';
                          return (
                            <option key={r.id} value={r.id}>
                              {tag}{dateTag} · 잔 {fmt(r.balance)}원 / 총 {fmt(r.total_amount)}원
                            </option>
                          );
                        })}
                      </select>
                      {selectedRecord && (
                        <div className="mt-3 p-4 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-200">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <div className="text-[11px] text-gray-500 font-semibold">총액</div>
                              <div className="text-base font-bold tabular-nums text-gray-700">{fmt(selectedRecord.total_amount)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-gray-500 font-semibold">입금됨</div>
                              <div className="text-base font-bold tabular-nums text-green-600">{fmt(selectedRecord.paid_amount)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] text-red-500 font-semibold">잔금</div>
                              <div className="text-lg font-black tabular-nums text-red-600">{fmt(selectedRecord.balance)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* 신규 생성 */}
              {mode === 'new' && (
                <div className="space-y-4">
                  {/* 카테고리 */}
                  <Field label="📂 카테고리" required>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {categories.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setNewCategory(c.key)}
                          className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 text-xs font-semibold ${
                            newCategory === c.key
                              ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-md'
                              : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
                          }`}
                        >
                          <span className="text-xl mb-0.5">{c.icon}</span>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* 공급가액 */}
                  <Field label={`💰 공급가액 ${newVatExempt ? '(비과세)' : `(부가세 ${vatRate}% 자동)`}`} required>
                    <NumberInput value={newSupply} onChange={setNewSupply} placeholder="1,000,000" big />
                    <label className="mt-2 flex items-center gap-2 text-[13px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newVatExempt}
                        onChange={(e) => setNewVatExempt(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-[var(--muted-foreground)]">비과세 (부가세 없음)</span>
                    </label>
                  </Field>

                  {Number(newSupply) > 0 && (
                    <div className="p-3 rounded-xl bg-[var(--secondary)] grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">공급가액</div>
                        <div className="text-base font-bold tabular-nums">{fmt(calc.supply)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">부가세</div>
                        <div className={`text-base font-bold tabular-nums ${newVatExempt ? 'text-[var(--muted-foreground)]' : 'text-orange-500'}`}>
                          {newVatExempt ? '면제' : fmt(calc.vat)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--muted-foreground)]">합계</div>
                        <div className="text-base font-black tabular-nums text-[var(--primary)]">{fmt(calc.total)}</div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="🧾 세금계산서 번호">
                      <input
                        value={newInvoiceNumber}
                        onChange={(e) => { setNewInvoiceNumber(e.target.value); if (e.target.value) setAutoNumber(false); }}
                        className="w-full px-3 py-3 rounded-lg border-2 border-[var(--border)] bg-[var(--background)] disabled:opacity-50"
                        style={{ fontSize: '16px' }}
                        placeholder={autoNumber ? '저장 시 자동 채번' : 'INV-xxx'}
                        disabled={autoNumber}
                      />
                      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] cursor-pointer">
                        <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} className="w-3.5 h-3.5" />
                        자동 채번
                      </label>
                    </Field>
                    <Field label="📅 발행일">
                      <input type="date" value={newInvoiceDate} onChange={(e) => setNewInvoiceDate(e.target.value)} className="w-full px-3 py-3 rounded-lg border-2 border-[var(--border)] bg-[var(--background)]" style={{ fontSize: '16px' }} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="🔗 연결 주문 ID (선택)">
                      <input value={newOrderId} onChange={(e) => setNewOrderId(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-3 py-3 rounded-lg border-2 border-[var(--border)] bg-[var(--background)]" style={{ fontSize: '16px' }} placeholder="12345" />
                    </Field>
                    <Field label="⏰ 납기일 (선택)">
                      <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="w-full px-3 py-3 rounded-lg border-2 border-[var(--border)] bg-[var(--background)]" style={{ fontSize: '16px' }} />
                    </Field>
                  </div>
                </div>
              )}
            </StepSection>
          )}

          {/* ─── STEP 3: 금액 / 방법 / 메모 ─────────── */}
          {customerId && (
            <StepSection
              stepNum={3}
              title={isIncome ? '얼마 받으셨나요?' : '얼마를 차감하시나요?'}
              color={accent}
            >
              {/* 입금액 */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  {isIncome ? '받은 금액' : '차감 금액'} <span className="text-red-500">*</span>
                </label>
                <NumberInput
                  value={amount}
                  onChange={setAmount}
                  placeholder={selectedRecord ? String(selectedRecord.balance) : '500,000'}
                  big
                />
                {/* 빠른 금액 버튼 */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {quickAmounts.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setAmount(String(q.value))}
                      className={`px-3 py-1.5 text-sm font-bold rounded-lg ${accentBg} text-white ${accentHover} shadow-sm`}
                    >
                      {q.label} ({fmt(q.value)}원)
                    </button>
                  ))}
                  {presets.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-[var(--secondary)] border border-[var(--border)] hover:bg-[var(--background)]"
                    >
                      +{fmt(v)}
                    </button>
                  ))}
                  {Number(amount) > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount('')}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                    >
                      초기화
                    </button>
                  )}
                </div>
                {selectedRecord && amount && totals.grand > Number(selectedRecord.balance) && (
                  <p className="mt-2 text-sm text-orange-500 font-semibold">⚠️ 총 합계가 잔금보다 큼 (초과 입금)</p>
                )}
              </div>

              {/* 과세 / 비과세 토글 */}
              <div className="mt-4">
                <label className="block text-sm font-bold mb-2">🧾 세금 구분</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTaxStatus('taxable')}
                    className={`py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                      taxStatus === 'taxable'
                        ? 'bg-blue-600 border-blue-600 text-white shadow'
                        : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    📊 과세 (세금계산서 발행)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxStatus('exempt')}
                    className={`py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                      taxStatus === 'exempt'
                        ? 'bg-gray-700 border-gray-700 text-white shadow'
                        : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    🏷️ 비과세 (계산서 없음)
                  </button>
                </div>
              </div>

              {/* 부가 항목 (택배비/퀵비/수수료 등) */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold">📦 부가 항목 <span className="text-[11px] text-[var(--muted-foreground)] font-normal">(택배비/퀵비/수수료 등 같이 받은 항목)</span></label>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['택배비', '퀵비', '수수료', '기타'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addExtraFee(preset)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30 hover:bg-[var(--primary)]/20"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                {extraFees.length > 0 && (
                  <div className="space-y-1.5">
                    {extraFees.map((fee) => (
                      <div key={fee.id} className="flex items-center gap-2">
                        <input
                          value={fee.label}
                          onChange={(e) => updateExtraFee(fee.id, { label: e.target.value })}
                          className="w-24 px-2.5 py-2 rounded-lg border-2 border-[var(--border)] bg-[var(--background)] text-sm font-semibold"
                          placeholder="이름"
                        />
                        <div className="relative flex-1">
                          <input
                            inputMode="numeric"
                            value={fee.amount ? Number(fee.amount).toLocaleString('ko-KR') : ''}
                            onChange={(e) => updateExtraFee(fee.id, { amount: e.target.value.replace(/[^0-9]/g, '') })}
                            className="w-full px-3 py-2 pr-8 rounded-lg border-2 border-[var(--border)] bg-[var(--background)] text-sm font-bold text-right tabular-nums"
                            placeholder="0"
                            style={{ fontSize: '16px' }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">원</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExtraFee(fee.id)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                          title="삭제"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 💹 실시간 합계 모니터링 */}
              {(totals.base > 0 || totals.feesSum > 0) && (
                <div
                  className="mt-4 rounded-xl border-2 p-4 space-y-1.5"
                  style={{
                    background: isIncome ? 'linear-gradient(135deg, #dcfce7, #f0fdf4)' : 'linear-gradient(135deg, #fee2e2, #fef2f2)',
                    borderColor: isIncome ? '#16a34a' : '#dc2626',
                  }}
                >
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 font-semibold">{isIncome ? '받은 금액' : '차감 금액'}</span>
                    <span className="tabular-nums font-bold text-gray-800">{fmt(totals.base)}<span className="text-xs ml-0.5">원</span></span>
                  </div>
                  {extraFees.filter((f) => Number(f.amount) > 0).map((f) => (
                    <div key={f.id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">+ {f.label || '기타'}</span>
                      <span className="tabular-nums font-bold text-gray-700">{fmt(f.amount)}<span className="text-xs ml-0.5">원</span></span>
                    </div>
                  ))}
                  <div className="pt-1.5 mt-1 border-t border-gray-400/30 flex justify-between items-baseline">
                    <span className="text-sm font-bold text-gray-700">💹 총 합계 (저장값)</span>
                    <span className={`text-2xl font-black tabular-nums ${isIncome ? 'text-green-700' : 'text-red-700'}`}>
                      {fmt(totals.grand)}<span className="text-base ml-1">원</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                    <span>세금 구분: <b className="text-gray-700">{taxStatus === 'exempt' ? '비과세' : '과세'}</b></span>
                    <span>메모에 자동 기록</span>
                  </div>
                </div>
              )}

              {/* 결제 방법 */}
              <div className="mt-4">
                <label className="block text-sm font-bold mb-2">💳 결제 방법</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: '계좌이체', icon: '🏦' },
                    { key: '현금', icon: '💵' },
                    { key: '카드', icon: '💳' },
                    { key: '기타', icon: '📋' },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMethod(m.key)}
                      className={`py-3 rounded-xl border-2 text-sm font-bold transition-all flex flex-col items-center gap-1 ${
                        method === m.key
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-md scale-[1.02]'
                          : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--background)]'
                      }`}
                    >
                      <span className="text-xl">{m.icon}</span>
                      {m.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <div className="mt-4">
                <label className="block text-sm font-bold mb-2">📝 메모 (선택)</label>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--border)] bg-[var(--background)]"
                  style={{ fontSize: '16px' }}
                  placeholder="예: 2월분 잔금 이월, 일부 입금"
                />
              </div>
            </StepSection>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border-2 border-red-500/30 text-sm text-red-600 font-semibold">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ─── Footer: 취소 / 저장 ───────── */}
        <div className="p-5 pt-3 flex gap-3 sticky bottom-0 bg-[var(--card)] border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-xl text-base font-bold border-2 border-[var(--border)] bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--background)]"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount || !customerId}
            className={`flex-[2] py-4 rounded-xl text-base font-black text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${accentBg} ${accentHover}`}
          >
            {submitting ? (
              <>⏳ 저장 중...</>
            ) : (
              <>💾 {totals.grand > 0 ? `${fmt(totals.grand)}원 저장하기` : '저장하기'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트 ──────────────────────────────────
function StepSection({ stepNum, title, color = 'green', children }) {
  const badgeBg = color === 'green' ? 'bg-green-600' : color === 'red' ? 'bg-red-600' : 'bg-blue-600';
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`w-8 h-8 rounded-full text-white font-black flex items-center justify-center text-base shadow-md ${badgeBg}`}>
          {stepNum}
        </span>
        <h4 className="text-base font-bold">{title}</h4>
      </div>
      <div className="pl-1">{children}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-bold mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function BigModeButton({ active, onClick, emoji, title, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl border-2 text-left transition-all ${
        active
          ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-md scale-[1.02]'
          : 'bg-[var(--secondary)] border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--background)]'
      }`}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-sm font-bold leading-tight">{title}</div>
      <div className="text-[11px] opacity-80 mt-0.5">{subtitle}</div>
    </button>
  );
}

function NumberInput({ value, onChange, placeholder, big = false }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    onChange(raw);
  };
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value ? Number(value).toLocaleString('ko-KR') : ''}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] font-bold text-right ${
          big ? 'px-4 py-4 pr-12 text-2xl' : 'px-3 py-3 pr-10 text-base'
        }`}
        style={{ fontSize: big ? '22px' : '16px' }}
      />
      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] font-semibold ${big ? 'text-base' : 'text-sm'}`}>원</span>
    </div>
  );
}
