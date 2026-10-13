// Keep MOVIS reads from occupying every connection on small POS databases.
export async function runMovisReads(items, read, signal, concurrency = 2, timeoutMs = 60000) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException(
    'POS 자료 조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', 'TimeoutError'
  )), timeoutMs);
  let next = 0;
  const throwIfAborted = () => {
    if (controller.signal.aborted) throw controller.signal.reason || new Error('POS 자료 조회가 중지되었습니다.');
  };
  async function worker() {
    while (next < items.length) {
      throwIfAborted();
      const index = next++;
      await read(items[index], index, controller.signal);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    throwIfAborted();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
