// 추천 질문 칩 그리드
// items: [{ id, label, icon?, count? }], onSelect: (item) => void

export default function SuggestedQuestions({ items, onSelect, title = '💡 추천 질문' }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="w-full">
      {title && (
        <div className="text-[11px] uppercase tracking-widest mb-2 px-1 font-mono" style={{ color: 'var(--jarvis-text-muted)' }}>
          {title}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item)}
              className="group flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-all text-left break-keep leading-snug min-w-0 relative"
              style={{
                background: 'rgba(15, 23, 41, 0.5)',
                color: 'var(--jarvis-text)',
                border: '1px solid var(--jarvis-border)',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                e.currentTarget.style.borderColor = 'var(--jarvis-cyan)';
                e.currentTarget.style.boxShadow = '0 0 16px rgba(0,212,255,0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 41, 0.5)';
                e.currentTarget.style.borderColor = 'var(--jarvis-border)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--jarvis-cyan)' }} />}
              <span className="flex-1 min-w-0">{item.label}</span>
              {item.count > 0 && (
                <span className="text-[10px] flex-shrink-0 font-mono" style={{ color: 'var(--jarvis-cyan)' }}>
                  ×{item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
