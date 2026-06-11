// 전역 스토어 주문 알림 — 어느 페이지에 있든(앱이 켜져 있으면) 신규주문/취소 시
// 알림음 + 화면 팝업 + 브라우저 OS 알림. App 최상단에 1개만 마운트.
// 실시간 구독은 여기 1곳에서만 → 변경 시 'external-orders-changed' 이벤트로 각 페이지가 reload.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabaseClient } from '@/lib/supabase';

const SOUND_KEY = 'pos_store_alert_sound';
export const isStoreAlertSoundOn = () => {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; }
};
export const setStoreAlertSound = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch {}
};

let _ctx = null;
export const playAlertSound = (kind = 'order') => {
  try {
    _ctx = _ctx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const notes = kind === 'cancel' ? [880, 587, 392] : [523, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'cancel' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.15;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.15);
    });
  } catch { /* 오디오 불가 무시 */ }
};

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

function osNotify(title, body, kind) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: 'store-order', renotify: true, requireInteraction: kind === 'cancel' });
      n.onclick = () => { try { window.focus(); } catch {} n.close(); };
    }
  } catch {}
}

const CANCELISH = { CANCEL_REQUEST: '취소 요청', CANCELED: '취소', CANCEL: '취소', RETURNED: '반품', EXCHANGED: '교환' };

export default function StoreOrderAlerts() {
  const [event, setEvent] = useState(null);
  const cancelRef = useRef(new Set());

  // 브라우저 OS 알림 권한 (한 번만, 사용자 첫 클릭 후 요청 — 차단 정책 회피)
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    const ask = () => {
      try { Notification.requestPermission().catch(() => {}); } catch {}
      window.removeEventListener('pointerdown', ask);
    };
    window.addEventListener('pointerdown', ask, { once: true });
    return () => window.removeEventListener('pointerdown', ask);
  }, []);

  // 팝업 10초 자동 닫힘
  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent(null), 10000);
    return () => clearTimeout(t);
  }, [event]);

  useEffect(() => {
    const ch = supabaseClient
      .channel('store_order_alerts_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'external_orders' }, (p) => {
        const o = p.new || {};
        if (isStoreAlertSoundOn()) playAlertSound('order');
        osNotify('🛍️ 새 주문 도착!', `${o.buyer_name || '구매자'}${o.total_amount ? ` · ${fmt(o.total_amount)}원` : ''}`, 'order');
        setEvent({ kind: 'order', title: '🛍️ 새 주문 도착!', name: o.buyer_name || '구매자', sub: o.total_amount ? `${fmt(o.total_amount)}원` : '', ts: Date.now() });
        window.dispatchEvent(new CustomEvent('external-orders-changed'));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'external_orders' }, (p) => {
        const o = p.new || {};
        const label = CANCELISH[o.order_status];
        if (label && !cancelRef.current.has(o.id)) {
          // 최근 취소 id만 기억(중복알림 억제). 종일 가동 시 Set 무한증가 방지 — 상한 초과 시 비움.
          if (cancelRef.current.size > 500) cancelRef.current.clear();
          cancelRef.current.add(o.id);
          if (isStoreAlertSoundOn()) playAlertSound('cancel');
          osNotify(`⚠️ ${label} 발생`, `${o.buyer_name || '구매자'}${o.provider_order_id ? ` · #${o.provider_order_id}` : ''}`, 'cancel');
          setEvent({ kind: 'cancel', title: `⚠️ ${label} 발생`, name: o.buyer_name || '구매자', sub: o.provider_order_id ? `주문 #${o.provider_order_id}` : '', ts: Date.now() });
        }
        window.dispatchEvent(new CustomEvent('external-orders-changed'));
      })
      .subscribe();
    return () => { supabaseClient.removeChannel(ch); };
  }, []);

  if (!event) return null;
  const danger = event.kind === 'cancel';
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md animate-modal-up" onClick={() => setEvent(null)}>
      <div className="rounded-2xl border-2 shadow-2xl px-5 py-4 flex items-center gap-4 cursor-pointer"
        style={{
          background: 'var(--card)',
          borderColor: danger ? '#ff4d6d' : '#03c75a',
          boxShadow: `0 0 0 4px ${danger ? 'rgba(255,77,109,0.25)' : 'rgba(3,199,90,0.25)'}, 0 12px 40px rgba(0,0,0,0.4)`,
        }}>
        <div className={`text-4xl flex-shrink-0 ${danger ? '' : 'animate-bounce'}`}>{danger ? '⚠️' : '🛍️'}</div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-lg leading-tight" style={{ color: danger ? '#ff4d6d' : '#03c75a' }}>{event.title}</div>
          <div className="font-bold text-xl mt-0.5 truncate">{event.name}</div>
          {event.sub && <div className="text-sm opacity-70 mt-0.5">{event.sub}</div>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); setEvent(null); }} className="p-1.5 rounded-lg hover:bg-[var(--accent)] flex-shrink-0" title="닫기">
          <X className="w-5 h-5 opacity-60" />
        </button>
      </div>
    </div>
  );
}
