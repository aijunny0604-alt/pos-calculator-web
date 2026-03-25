import { useState, useRef, useEffect, useMemo, createPortal } from 'react';
import ReactDOM from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export default function DatePicker({ value, onChange, placeholder = '날짜 선택', className = '', compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value + 'T00:00:00');
    return new Date();
  });
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const calendarRef = useRef(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (calendarRef.current?.contains(e.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // ESC 닫기 + 스크롤 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    const handleScroll = () => setIsOpen(false);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // 팝업 위치 계산 (fixed 기준)
  useEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const calH = 340; // 예상 높이
    const calW = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.left;

    setPos({
      top: spaceBelow < calH + 8 ? rect.top - calH - 4 : rect.bottom + 4,
      left: spaceRight < calW + 8 ? rect.right - calW : rect.left,
    });
  }, [isOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevDays - i, current: false, date: new Date(year, month - 1, prevDays - i) });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, current: true, date: new Date(year, month, i) });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, current: false, date: new Date(year, month + 1, i) });
    }
    return days;
  }, [year, month]);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const todayStr = toYMD(new Date());

  const handleSelect = (d) => {
    onChange(toYMD(d.date));
    setIsOpen(false);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setViewDate(now);
    onChange(toYMD(now));
    setIsOpen(false);
  };

  const displayValue = value
    ? (() => {
        const d = new Date(value + 'T00:00:00');
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      })()
    : '';

  const calendarPopup = isOpen ? ReactDOM.createPortal(
    <div
      ref={calendarRef}
      className="fixed z-[9999] rounded-xl border shadow-2xl"
      style={{
        top: pos.top,
        left: pos.left,
        background: 'var(--card)',
        borderColor: 'var(--border)',
        width: '280px',
        animation: 'datepicker-in 150ms ease-out',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[var(--muted)] transition-colors">
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {year}년 {MONTHS[month]}
        </span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[var(--muted)] transition-colors">
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className="text-center text-[11px] font-medium pb-1"
            style={{ color: i === 0 ? 'var(--destructive)' : i === 6 ? '#3b82f6' : 'var(--muted-foreground)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 px-2 pb-2">
        {calendarDays.map((d, idx) => {
          const dateStr = toYMD(d.date);
          const isSelected = dateStr === value;
          const isToday = dateStr === todayStr;
          const dayOfWeek = d.date.getDay();

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(d)}
              className={`relative w-full aspect-square flex items-center justify-center text-xs rounded-lg transition-all ${
                isSelected
                  ? 'font-bold'
                  : d.current
                  ? 'hover:bg-[var(--muted)]'
                  : 'opacity-30 hover:opacity-50'
              }`}
              style={{
                background: isSelected ? 'var(--primary)' : 'transparent',
                color: isSelected
                  ? 'var(--primary-foreground)'
                  : !d.current
                  ? 'var(--muted-foreground)'
                  : dayOfWeek === 0
                  ? 'var(--destructive)'
                  : dayOfWeek === 6
                  ? '#3b82f6'
                  : 'var(--foreground)',
              }}
            >
              {d.day}
              {isToday && !isSelected && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'var(--primary)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={goToday}
          className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--muted)]"
          style={{ color: 'var(--primary)' }}
        >
          오늘
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs px-2.5 py-1 rounded-md transition-colors hover:bg-[var(--muted)]"
          style={{ color: 'var(--muted-foreground)' }}
        >
          닫기
        </button>
      </div>

      <style>{`
        @keyframes datepicker-in {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!isOpen && value) setViewDate(new Date(value + 'T00:00:00'));
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-1.5 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        }`}
        style={{
          background: value ? 'var(--primary)' : 'var(--background)',
          borderColor: value ? 'var(--primary)' : 'var(--border)',
          color: value ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
        }}
      >
        <Calendar className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>{displayValue || placeholder}</span>
        {value && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); setIsOpen(false); }}
            className="ml-0.5 hover:opacity-70"
          >
            <X className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          </span>
        )}
      </button>
      {calendarPopup}
    </div>
  );
}
