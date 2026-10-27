const base = 'http://127.0.0.1:43128';
export async function productRequest(path, { data, params } = {}, fetcher = fetch) {
  if (['product-snapshot','product-change/prepare','product-change/confirm'].includes(path)) {
    const { mobileCode, mobileRequest } = await import('./storeMobile');
    if (mobileCode()) return mobileRequest(path, { data, params });
  }
  let session;
  try { session = await fetcher(`${base}/session`, { signal: AbortSignal.timeout(5000) }); } catch { throw new Error('매장 PC에서 최신 스토어 연결 프로그램을 실행해주세요.'); }
  if (!session.ok) throw new Error('스토어 연결 인증을 확인해주세요.');
  const auth = await session.json();
  if (!auth.token) throw new Error('스토어 연결 인증을 확인하지 못했습니다.');
  let response;
  try { response = await fetcher(`${base}/${path}${params ? `?${new URLSearchParams(params)}` : ''}`, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${auth.token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(50000) }); }
  catch { throw new Error(path.endsWith('/confirm') ? '요청 결과를 확인하지 못했습니다. 다시 전송하지 말고 네이버 현재 상태를 확인해주세요.' : '스토어 연결이 끊겼습니다. 매장 PC 연결을 확인해주세요.'); }
  let result; try { result = await response.json(); } catch { throw new Error('연결 프로그램을 최신 버전으로 다시 실행해주세요.'); }
  if (!response.ok) throw new Error(response.status === 404 ? '매장 PC 연결 프로그램을 최신 버전으로 다시 실행해주세요.' : result.error || '네이버 상품 정보를 확인하지 못했습니다.');
  return result;
}
