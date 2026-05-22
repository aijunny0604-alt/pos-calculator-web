// MOVIS 답변 메시지 액션 — 즐겨찾기 핀 / 이미지 export / 엑셀 export / 복사
// 잔여 3 (즐겨찾기 + 비교 차트 + Export) 중 즐겨찾기/Export 구현 (비교 차트는 시스템 프롬프트로 별도)

import { useState, useEffect, useRef } from 'react';
import { Star, Image as ImageIcon, FileSpreadsheet, Copy, Check } from 'lucide-react';

const PIN_KEY = 'pos_ai_pinned_queries_v1';

function readPins() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writePins(pins) {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(pins.slice(0, 30))); } catch {}
}

export function isQueryPinned(query) {
  const pins = readPins();
  return pins.includes(query);
}

export function togglePin(query) {
  const pins = readPins();
  const idx = pins.indexOf(query);
  if (idx >= 0) {
    pins.splice(idx, 1);
  } else {
    pins.unshift(query);
  }
  writePins(pins);
  return pins.includes(query);
}

export function getPinnedQueries() {
  return readPins();
}

// 메시지 액션 버튼 그룹 (assistant 메시지 우상단)
export default function MessageActions({ message, userQuery, bubbleRef }) {
  const [pinned, setPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPinned(isQueryPinned(userQuery || ''));
  }, [userQuery]);

  const handlePin = () => {
    if (!userQuery) return;
    const nowPinned = togglePin(userQuery);
    setPinned(nowPinned);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('복사 실패:', e);
    }
  };

  const handleExportImage = async () => {
    if (!bubbleRef?.current || exporting) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(bubbleRef.current, {
        backgroundColor: '#0a1220',
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `movis-${Date.now()}.png`;
      link.click();
    } catch (e) {
      console.warn('이미지 export 실패:', e);
      alert('이미지 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('MOVIS 답변');
      ws.addRow(['MOVIS AI 분석 결과']);
      ws.addRow(['생성일', new Date().toLocaleString('ko-KR')]);
      ws.addRow(['질문', userQuery || '(없음)']);
      ws.addRow([]);
      // 답변 본문
      ws.addRow(['답변']);
      const lines = String(message.content || '').split('\n');
      lines.forEach((line) => ws.addRow([line]));
      ws.addRow([]);
      // 도구 호출 결과 표
      const toolCalls = message.toolCalls || [];
      toolCalls.forEach((tc, idx) => {
        const data = tc?.result?.data;
        if (!data) return;
        ws.addRow([]);
        ws.addRow([`도구 ${idx + 1}: ${tc.name}`]);
        if (Array.isArray(data.results) && data.results.length > 0) {
          const headers = Object.keys(data.results[0]);
          ws.addRow(headers);
          data.results.forEach((r) => ws.addRow(headers.map((h) => r[h])));
        } else if (Array.isArray(data.items) && data.items.length > 0) {
          const headers = Object.keys(data.items[0]);
          ws.addRow(headers);
          data.items.forEach((r) => ws.addRow(headers.map((h) => r[h])));
        } else {
          ws.addRow([JSON.stringify(data).slice(0, 500)]);
        }
      });
      ws.columns.forEach((col) => { col.width = 20; });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `movis-${Date.now()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('엑셀 export 실패:', e);
      alert('엑셀 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  };

  const btnClass = 'flex-shrink-0 p-1.5 rounded-md hover:bg-cyan-500/15 transition-colors';
  const iconClass = 'w-3.5 h-3.5';

  return (
    <div className="flex items-center gap-0.5 ml-auto" style={{ color: 'var(--jarvis-text-muted)' }}>
      {userQuery && (
        <button
          type="button"
          onClick={handlePin}
          className={btnClass}
          title={pinned ? '즐겨찾기 해제' : '즐겨찾기 추가 (다시 묻기 쉽게)'}
          aria-label="즐겨찾기"
        >
          <Star
            className={iconClass}
            style={{
              color: pinned ? '#fbbf24' : undefined,
              fill: pinned ? '#fbbf24' : 'none',
            }}
          />
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={btnClass}
        title={copied ? '복사됨!' : '본문 복사'}
        aria-label="복사"
      >
        {copied ? <Check className={iconClass} style={{ color: '#00ff88' }} /> : <Copy className={iconClass} />}
      </button>
      <button
        type="button"
        onClick={handleExportImage}
        disabled={exporting}
        className={btnClass}
        title="이미지로 저장 (.png)"
        aria-label="이미지 저장"
      >
        <ImageIcon className={iconClass} />
      </button>
      <button
        type="button"
        onClick={handleExportExcel}
        disabled={exporting}
        className={btnClass}
        title="엑셀로 저장 (.xlsx)"
        aria-label="엑셀 저장"
      >
        <FileSpreadsheet className={iconClass} />
      </button>
    </div>
  );
}
