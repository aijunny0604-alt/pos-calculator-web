import { useMemo } from 'react';
import { Menu, ArrowLeft, Sparkles, Crown, Package, Users, TrendingDown, BarChart3, RefreshCw } from 'lucide-react';
import ChatPanel from '@/components/analytics/ChatPanel';
import useAIAnalystChat from '@/hooks/useAIAnalystChat';

// 기본 추천 질문 (MVP 5개 + 옵션 추가 가능)
const DEFAULT_PROMPTS = [
  { id: 'topRevenue', label: '이번 달 매출 TOP 5', icon: Crown },
  { id: 'vipSegments', label: 'VIP 세그먼트 분석', icon: Users },
  { id: 'topProducts', label: '인기 제품 TOP 10', icon: Package },
  { id: 'reactivate', label: '재주문 유도 추천 액션', icon: RefreshCw },
  { id: 'dormant', label: '휴면 거래처 알려줘', icon: TrendingDown },
  { id: 'summary', label: '이번 달 전체 요약', icon: BarChart3 },
];

export default function AIAnalytics({ orders = [], customers = [], products = [], setCurrentPage }) {
  const chat = useAIAnalystChat({ orders, customers, products });

  // 사용 빈도 적용한 추천 질문 정렬
  const sortedPrompts = useMemo(() => {
    const usage = chat.getUsage();
    return [...DEFAULT_PROMPTS].sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0))
      .map((p) => ({ ...p, count: usage[p.id] || 0 }));
  }, [chat.messages]); // 새 메시지마다 재정렬

  const dataReady = orders.length > 0 || customers.length > 0 || products.length > 0;

  const handleSelect = (item) => {
    chat.send(item.label, { promptId: item.id });
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--background)] overflow-hidden">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-[var(--border)] bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* 모바일 햄버거 / 데스크탑 뒤로가기 */}
          <button
            type="button"
            className="md:hidden p-1.5 rounded hover:bg-[var(--accent)] flex-shrink-0"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
            aria-label="사이드바 열기"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="hidden md:flex items-center gap-1 p-1.5 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] flex-shrink-0"
            onClick={() => setCurrentPage?.('dashboard')}
            aria-label="대시보드로"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs">대시보드</span>
          </button>
          <h1 className="flex items-center gap-2 text-lg sm:text-2xl font-black break-keep min-w-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--primary)] flex-shrink-0" />
            AI 분석
          </h1>
        </div>
        <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)] hidden sm:flex items-center gap-3 flex-shrink-0">
          <span title="주문 / 거래처 / 제품 건수">
            📊 {orders.length} · {customers.length} · {products.length}
          </span>
          <button
            type="button"
            onClick={chat.clearCache}
            className="hover:text-[var(--foreground)] underline"
            title="저장된 답변 캐시 비우기"
          >
            캐시 초기화
          </button>
        </div>
      </div>

      {/* 데이터 부족 안내 */}
      {!dataReady && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex-shrink-0">
          ⚠️ 데이터를 불러오는 중입니다. 잠시만 기다려주세요.
        </div>
      )}

      {/* 메인 채팅 */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          messages={chat.messages}
          onSend={chat.send}
          isLoading={chat.isLoading}
          loadingStep={chat.loadingStep}
          suggestedItems={sortedPrompts}
          onSelectSuggested={handleSelect}
          onClear={chat.clear}
          onCancel={chat.cancel}
          disabled={!dataReady}
        />
      </div>
    </div>
  );
}
