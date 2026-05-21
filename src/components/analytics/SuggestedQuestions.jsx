// 추천 질문 칩 그리드
// items: [{ id, label, icon?, count? }], onSelect: (item) => void

export default function SuggestedQuestions({ items, onSelect, title = '💡 추천 질문' }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="w-full">
      {title && (
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2 px-1">
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
              className="flex items-center gap-2 px-3 py-2 rounded-full text-sm border border-[var(--border)] bg-white hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] hover:border-[var(--primary)] transition-colors text-left break-keep leading-snug min-w-0"
            >
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
              <span className="flex-1 min-w-0">{item.label}</span>
              {item.count > 0 && (
                <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 font-mono">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
