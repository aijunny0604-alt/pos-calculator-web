import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const base = process.env.POS_PREVIEW_URL || 'http://127.0.0.1:5174/pos-calculator-web';
async function openFixture(config, params = '') {
  const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, hasTouch: config.width < 768 });
  page.setDefaultTimeout(9000);
  await page.route('**/*', route => route.request().url().startsWith(new URL(base).origin) ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/tests/order-return-ui.html?${params}${config.customer ? '&customer' : ''}`);
  if (config.customer) {
    await page.getByRole('heading', { name: '교환 검증 샘플 업체' }).click();
    await page.getByText('기존 머플러팁', { exact: false }).first().click();
  }
  return { page, errors, returnButton: page.getByRole('button', { name: config.customer ? '반품 처리' : '반품', exact: true }) };
}
try {
  for (const config of [{ width: 1440, height: 900, customer: false }, { width: 390, height: 700, customer: false }, { width: 360, height: 620, customer: true }]) {
    const { page, errors, returnButton: createTrigger } = await openFixture(config);
    const editTrigger = page.getByRole('button', { name: '사유·교체 기록' }).first();
    await editTrigger.click();
    const dialog = page.getByRole('dialog', { name: '반품 기록 수정' });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await editTrigger.evaluate(button => document.activeElement === button));
    await editTrigger.click();
    assert.equal(await dialog.getByLabel('처리 유형').inputValue(), 'return');
    await dialog.getByRole('button', { name: '교체 주문 선택' }).click();
    const list = dialog.getByRole('region', { name: '날짜별 교체 주문' });
    await list.getByRole('heading', { name: /2025년 9월 18일/ }).waitFor();
    const period = dialog.getByLabel('교체 주문 기간');
    await period.selectOption('7');
    assert.equal(await list.getByRole('button', { name: /DEMO-OLDER/ }).count(), 0);
    await period.selectOption('custom');
    await dialog.getByLabel('교체 주문 시작일').fill('2025-09-19');
    await dialog.getByLabel('교체 주문 종료일').fill('2025-09-18');
    await dialog.getByRole('status').getByText(/종료일을 시작일과/).waitFor();
    await dialog.getByLabel('교체 주문 시작일').fill('2025-09-18');
    await list.getByRole('button', { name: /DEMO-OLDER/ }).waitFor();
    assert.equal(await list.getByRole('button', { name: /DEMO-EXCHANGE/ }).count(), 0);
    await period.selectOption('all');
    const search = dialog.getByLabel('교체 주문 검색');
    await search.fill('없는제품');
    await dialog.getByRole('status').getByText(/조건에 맞는/).waitFor();
    await search.fill('SNPK114DS');
    await list.getByRole('button', { name: /DEMO-EXCHANGE/ }).waitFor();
    assert.equal(await list.getByRole('button', { name: /DEMO-OLDER/ }).count(), 0);
    await list.getByRole('button', { name: /DEMO-EXCHANGE/ }).click();
    assert.equal(await dialog.getByLabel('처리 유형').inputValue(), 'exchange');
    await dialog.getByText('교체 머플러팁 SNPK 114D-S').waitFor();
    await dialog.getByText('4개', { exact: true }).waitFor();
    await dialog.getByLabel(/^반품 사유/).selectOption('오배송');
    await dialog.getByText('주문 금액 차액 +308,880원').waitFor();
    await dialog.getByLabel('상세 사유', { exact: false }).fill('다른 품목이 출고됐습니다.');
    const edit = dialog.getByRole('button', { name: '기록 저장' });
    await edit.click();
    await dialog.getByRole('alert').getByText('샘플 저장 실패').waitFor();
    await dialog.getByText('DEMO-EXCHANGE', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('상세 사유', { exact: false }).inputValue(), '다른 품목이 출고됐습니다.');
    await edit.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('반품 후 교체 · 오배송', { exact: true }).waitFor();
    const history = page.getByRole('region', { name: /반품 내역/ });
    await history.getByText(/^원주문일/).waitFor();
    await history.getByText(/^반품일/).waitFor();
    await history.getByText('기존 머플러팁', { exact: true }).waitFor();
    await history.getByText('교체 머플러팁 SNPK 114D-S', { exact: true }).waitFor();
    await history.getByText('교체 주문 DEMO-EXCHANGE', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '92400');
    await createTrigger.click();
    const create = page.getByRole('dialog', { name: '반품·교체 처리' });
    await create.waitFor();
    await page.keyboard.press('Escape');
    await create.waitFor({ state: 'hidden' });
    assert.ok(await createTrigger.evaluate(button => document.activeElement === button));
    await createTrigger.click();
    await create.getByText(/남은 3개/).waitFor();
    const submit = create.getByRole('button', { name: '반품 확정' });
    assert.equal(await submit.isEnabled(), false);
    await create.getByRole('button', { name: '남은 수량 모두 선택' }).click();
    assert.equal(await create.getByLabel('기존 머플러팁 반품 수량').inputValue(), '3');
    await create.getByLabel(/^반품 사유/).selectOption('고객 요청');
    const bounds = await submit.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= config.height);
    await submit.click();
    await create.waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '369600');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${config.width}px ${config.customer ? '거래처 상세' : '주문 상세'}: 날짜·기간·상품 검색, 주문 선택, 입력 보존, 잔여 반품 통과`);
  }
  for (const config of [
    { width: 1440, height: 900, customer: false, params: 'full', difference: '31,680' },
    { width: 360, height: 620, customer: true, params: 'multiple', difference: '124,080' },
  ]) {
    const { page, errors, returnButton } = await openFixture(config, config.params);
    await returnButton.click();
    if (config.params === 'multiple') {
      const picker = page.getByRole('dialog', { name: '반품 기록 선택' });
      await picker.getByRole('button', { name: /277,200원/ }).click();
    }
    const dialog = page.getByRole('dialog', { name: '반품 기록 수정' });
    await dialog.getByRole('button', { name: '교체 주문 선택' }).click();
    await dialog.getByRole('button', { name: /DEMO-EXCHANGE/ }).click();
    await dialog.getByLabel(/^반품 사유/).selectOption('주문 착오');
    await dialog.getByText(`주문 금액 차액 +${config.difference}원`).waitFor();
    const save = dialog.getByRole('button', { name: '기록 저장' });
    assert.equal(await save.isEnabled(), true);
    await save.click();
    await dialog.getByRole('alert').getByText('샘플 저장 실패').waitFor();
    await save.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('반품 후 교체 · 주문 착오', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '369600');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${config.width}px 전량 반품 ${config.params === 'multiple' ? '여러 건 선택' : '한 건 바로 수정'}: 기록 저장 활성화, 반품 총액 보존 통과`);
  }
  for (const config of [
    { width: 1440, height: 900, customer: false, method: 'courier', screen: 'history' },
    { width: 390, height: 700, customer: true, method: 'courier', screen: 'shipping' },
    { width: 390, height: 700, customer: false, method: 'pickup', screen: 'shipping' },
  ]) {
    const { page, errors, returnButton } = await openFixture(config, 'full');
    await returnButton.click();
    const dialog = page.getByRole('dialog', { name: '반품 기록 수정' });
    await dialog.getByRole('button', { name: '오늘 교체 주문 만들기' }).click();
    await dialog.getByLabel('교체 상품 검색').fill('SDQ94');
    await dialog.getByRole('button', { name: /출고 교체용 SDQ 94/ }).click();
    const quantity = dialog.getByRole('spinbutton', { name: '출고 교체용 SDQ 94 교체 수량' });
    await quantity.fill('6');
    await dialog.getByText(/재고 5개를 초과/).waitFor();
    await dialog.getByLabel(/^반품 사유/).selectOption('오배송');
    const submit = dialog.getByRole('button', { name: '기록 저장·교체 주문 접수' });
    assert.equal(await submit.isEnabled(), false);
    await quantity.fill('4');
    await dialog.getByLabel('출고 방법').selectOption(config.method);
    await dialog.getByText('교체 주문 금액 401,280원').waitFor();
    await dialog.getByText('주문 금액 차액 +31,680원').waitFor();
    await submit.click();
    await dialog.getByRole('alert').getByText('샘플 저장 실패').waitFor();
    assert.equal(await quantity.inputValue(), '4');
    await submit.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('교체 주문 DEMO-NEW-EXCHANGE', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('반품 금액 저장값').textContent(), '369600');
    if (config.screen === 'history') {
      await page.getByRole('button', { name: '샘플 주문 이력' }).click();
      const card = page.locator('.order-history-card[data-exchange=true]').filter({ hasText: 'DEMO-NEW-EXCHANGE' });
      await card.getByText('반품 교체', { exact: true }).waitFor();
      await card.getByText('원주문 DEMO-ORIGINAL', { exact: true }).waitFor();
      assert.ok(await card.evaluate(element => element.style.background.includes('--purple')));
    } else {
      await page.getByRole('button', { name: '샘플 택배 송장' }).click();
      const card = page.locator('.shipping-recipient-card').filter({ hasText: '출고 교체용 SDQ 94' });
      if (config.method === 'courier') await card.getByText('반품 교체', { exact: true }).waitFor();
      else assert.equal(await card.count(), 0);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${config.width}px 교체 상품 신속 접수: 상품·수량·금액·차액, 재고 검증, ${config.screen} 배지/배송 구분 통과`);
  }
  const { page, errors } = await openFixture({ width: 1440, height: 900 }, 'undo');
  const snapshot = {
    id: 'DEMO-ORIGINAL', created_at: '2026-11-25T05:35:21.959657+00:00',
    customer_name: '샘플 업체', total: 369600, total_returned: 369600, subtotal: 336000, vat: 33600,
    memo: '샘플 메모', memo_checked: true, items: [{ id: 1, name: '기존 팁', quantity: 4, price: 92400 }],
    returns: [{ returnId: 'RET-old', quantity: 4, returnDetails: { exchangeOrderNumber: 'DEMO-EXCHANGE' } }],
    exchange_delivery_method: 'courier', exchange_origin_order_id: 'DEMO-PREVIOUS', exchange_origin_return_id: 'RET-previous',
  };
  await page.evaluate(row => {
    const fetchOther = window.fetch.bind(window);
    window.restoreRequests = [];
    window.fetch = async (url, options) => {
      if (!String(url).includes('/rest/v1/orders')) return fetchOther(url, options);
      window.restoreRequests.push({
        method: options.method,
        prefer: new Headers(options.headers).get('prefer'),
        payload: options.body ? JSON.parse(options.body) : null,
      });
      return new Response(JSON.stringify([row]), { headers: { 'Content-Type': 'application/json' } });
    };
  }, snapshot);
  await page.getByRole('button', { name: '샘플 주문 삭제', exact: true }).click();
  await page.getByRole('button', { name: '샘플 주문 복원', exact: true }).click();
  await page.getByText('샘플 주문 복원 완료', { exact: true }).waitFor();
  const requests = await page.evaluate(() => window.restoreRequests);
  assert.deepEqual(requests.map(request => request.method), ['DELETE', 'POST']);
  assert.equal(requests[0].prefer, 'return=representation');
  assert.deepEqual(requests[1].payload, snapshot);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('삭제 직전 원주문의 날짜·단가·반품·교체 데이터가 복원 요청에 그대로 전달됨');
} finally {
  await browser.close();
}
