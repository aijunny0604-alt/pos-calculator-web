import { useMemo, useState, useEffect } from 'react';
import { Menu, ArrowLeft, Sparkles, Crown, Package, Users, TrendingDown, BarChart3, RefreshCw, Settings, X, Check } from 'lucide-react';
import ChatPanel from '@/components/analytics/ChatPanel';
import useAIAnalystChat from '@/hooks/useAIAnalystChat';
import { hasGroqKey, saveGroqKey, getGroqKey, getProviderPreference, setProviderPreference } from '@/lib/aiAnalyst';

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
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [provider, setProvider] = useState(() => getProviderPreference());
  const [groqEnabled, setGroqEnabled] = useState(() => hasGroqKey());

  useEffect(() => {
    if (showSettings) setKeyInput(getGroqKey());
  }, [showSettings]);

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

  const handleSaveKey = () => {
    const trimmed = (keyInput || '').trim();
    if (trimmed && !trimmed.startsWith('gsk_')) {
      alert('Groq 키는 "gsk_"로 시작합니다. 다시 확인해주세요.');
      return;
    }
    saveGroqKey(trimmed);
    setGroqEnabled(Boolean(trimmed));
    setShowSettings(false);
  };

  const handleProviderChange = (value) => {
    setProvider(value);
    setProviderPreference(value);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)] overflow-hidden">
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
        <div className="text-[11px] sm:text-xs text-[var(--muted-foreground)] flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span title="주문 / 거래처 / 제품 건수" className="hidden sm:inline">
            📊 {orders.length} · {customers.length} · {products.length}
          </span>
          {groqEnabled && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] text-[10px] font-medium" title="Groq 폴백 활성화됨">
              ⚡ Groq
            </span>
          )}
          <button
            type="button"
            onClick={chat.clearCache}
            className="hover:text-[var(--foreground)] underline hidden sm:inline"
            title="저장된 답변 캐시 비우기"
          >
            캐시 초기화
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-1 rounded hover:bg-[var(--accent)]"
            aria-label="AI 설정"
            title="AI 설정 (Groq 키 입력, 프로바이더 선택)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                AI 설정
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded hover:bg-[var(--accent)]" aria-label="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Groq API 키 */}
            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5">⚡ Groq API 키 (폴백용)</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-2 break-keep leading-snug">
                Gemini 한도 초과 시 자동 사용. 무료 발급:{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline">
                  console.groq.com/keys
                </a>
              </p>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm font-mono"
                autoComplete="off"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveKey}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90"
                >
                  <Check className="w-4 h-4" />
                  저장
                </button>
                {groqEnabled && (
                  <button
                    onClick={() => { saveGroqKey(''); setKeyInput(''); setGroqEnabled(false); }}
                    className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--accent)]"
                  >
                    삭제
                  </button>
                )}
              </div>
              {groqEnabled && <p className="text-xs text-[var(--success)] mt-1.5">✓ Groq 키 설정됨</p>}
            </div>

            {/* 프로바이더 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">AI 프로바이더</label>
              <div className="space-y-1.5">
                {[
                  { v: 'auto', label: '자동 (Gemini → Groq 폴백) — 추천' },
                  { v: 'gemini-only', label: 'Gemini만 사용' },
                  { v: 'groq-only', label: 'Groq만 사용 (키 필요)', disabled: !groqEnabled },
                ].map((opt) => (
                  <label key={opt.v} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${
                    provider === opt.v ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'
                  } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--accent)]'}`}>
                    <input
                      type="radio"
                      name="aiProvider"
                      value={opt.v}
                      checked={provider === opt.v}
                      disabled={opt.disabled}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      className="flex-shrink-0"
                    />
                    <span className="break-keep">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3 break-keep leading-snug">
              💡 키는 브라우저 localStorage에만 저장되며 서버로 전송되지 않습니다. 보안을 위해 Groq Console에서 정기 교체를 권장합니다.
            </div>
          </div>
        </div>
      )}

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
