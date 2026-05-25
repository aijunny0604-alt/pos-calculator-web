// 음성 주문 — Web Speech API (무료, 한국어)
// "벨로스터 다운파이프 2개" → 제품 검색 + 수량 파싱 → 카트에 자동 담기
import { useState, useRef, useCallback } from 'react';
import { matchesSearchQuery } from '@/lib/utils';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export default function useVoiceOrder({ products = [], addToCart, showToast }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  const supported = !!SpeechRecognition;

  const parseVoiceCommand = useCallback((text) => {
    if (!text) return [];
    // 수량 패턴: "N개", "N 개", 숫자만
    const qtyMatch = text.match(/(\d+)\s*개/);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    // 수량 부분 제거 후 제품명 검색
    const cleaned = text.replace(/\d+\s*개/g, '').trim();
    if (!cleaned) return [];

    // 제품 매칭 (fuzzy)
    const matched = products.filter(p => matchesSearchQuery(p.name, cleaned));
    if (matched.length === 0) return [];

    // 가장 유사한 1개
    return [{ product: matched[0], quantity: qty }];
  }, [products]);

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      showToast?.('이 브라우저는 음성 인식을 지원하지 않습니다', 'error');
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      setListening(false);
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        showToast?.('음성 인식 오류: ' + e.error, 'error');
      }
    };

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);

      const parsed = parseVoiceCommand(text);
      if (parsed.length > 0) {
        parsed.forEach(({ product, quantity }) => {
          for (let i = 0; i < quantity; i++) {
            addToCart?.(product);
          }
        });
        showToast?.(`🎤 "${text}" → ${parsed[0].product.name} ${parsed[0].quantity}개 담았습니다`, 'success');
      } else {
        showToast?.(`🎤 "${text}" — 일치하는 제품을 찾지 못했습니다`, 'warning');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [parseVoiceCommand, addToCart, showToast]);

  const stop = useCallback(() => {
    recognitionRef.current?.abort();
    setListening(false);
  }, []);

  return { listening, transcript, start, stop, supported };
}
