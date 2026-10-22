// 개발 전용: 실제 App/채팅 훅/도구 검증을 통과시키되 AI와 DB 쓰기는 실행하지 않는다.
let turns = 0, cancellations = 0, complete;
const report = () => window.dispatchEvent(new CustomEvent('movis-navigation-stats', { detail: { turns, cancellations } }));
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
export function finishNavigationTurn() { complete?.(); }
export function mockMovisNavigation(url, options) {
  const route = url.pathname.split('/').at(-1);
  if (route === 'session') return json({ token: 'local-navigation-fixture' });
  if (route === 'status') return json({ connected: true, models: [{ model: 'navigation-fixture', displayName: '로컬 검증', isDefault: true }] });
  if (route === 'cancel') { cancellations++; report(); return json({ ok: true }); }
  if (route === 'tool') return json({ ok: true });
  if (route !== 'turn') return json({ ok: true });
  turns++; report();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      let ended = false;
      const abort = () => { if (ended) return; ended = true; complete = null; controller.error(new DOMException('중지됨', 'AbortError')); };
      options.signal?.addEventListener('abort', abort, { once: true });
      emit({ type: 'delta', itemId: 'navigation-answer', text: '주문 자료를 확인하고 있습니다. ' });
      complete = () => {
        if (ended) return;
        ended = true; complete = null;
        options.signal?.removeEventListener('abort', abort);
        for (const library of ['products', 'customers']) emit({ type: 'tool', name: 'readLibrary', args: { library, limit: 20 }, requestId: library });
        emit({ type: 'tool', name: 'saveOrder', requestId: 'sample-order', args: {
          businessIntent: 'sales_order', customerName: '샘플 모터스', priceType: 'wholesale',
          items: [{ productName: '스텐 밴딩 54-30', quantity: 2 }], memo: '페이지 이동 유지 검증 · 실제 저장 금지'
        } });
        emit({ type: 'done', answer: '페이지 이동 중에도 주문 준비를 완료했습니다. 확인 후 등록해주세요.', model: 'navigation-fixture' });
        controller.close();
      };
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
}
