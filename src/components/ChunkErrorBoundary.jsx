import { Component } from 'react';
import * as Sentry from '@sentry/react';

// lazy(import()) 청크 로드 실패를 잡는 에러 바운더리.
// 흰 화면 주범: 재배포로 옛 청크 해시가 404가 되거나(사용자가 옛 index 띄워둠), iPhone/느린 네트워크에서
// dynamic import 가 reject 되면 React 트리 전체가 언마운트 → 복구 불가 흰 화면.
// Suspense 는 "로딩 중"만 처리하고 "로드 실패"는 못 잡으므로 이 바운더리가 필수.
const CHUNK_ERR_RE = /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically/i;
const RELOAD_FLAG = 'pos_chunk_reload_v1';

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    return { hasError: true, isChunkError: CHUNK_ERR_RE.test(msg) };
  }

  componentDidMount() {
    // 정상 렌더 성공 시 자동 새로고침 가드 해제 → 다음 재배포 때도 1회 자동 복구 가능
    if (!this.state.hasError) {
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* noop */ }
    }
  }

  componentDidCatch(error, info) {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    const isChunk = CHUNK_ERR_RE.test(msg);
    try {
      Sentry.captureException(error, { extra: { componentStack: info?.componentStack, isChunk } });
    } catch { /* noop */ }

    if (isChunk) {
      // 재배포 청크 404 → 1회 자동 새로고침. 같은 세션 무한 루프 방지 가드.
      let already = false;
      try { already = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* noop */ }
      if (!already) {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* noop */ }
        window.location.reload();
      }
    }
  }

  handleRetry = () => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* noop */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4" style={{ minHeight: 320 }}>
          <div className="text-4xl">🔄</div>
          <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {this.state.isChunkError
              ? '새 버전이 배포되어 화면을 다시 불러와야 해요'
              : '화면을 불러오는 중 문제가 생겼어요'}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--primary)', color: 'white' }}
          >
            다시 불러오기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
