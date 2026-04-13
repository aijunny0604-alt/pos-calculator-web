import { useState, useEffect } from 'react';
import { Bell, X, Clock, Calendar, RefreshCw, Check, Maximize2, Minimize2 } from 'lucide-react';
import useModalFullscreen from '@/hooks/useModalFullscreen';

export default function NotificationSettings({ isOpen, onClose, settings, onSave }) {
  const [localSettings, setLocalSettings] = useState(settings);
  const { isFullscreen, toggleFullscreen } = useModalFullscreen();

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const toggleDayReminder = (day) => {
    const newDays = localSettings.daysBeforeReminder.includes(day)
      ? localSettings.daysBeforeReminder.filter((d) => d !== day)
      : [...localSettings.daysBeforeReminder, day].sort((a, b) => a - b);
    setLocalSettings({ ...localSettings, daysBeforeReminder: newDays });
  };

  if (!isOpen) return null;

  const dayOptions = [
    { day: -1, label: '지연 배송', description: '이미 지연된 배송', cssVar: '--destructive' },
    { day: 0, label: '오늘', description: '당일 배송', cssVar: '--warning' },
    { day: 1, label: '내일', description: 'D-1', cssVar: '--warning' },
    { day: 2, label: 'D-2', description: '2일 전', cssVar: '--primary' },
    { day: 3, label: 'D-3', description: '3일 전', cssVar: '--info' },
    { day: 7, label: 'D-7', description: '1주일 전', cssVar: '--purple' },
  ];

  const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors';
  const inputStyle = {
    backgroundColor: 'var(--background)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center animate-modal-backdrop modal-backdrop-fs-transition"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isFullscreen ? '0' : '1rem' }}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full overflow-hidden border shadow-2xl animate-modal-up modal-fs-transition flex flex-col"
        style={{
          backgroundColor: 'var(--card)', borderColor: 'var(--border)',
          maxWidth: isFullscreen ? '100vw' : '42rem',
          maxHeight: isFullscreen ? '100vh' : '90vh',
          borderRadius: isFullscreen ? '0' : '1rem',
          boxShadow: isFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>알림 설정</h2>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>배송 일정을 놓치지 마세요</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]" title={isFullscreen ? '원래 크기' : '전체화면'}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} /> : <Maximize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
            >
              <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto overscroll-contain modal-scroll-area"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Enable toggle */}
          <div
            className="rounded-xl p-4 border"
            style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold" style={{ color: 'var(--foreground)' }}>배송 알림</p>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold border"
                    style={
                      localSettings.enabled
                        ? { backgroundColor: 'var(--success)', color: 'white', borderColor: 'var(--success)' }
                        : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }
                    }
                  >
                    {localSettings.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  브라우저 알림으로 배송 일정을 알려드립니다
                </p>
              </div>
              {/* Toggle switch */}
              <button
                onClick={() => setLocalSettings({ ...localSettings, enabled: !localSettings.enabled })}
                className="relative w-14 h-7 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: localSettings.enabled ? 'var(--primary)' : 'var(--muted)',
                }}
              >
                <div
                  className="absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-300 flex items-center justify-center"
                  style={{ left: localSettings.enabled ? '32px' : '2px' }}
                >
                  {localSettings.enabled
                    ? <Check className="w-3 h-3" style={{ color: 'var(--primary)' }} />
                    : <X className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                  }
                </div>
              </button>
            </div>
          </div>

          {localSettings.enabled && (
            <>
              {/* Notification time */}
              <div
                className="rounded-xl p-4 border"
                style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  <label className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                    알림 시간
                  </label>
                </div>
                <input
                  type="time"
                  value={localSettings.time}
                  onChange={(e) => setLocalSettings({ ...localSettings, time: e.target.value })}
                  className={inputClass}
                  style={{ ...inputStyle, fontSize: '1.25rem', fontWeight: 'bold' }}
                />
                <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                  매일 이 시간에 알림을 전송합니다
                </p>
              </div>

              {/* Day reminders */}
              <div
                className="rounded-xl p-4 border"
                style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  <label className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                    알림 받을 배송 일정
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {dayOptions.map(({ day, label, description, cssVar }) => {
                    const isActive = day === -1
                      ? localSettings.includeOverdue
                      : localSettings.daysBeforeReminder.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          if (day === -1) {
                            setLocalSettings({ ...localSettings, includeOverdue: !localSettings.includeOverdue });
                          } else {
                            toggleDayReminder(day);
                          }
                        }}
                        className="relative rounded-xl p-3 border-2 text-left transition-all"
                        style={{
                          background: isActive ? `color-mix(in srgb, var(${cssVar}) 12%, transparent)` : 'var(--background)',
                          borderColor: isActive ? `color-mix(in srgb, var(${cssVar}) 50%, var(--border))` : 'var(--border)',
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="font-bold text-sm"
                            style={{ color: isActive ? `var(${cssVar})` : 'var(--muted-foreground)' }}
                          >
                            {label}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            {description}
                          </span>
                        </div>
                        {isActive && (
                          <div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--primary)' }}
                          >
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs mt-3 text-center" style={{ color: 'var(--muted-foreground)' }}>
                  선택한 일정에 대해 알림을 받습니다
                </p>
              </div>

              {/* Notification frequency */}
              <div
                className="rounded-xl p-4 border"
                style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  <label className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                    알림 빈도
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: true, label: '매일 알림', desc: '정기 알림' },
                    { value: false, label: '당일만', desc: '배송일만' },
                  ].map(({ value, label, desc }) => {
                    const isActive = localSettings.dailyNotification === value;
                    return (
                      <button
                        key={String(value)}
                        onClick={() => setLocalSettings({ ...localSettings, dailyNotification: value })}
                        className="relative rounded-xl p-3 border-2 text-left transition-all"
                        style={{
                          background: isActive ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                          borderColor: isActive ? 'color-mix(in srgb, var(--primary) 50%, var(--border))' : 'var(--border)',
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="font-bold text-sm"
                            style={{ color: isActive ? 'var(--primary)' : 'var(--muted-foreground)' }}
                          >
                            {label}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{desc}</span>
                        </div>
                        {isActive && (
                          <div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: 'var(--primary)' }}
                          >
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
