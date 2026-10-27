const TYPES = new Set(['settlements','settlement-case','commission-details','vat-case']);
export async function fetchStoreFinance(type, args, fetcher = globalThis.fetch) {
  if (!TYPES.has(type)) throw new Error('지원하지 않는 조회입니다.');
  const base = 'http://127.0.0.1:43128';
  let session;
  try { session = await fetcher(`${base}/session`, { signal: AbortSignal.timeout(5000) }); } catch { throw new Error('매장 PC 스토어 연결 프로그램을 실행해주세요.'); }
  if (!session.ok) throw new Error('매장 PC 스토어 연결을 확인해주세요.');
  const auth = await session.json();
  if (!auth.token) throw new Error('스토어 연결 인증을 확인하지 못했습니다.');
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(args)) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  let response;
  try { response = await fetcher(`${base}/${type}?${params}`, { headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('네이버 조회 연결이 끊겼습니다. 매장 PC 연결을 확인해주세요.'); }
  let data; try { data = await response.json(); } catch { throw new Error('스토어 연결 응답을 확인할 수 없습니다. 연결 프로그램을 최신 버전으로 실행해주세요.'); }
  if (!response.ok) throw new Error(response.status === 404 ? '매장 PC 스토어 연결 프로그램을 최신 버전으로 다시 실행해주세요.' : data.error || '네이버 조회 실패');
  if (!Array.isArray(data.elements)) throw new Error('네이버 응답 형식을 확인할 수 없습니다.');
  return data;
}
