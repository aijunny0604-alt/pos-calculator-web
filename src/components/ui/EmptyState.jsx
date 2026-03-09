import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = '데이터가 없습니다', description, action }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-8 text-center">
      <Icon className="w-12 h-12 mx-auto mb-3 text-[var(--muted-foreground)] opacity-50" />
      <p className="font-medium text-[var(--muted-foreground)]">{title}</p>
      {description && <p className="text-sm text-[var(--muted-foreground)] mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
