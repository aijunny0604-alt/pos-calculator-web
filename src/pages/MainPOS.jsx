import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, ShoppingCart, Plus, Minus, X, ChevronDown, ChevronUp,
  Package, Calculator, Maximize2, Minimize2, RotateCcw, Zap, ArrowLeft, Mic, MicOff,
  Printer, Copy
} from 'lucide-react';
import { matchesSearchQuery, handleSearchFocus, formatPrice, calcExVat, calcOrderVat, calculateDiscount, isTaxFreeItem, escapeHtml } from '@/lib/utils';
import { searchProductsRanked } from '@/lib/productMatch';
import { isImageDemoMode, getSampleImage } from '@/lib/sampleProductImages';
import ProductGalleryModal from '@/components/ProductGalleryModal';
import OrderPage from './OrderPage';
import TextAnalyze from './TextAnalyze';
import useModalFullscreen from '@/hooks/useModalFullscreen';
import useVoiceOrder from '@/hooks/useVoiceOrder';

// 제품 주의사항 강조 색상 (AdminPage FLAG_COLORS와 동기화)
const FLAG_MAP = { red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', green: '#22c55e', purple: '#a78bfa' };

// Static fallback price data (478 products)
const priceData = [
  { id: 1, category: '모듈', name: '져스트 G1', wholesale: 700000, retail: 1100000 },
  { id: 2, category: '모듈', name: '져스트 G2', wholesale: 865000, retail: 1500000 },
  { id: 3, category: '모듈', name: '져스트 G1C1', wholesale: 821000, retail: 1361000 },
  { id: 4, category: '모듈', name: '져스트 G2C1', wholesale: 986000, retail: 1761000 },
  { id: 5, category: '모듈', name: '져스트 모듈', wholesale: 440000, retail: 700000 },
  { id: 6, category: '모듈', name: '블로썸', wholesale: 350000, retail: 490000 },
  { id: 7, category: '모듈', name: 'RW 모듈 낱개', wholesale: 460000, retail: 560000 },
  { id: 8, category: '모듈', name: 'RW 모듈 5-10개', wholesale: 330000, retail: 560000 },
  { id: 9, category: '모듈', name: 'RW 모듈 11-20개', wholesale: 270000, retail: 560000 },
  { id: 10, category: '모듈', name: '보펜', wholesale: 242000, retail: 350000 },
  { id: 11, category: '져스트 스피커', name: '메인 스피커', wholesale: 250000, retail: 500000 },
  { id: 12, category: '져스트 스피커', name: '고음 스피커', wholesale: 176000, retail: 361000 },
  { id: 13, category: '배선/부품', name: '모듈 메인 배선', wholesale: 33000, retail: 77000 },
  { id: 14, category: '배선/부품', name: 'OBD 배선', wholesale: 16500, retail: 33000 },
  { id: 15, category: '배선/부품', name: '모듈 케이블 휴즈 등', wholesale: 16500, retail: 33000 },
  { id: 16, category: '배선/부품', name: '스피커 배선', wholesale: 22000, retail: 33000 },
  { id: 17, category: '배선/부품', name: '스피커 콘지 교체용', wholesale: 38500, retail: 110000 },
];

export default function MainPOS({
  products: externalProducts = [],
  cart,
  setCart,
  priceType,
  setPriceType,
  onOpenOrder,
  onOpenTextAnalyze,
  onOpenQuickCalculator,
  showToast,
  saveOrder,
  isSaving = false,
  savingStep = '',
  customers = [],
  onSaveCartModal,
  onBack,
  loadedCustomer,
  onClearLoadedCustomer,
  orders = [],
  autoOpenOrderConfirmNonce = 0,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  // ⚡ AI 검색 토글 — ON이면 오타/초성/동의어/치수흔들림 보정 + 관련도순 정렬 (로컬·즉시). 기본 ON
  const [aiSearch, setAiSearch] = useState(() => {
    try { return localStorage.getItem('pos_ai_product_search') !== '0'; } catch { return true; }
  });
  const toggleAiSearch = () => setAiSearch((prev) => {
    const next = !prev;
    try { localStorage.setItem('pos_ai_product_search', next ? '1' : '0'); } catch { /* noop */ }
    return next;
  });
  const [galleryProduct, setGalleryProduct] = useState(null); // 갤러리 모달 대상
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [orderCustomerName, setOrderCustomerName] = useState('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState('');
  const [orderMemo, setOrderMemo] = useState('');
  const [orderPaymentMethod, setOrderPaymentMethod] = useState('card');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showAiModal, setShowAiModal] = useState(false);
  const { isFullscreen: isCartFullscreen, toggleFullscreen: toggleCartFullscreen } = useModalFullscreen();
  const { isFullscreen: isAiFullscreen, toggleFullscreen: toggleAiFullscreen } = useModalFullscreen();

  // products를 hook 호출 전에 정의 (TDZ 방지 — Critical fix)
  const products = externalProducts.length > 0 ? externalProducts : priceData;

  // 음성 주문 — addToCart를 직접 넘기지 않고 ref 경유 (hook 순서 안전)
  const addToCartRef = useRef(null);
  const lastNonceRef = useRef(0);
  const voiceOrder = useVoiceOrder({ products, addToCart: (...args) => addToCartRef.current?.(...args), showToast });

  // 장바구니가 비워지면 주문확인 모달도 자동 닫기 (장바구니 저장 후 초기화 시)
  useEffect(() => {
    if (cart.length === 0) {
      setShowOrderConfirm(false);
      setIsCartExpanded(false);
    }
  }, [cart.length]);

  // AI 주문 인식 → 담기 → 주문서 자동 오픈 (App에서 신호 전달)
  useEffect(() => {
    if (
      autoOpenOrderConfirmNonce &&
      autoOpenOrderConfirmNonce !== lastNonceRef.current &&
      cart.length > 0
    ) {
      lastNonceRef.current = autoOpenOrderConfirmNonce;
      setShowOrderConfirm(true);
    }
  }, [autoOpenOrderConfirmNonce, cart.length]);

  const dynamicCategories = useMemo(() => {
    return [...new Set(products.map(item => item.category))];
  }, [products]);

  // Initialize all categories as expanded
  useEffect(() => {
    if (dynamicCategories.length > 0 && Object.keys(expandedCategories).length === 0) {
      const initial = {};
      dynamicCategories.forEach(cat => { initial[cat] = true; });
      setExpandedCategories(initial);
    }
  }, [dynamicCategories]);

  const cartMap = useMemo(() => new Map(cart.map(item => [item.id, item])), [cart]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim();
    // ⚡ AI 검색 ON + 검색어 있음 → 관련도순(오타/초성/동의어/치수보정) 랭킹 후 카테고리 필터
    if (aiSearch && q) {
      let ranked = searchProductsRanked(q, products);
      if (selectedCategory !== '전체') ranked = ranked.filter(p => p.category === selectedCategory);
      return ranked.slice(0, 18); // 관련도순 상위 18개까지만 (너무 많으면 어지러움 — 노이즈는 엔진서 이미 컷)
    }
    // 기존 정확검색(부분일치/자모순서) — AI OFF 또는 검색어 없음
    return products.filter(product => {
      const matchesSearch = matchesSearchQuery(product.name, searchTerm);
      const matchesCategory = selectedCategory === '전체' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory, products, aiSearch]);

  // 🎯 AI 검색 최상위 일치 제품 (관련도 1순위) — 가장 눈에 띄게 강조 + 정확일치 여부
  const topMatch = useMemo(() => {
    if (!aiSearch || !searchTerm.trim() || filteredProducts.length === 0) return null;
    const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');
    const top = filteredProducts[0];
    return { id: top.id, exact: norm(top.name) === norm(searchTerm) };
  }, [aiSearch, searchTerm, filteredProducts]);

  const groupedProducts = useMemo(() => {
    // ⚡ AI 검색 + 검색어: 카테고리 그룹 대신 관련도순 단일 그룹(최상위 매칭 먼저)
    if (aiSearch && searchTerm.trim()) {
      return filteredProducts.length ? { '🔎 관련도순': filteredProducts } : {};
    }
    const groups = {};
    filteredProducts.forEach(product => {
      if (!groups[product.category]) groups[product.category] = [];
      groups[product.category].push(product);
    });
    return groups;
  }, [filteredProducts, aiSearch, searchTerm]);

  const cartWithDiscount = useMemo(() => {
    return cart.map(item => {
      const price = priceType === 'wholesale' ? item.wholesale : (item.retail || item.wholesale);
      const product = products.find(p => p.id === item.id);
      const discountInfo = calculateDiscount(product || {}, item.quantity, price);
      return {
        ...item,
        unitPrice: price,
        originalTotal: price * item.quantity,
        discountedPrice: discountInfo.discountedPrice,
        discountAmount: discountInfo.discountAmount,
        totalDiscount: discountInfo.discountAmount * item.quantity,
        finalTotal: discountInfo.discountedPrice * item.quantity,
        appliedTier: discountInfo.appliedTier,
      };
    });
  }, [cart, priceType, products]);

  const totalAmount = useMemo(() => {
    return cartWithDiscount.reduce((sum, item) => sum + item.finalTotal, 0);
  }, [cartWithDiscount]);

  // 공급가액·부가세는 품목 단위로 — 택배비/퀵비 등 비과세(taxFree) 항목은 전액이 공급가액.
  // 전역 calcExVat(totalAmount)로 나누면 비과세분에도 부가세가 붙는다. (2026-07-15)
  const vatBreakdown = useMemo(() => calcOrderVat(cartWithDiscount), [cartWithDiscount]);

  const totalDiscount = useMemo(() => {
    return cartWithDiscount.reduce((sum, item) => sum + item.totalDiscount, 0);
  }, [cartWithDiscount]);

  const totalQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // ===== 모의 견적서 (주문 확인 전) — 카톡 복사 / 출력 =====
  // 화면 카트 합계와 100% 동일한 계산 재사용(cartWithDiscount·vatBreakdown·totalAmount) → 견적과 실주문 금액 불일치 방지.
  // 비과세(택배비/퀵비) 항목은 calcOrderVat이 이미 반영(전액 공급가). 거래처는 아직 미선택이라 참고용 표기.
  const buildQuoteText = () => {
    const isW = priceType === 'wholesale';
    const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    let text = `[ 견적서 ] 무브모터스\n${dateStr}\n단가기준: ${isW ? '도매가' : '소비자가'} (부가세 포함)\n\n`;
    cartWithDiscount.forEach((it, i) => {
      text += `${i + 1}. ${it.name}\n   ${formatPrice(it.discountedPrice)}원 × ${it.quantity}개 = ${formatPrice(it.finalTotal)}원${isTaxFreeItem(it) ? ' (비과세)' : ''}\n`;
    });
    text += `\n총 수량: ${totalQuantity}개\n공급가액: ${formatPrice(vatBreakdown.supply)}원\n부가세: ${formatPrice(vatBreakdown.vat)}원\n합계 금액: ${formatPrice(totalAmount)}원\n\n`;
    text += `※ 주문 전 참고용 견적입니다.\n입금 계좌: 신한은행 010-5858-6046 무브모터스\n`;
    return text;
  };

  const copyQuoteText = async () => {
    if (cart.length === 0) return;
    const text = buildQuoteText();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      showToast && showToast('견적서를 카톡용으로 복사했습니다 📋', 'success');
    } catch {
      showToast && showToast('복사 실패 — 다시 시도해주세요', 'error');
    }
  };

  const printQuote = () => {
    if (cart.length === 0) return;
    const isW = priceType === 'wholesale';
    const dateStr = new Date().toLocaleDateString('ko-KR');
    const rows = cartWithDiscount.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(it.name)}${isTaxFreeItem(it) ? ' <span class="tf">비과세</span>' : ''}</td>
        <td class="r">${formatPrice(it.discountedPrice)}</td>
        <td class="c">${it.quantity}</td>
        <td class="r">${formatPrice(it.finalTotal)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>견적서 - 무브모터스</title>
      <style>
        *{box-sizing:border-box} body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;padding:32px;color:#111}
        h1{font-size:26px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th,td{border:1px solid #ccc;padding:9px 10px;font-size:13px}
        th{background:#f3f4f6;text-align:center} td.c{text-align:center} td.r{text-align:right}
        .tf{font-size:11px;color:#0a7a5a;border:1px solid #0a7a5a;border-radius:4px;padding:0 4px;margin-left:4px}
        .totals{margin-top:18px;width:100%;max-width:340px;margin-left:auto}
        .totals div{display:flex;justify-content:space-between;padding:5px 0;font-size:14px}
        .totals .grand{border-top:2px solid #111;margin-top:6px;padding-top:9px;font-size:22px;font-weight:bold}
        .foot{margin-top:30px;font-size:12px;color:#555;line-height:1.8;border-top:1px dashed #ccc;padding-top:14px}
        @media print{body{padding:12px}}
      </style></head><body>
      <h1>견 적 서</h1>
      <div class="sub">무브모터스 &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; 단가기준: ${isW ? '도매가' : '소비자가'} (부가세 포함)</div>
      <table><thead><tr><th style="width:44px">No</th><th>품목</th><th style="width:100px">단가</th><th style="width:60px">수량</th><th style="width:110px">금액</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>총 수량</span><span>${totalQuantity}개</span></div>
        <div><span>공급가액</span><span>${formatPrice(vatBreakdown.supply)}원</span></div>
        <div><span>부가세</span><span>${formatPrice(vatBreakdown.vat)}원</span></div>
        <div class="grand"><span>합계</span><span>${formatPrice(totalAmount)}원</span></div>
      </div>
      <div class="foot">※ 주문 전 참고용 견적입니다. 실제 청구는 주문 확정 시 확정됩니다.<br>입금 계좌: 신한은행 010-5858-6046 무브모터스</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},200);};</script>
      </body></html>`;
    const w = window.open('', '_blank', 'width=820,height=920');
    if (!w) { showToast && showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.', 'error'); return; }
    w.document.write(html); w.document.close();
  };

  // 거래처 자주 구매 제품 추천 (loadedCustomer 선택 시)
  const customerSuggestedProducts = useMemo(() => {
    if (!loadedCustomer?.name || orders.length === 0) return [];
    const custName = loadedCustomer.name.toLowerCase().replace(/\s/g, '');
    const custOrders = orders.filter(o =>
      (o.customerName || '').toLowerCase().replace(/\s/g, '') === custName
    );
    if (custOrders.length === 0) return [];
    const freqMap = {};
    custOrders.forEach(o => (o.items || []).forEach(it => {
      const key = String(it.id || it.name);
      freqMap[key] = (freqMap[key] || 0) + (it.quantity || 1);
    }));
    return Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, qty]) => {
        const p = products.find(pr => String(pr.id) === key || pr.name === key);
        return p ? { ...p, _freq: qty } : null;
      })
      .filter(Boolean);
  }, [loadedCustomer, orders, products]);

  // 번들 추천 — 카트에 담긴 제품과 함께 자주 주문된 제품
  const bundleSuggestions = useMemo(() => {
    if (cart.length === 0 || orders.length === 0) return [];
    const cartIds = new Set(cart.map(c => String(c.id)));
    const coMap = {};
    orders.forEach(o => {
      const ids = (o.items || []).map(it => String(it.id || it.name));
      const overlap = ids.filter(id => cartIds.has(id));
      if (overlap.length === 0) return;
      ids.forEach(id => {
        if (cartIds.has(id)) return;
        coMap[id] = (coMap[id] || 0) + 1;
      });
    });
    return Object.entries(coMap)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const p = products.find(pr => String(pr.id) === key || pr.name === key);
        return p ? { ...p, _coCount: count } : null;
      })
      .filter(Boolean);
  }, [cart, orders, products]);

  const addToCart = (product) => {
    const baseStock = product.stock !== undefined ? product.stock : 50;
    const existingItem = cartMap.get(product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const isIncoming = product.stock_status === 'incoming';
    const isOutOfStock = baseStock === 0 && !isIncoming;

    // 🛡️ 가격 0원 경고 — 도매·소매 둘 다 0이면 토스트만 띄우고 담기는 허용 (자바라 무료 라인 등 의도된 0원 케이스 지원)
    const ws = Number(product.wholesale) || 0;
    const rt = Number(product.retail) || 0;
    if (ws <= 0 && rt <= 0) {
      showToast && showToast(`⚠️ "${product.name}" 가격 0원 — 주문서에서 단가 확인하세요`, 'warning');
    }

    if (currentQty >= baseStock && baseStock > 0) {
      showToast && showToast(`재고 부족 (재고: ${baseStock}개) - 초과 주문`, 'warning');
    } else if (isIncoming && currentQty === 0) {
      showToast && showToast('입고대기 상품입니다 (예약 주문)', 'warning');
    } else if (isOutOfStock && currentQty === 0) {
      showToast && showToast('품절 상품입니다 (예약 주문)', 'warning');
    }

    if (existingItem) {
      setCart(prev => prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart(prev => [...prev, { ...product, quantity: 1 }]);
    }
  };

  addToCartRef.current = addToCart;

  const removeFromCart = (productId) => setCart(prev => prev.filter(item => item.id !== productId));

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) return removeFromCart(productId);
    const product = products.find(p => p.id === productId);
    const baseStock = product?.stock !== undefined ? product.stock : 50;
    if (newQuantity > baseStock && baseStock > 0) {
      showToast && showToast(`재고 부족 (재고: ${baseStock}개) - 초과 주문`, 'warning');
    }
    setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
  };

  // 🚨 +/− 연타 버그 수정 (2026-07-20): 버튼이 렌더 시점 cartItem.quantity를 캡처해서
  //    빠르게 여러 번 누르면 전부 같은 값에서 ±1을 계산 → 재렌더 전 클릭이 뭉개져 "안 눌러짐"으로 보였다.
  //    함수형 업데이트로 항상 최신 state 기준 증감. removeFromCart는 setCart 밖(0 도달 시)에서 처리.
  const stepQuantity = (productId, delta) => {
    // 재고 초과 경고 — updateQuantity(직접 타이핑)에는 있는데 +/− 버튼에만 빠지면
    // 같은 결과인데 경고가 갈린다. 토스트는 setCart 밖에서(StrictMode 이중 실행 방지).
    if (delta > 0) {
      const cur = cart.find(i => i.id === productId)?.quantity ?? 0;
      const product = products.find(p => p.id === productId);
      const baseStock = product?.stock !== undefined ? product.stock : 50;
      if (cur + delta > baseStock && baseStock > 0) {
        showToast && showToast(`재고 부족 (재고: ${baseStock}개) - 초과 주문`, 'warning');
      }
    }
    setCart(prev => {
      const item = prev.find(i => i.id === productId);
      if (!item) return prev;
      const next = item.quantity + delta;
      if (next < 1) return prev.filter(i => i.id !== productId); // 1 미만이면 제거
      return prev.map(i => i.id === productId ? { ...i, quantity: next } : i);
    });
  };

  const replaceItem = (oldId, newProduct, qty) => {
    setCart(prev => prev.map(item => item.id === oldId ? { ...newProduct, quantity: qty } : item));
  };

  // 임의 필드 패치 (할인 메타 적용/해제 등)
  const updateItem = (productId, patch) => {
    setCart(prev => prev.map(item => item.id === productId ? { ...item, ...patch } : item));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const openOrderConfirm = () => {
    if (cart.length === 0) {
      showToast && showToast('장바구니가 비어있습니다', 'error');
      return;
    }
    setOrderCustomerName('');
    setOrderCustomerPhone('');
    setOrderMemo('');
    setOrderPaymentMethod('card');
    setCustomerSuggestions([]);
    setShowOrderConfirm(true);
  };

  const handleCustomerNameChange = (value) => {
    setOrderCustomerName(value);
    if (value.trim().length > 0 && customers.length > 0) {
      const filtered = customers.filter(c =>
        c.name?.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 5);
      setCustomerSuggestions(filtered);
    } else {
      setCustomerSuggestions([]);
    }
  };

  const selectCustomerSuggestion = (customer) => {
    setOrderCustomerName(customer.name || '');
    setOrderCustomerPhone(customer.phone || '');
    setCustomerSuggestions([]);
  };

  const handleOrderSubmit = async () => {
    if (!saveOrder) return;
    const customerName = orderCustomerName.trim() || '일반고객';
    await saveOrder({
      customer_name: customerName,
      customer_phone: orderCustomerPhone.trim(),
      memo: orderMemo.trim(),
      payment_method: orderPaymentMethod,
      items: cartWithDiscount.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.discountedPrice,
        quantity: item.quantity,
        // 🚨 비과세 플래그 보존 — 빠뜨리면 저장 순간 과세로 되돌아가 명세서 공급가액이 화면과 달라짐
        ...(item.taxFree === true ? { taxFree: true } : {}),
      })),
      total_amount: totalAmount,
      price_type: priceType,
    });
    setShowOrderConfirm(false);
  };

  return (
    <div className="flex h-full" style={{ background: 'var(--background)' }}>
      {/* LEFT: Product Catalog */}
      <div className="flex-1 flex flex-col min-w-0 pr-0 lg:pr-[420px]">
        {/* Mobile Header with Back Button - always sticky */}
        <div
          className="lg:hidden sticky top-0 z-40 flex items-center h-12 px-3 border-b"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]"
            >
              <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
            </button>
          )}
          <h1 className="ml-2 text-lg font-bold" style={{ color: 'var(--foreground)' }}>제품 주문</h1>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            {onOpenQuickCalculator && (
              <button
                onClick={onOpenQuickCalculator}
                className="p-2.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
              >
                <Calculator className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
              </button>
            )}
            {cart.length > 0 && (
              <button
                onClick={() => setIsCartExpanded(true)}
                className="relative p-2.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
              >
                <ShoppingCart className="w-4.5 h-4.5" style={{ color: 'var(--primary)' }} />
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--destructive)', color: 'white' }}
                >
                  {cart.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div
          className="sticky top-12 lg:top-0 z-30 px-4 py-3 border-b"
          style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
        >
          {/* Search bar with AI button */}
          <div className="flex gap-2 items-center">
            <div
              className="relative flex-1 min-w-0 rounded-xl border-2 shadow-sm transition-all focus-within:shadow-md"
              style={{ borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 5%, var(--background))' }}
            >
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: 'var(--primary)' }}
              />
              <input
                type="text"
                placeholder="제품명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={handleSearchFocus}
                className="w-full pl-11 pr-10 py-3 rounded-xl text-base focus:outline-none"
                style={{ background: 'transparent', color: 'var(--foreground)', fontSize: '16px' }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--muted)]"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {voiceOrder.supported && (
              <button
                onClick={() => voiceOrder.listening ? voiceOrder.stop() : voiceOrder.start()}
                className={`flex-shrink-0 p-3 rounded-xl transition-all flex items-center justify-center ${voiceOrder.listening ? 'animate-pulse' : ''}`}
                style={{
                  background: voiceOrder.listening ? 'var(--destructive)' : 'color-mix(in srgb, var(--primary) 15%, var(--card))',
                  color: voiceOrder.listening ? 'white' : 'var(--primary)',
                  border: voiceOrder.listening ? 'none' : '1px solid var(--border)',
                }}
                title={voiceOrder.listening ? '음성 인식 중...' : '음성 주문'}
              >
                {voiceOrder.listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={() => setShowAiModal(true)}
              className="flex-shrink-0 p-3 rounded-xl transition-colors hover:opacity-80 flex items-center justify-center"
              style={{ background: 'var(--warning)', color: 'white' }}
              title="AI 주문 인식"
            >
              <Zap className="w-5 h-5" />
            </button>
          </div>

          {/* Controls row */}
          <div className="flex gap-2 items-center mt-2">
            {/* Price type toggle */}
            <div
              className="flex rounded-xl overflow-hidden border flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={() => setPriceType('wholesale')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  priceType === 'wholesale' ? 'text-white' : 'text-[var(--muted-foreground)]'
                }`}
                style={priceType === 'wholesale' ? { background: 'var(--primary)' } : { background: 'var(--muted)' }}
              >
                도매
              </button>
              <button
                onClick={() => setPriceType('retail')}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  priceType === 'retail' ? 'text-white' : 'text-[var(--muted-foreground)]'
                }`}
                style={priceType === 'retail' ? { background: 'var(--primary)' } : { background: 'var(--muted)' }}
              >
                소매
              </button>
            </div>

            {/* Category select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2"
              style={{
                background: selectedCategory !== '전체' ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--background)',
                borderColor: selectedCategory !== '전체' ? 'var(--primary)' : 'var(--border)',
                color: selectedCategory !== '전체' ? 'var(--primary)' : 'var(--foreground)',
                fontSize: '16px',
                minWidth: 0,
              }}
            >
              <option value="전체">전체</option>
              {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {/* ⚡ AI 검색 토글 — 오타·초성·동의어·치수 흔들림 보정 + 관련도순 */}
            <button
              onClick={toggleAiSearch}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all flex-shrink-0 active:scale-95"
              style={aiSearch
                ? { background: 'color-mix(in srgb, var(--warning) 18%, var(--card))', borderColor: 'var(--warning)', color: 'var(--warning)' }
                : { background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              title={aiSearch ? 'AI 검색 ON — 오타/초성/동의어/치수 보정 (끄려면 클릭)' : 'AI 검색 OFF — 정확검색 (켜려면 클릭)'}
            >
              <Zap className="w-3.5 h-3.5" />
              AI 검색
              <span
                className="ml-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={aiSearch
                  ? { background: 'var(--warning)', color: 'white' }
                  : { background: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                {aiSearch ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          <div className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {filteredProducts.length}개 제품
            {aiSearch && searchTerm.trim() && (
              <span className="ml-1.5 font-semibold" style={{ color: 'var(--warning)' }}>· ⚡ 관련도순</span>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 lg:pb-4">
          {/* 거래처 자주 구매 제품 추천 */}
          {customerSuggestedProducts.length > 0 && cart.length === 0 && (
            <div
              className="mb-4 rounded-xl border p-3"
              style={{ background: 'color-mix(in srgb, var(--primary) 5%, var(--card))', borderColor: 'color-mix(in srgb, var(--primary) 20%, var(--border))' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                  {loadedCustomer?.name} 자주 구매
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {customerSuggestedProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all hover:shadow-sm active:scale-95"
                    style={{
                      background: 'var(--card)',
                      borderColor: 'var(--border)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {p.name}
                    <span className="ml-1 opacity-50">x{p._freq}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {Object.keys(groupedProducts).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="w-12 h-12 mb-3" style={{ color: 'var(--muted-foreground)' }} />
              <p style={{ color: 'var(--muted-foreground)' }}>검색 결과가 없습니다</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${(aiSearch && searchTerm.trim()) ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
              {Object.entries(groupedProducts)
                // 네이버 자동등록 제품은 검색 시 항상 맨 아래로 (사용자 요청 — 중요도 낮음)
                .sort(([a], [b]) => {
                  const aAuto = a === '네이버 자동등록';
                  const bAuto = b === '네이버 자동등록';
                  return aAuto === bAuto ? 0 : aAuto ? 1 : -1;
                })
                .map(([category, categoryProducts]) => {
                const isExpanded = expandedCategories[category] !== false;
                return (
                  <div
                    key={category}
                    className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:bg-[var(--accent)]"
                      style={{ borderBottom: isExpanded ? `1px solid var(--border)` : 'none' }}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          style={{ color: 'var(--muted-foreground)' }}
                        />
                        <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                          {category}
                        </span>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                      >
                        {categoryProducts.length}개
                      </span>
                    </button>

                    {/* Category Products */}
                    {isExpanded && (() => {
                      const categoryHasImage = categoryProducts.some((p) =>
                        (Array.isArray(p.image_urls) && p.image_urls.length > 0)
                      ) || isImageDemoMode();
                      // 이미지 있는 제품이 하나라도 있으면 모든 카드가 이미지 레이아웃 사용
                      // 이미지 없는 카드는 placeholder로 채움 → 균일한 그리드
                      const aiSingle = aiSearch && searchTerm.trim();
                      // AI 검색(단일 관련도순 그룹)은 PC 폭·높이 꽉 채우기 — 반응형 다열 + 높이제한 해제(바깥이 스크롤)
                      // AI 검색은 리스트형 — 한 줄에 하나씩 크게(가로 행). 일반은 기존 카드 그리드
                      const gridColsCls = aiSingle
                        ? 'grid-cols-1'
                        : (categoryHasImage ? 'grid-cols-2 md:grid-cols-1' : 'grid-cols-2');
                      const heightCls = aiSingle ? '' : 'max-h-72 overflow-y-auto';
                      return (
                      <div className={`p-2.5 grid gap-2.5 ${heightCls} ${gridColsCls}`}>
                        {categoryProducts.map(product => {
                          const cartItem = cartMap.get(product.id);
                          const cartQty = cartItem ? cartItem.quantity : 0;
                          const displayPrice = priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale);
                          const exVatPrice = Math.round(displayPrice / 1.1);
                          const baseStock = product.stock !== undefined ? product.stock : 50;
                          const availableStock = baseStock - cartQty;
                          const isIncoming = product.stock_status === 'incoming';
                          const isOutOfStock = availableStock <= 0 && !isIncoming;
                          const isLowStock = availableStock > 0 && availableStock <= (product.min_stock || 5);
                          const inCart = !!cartItem;

                          // 실제 업로드된 이미지 우선, 없으면 데모 이미지 (데스크톱 ?demo=images)
                          const realImg = Array.isArray(product.image_urls) && product.image_urls.length > 0
                            ? product.image_urls[0].thumb
                            : null;
                          const demoImg = realImg || (isImageDemoMode() ? getSampleImage(product) : null);
                          // ⚠️ 주의사항: 강조 색상 왼쪽 액센트 바 + 메모 배지 (트레일러 타이어 등)
                          const flagColor = FLAG_MAP[product.flag_color] || null;
                          const hasNote = !!(product.note && String(product.note).trim());
                          const isTopMatch = topMatch && product.id === topMatch.id;
                          return (
                            <div
                              key={product.id}
                              onClick={() => !cartItem && addToCart(product)}
                              title={hasNote ? product.note : undefined}
                              className={`card-interactive rounded-xl cursor-pointer select-none border overflow-hidden ${
                                demoImg ? 'flex flex-col md:flex-row md:items-stretch md:min-h-[6rem]' : (aiSingle ? 'px-4 py-3.5 flex flex-row items-center justify-between gap-4' : 'px-3.5 py-4 min-h-[5.5rem] flex flex-col justify-between')
                              } ${
                                inCart
                                  ? 'ring-2'
                                  : ''
                              } ${isTopMatch ? 'top-match-card' : ''}`}
                              style={{
                                background: inCart
                                  ? 'color-mix(in srgb, var(--primary) 10%, var(--card))'
                                  : isIncoming
                                    ? 'color-mix(in srgb, var(--warning) 8%, var(--card))'
                                    : isOutOfStock
                                      ? 'color-mix(in srgb, var(--destructive) 8%, var(--card))'
                                      : 'var(--card)',
                                borderColor: inCart
                                  ? 'var(--primary)'
                                  : isIncoming
                                    ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                                    : isOutOfStock
                                      ? 'color-mix(in srgb, var(--destructive) 40%, var(--border))'
                                      : 'var(--border)',
                                '--tw-ring-color': 'var(--primary)',
                                // 강조 색상 왼쪽 액센트 바 (상태색과 무관하게 항상 표시)
                                boxShadow: flagColor ? `inset 4px 0 0 0 ${flagColor}` : undefined,
                              }}
                            >
                              {/* 🖼️ 썸네일 — 모바일: 상단 정사각 / 데스크톱: 좌측 96px stretch */}
                              {demoImg && (
                                <div
                                  className="relative flex-shrink-0 w-full aspect-square md:w-24 md:h-auto md:aspect-auto md:self-stretch overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 cursor-zoom-in"
                                  onClick={(e) => {
                                    // 실제 업로드된 이미지가 있을 때만 갤러리 오픈 (샘플 데모는 제외)
                                    if (realImg) {
                                      e.stopPropagation();
                                      setGalleryProduct(product);
                                    }
                                  }}
                                  title={realImg ? '클릭하여 크게 보기' : undefined}
                                >
                                  <img
                                    src={demoImg}
                                    alt={product.name}
                                    loading="lazy"
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                  {realImg && Array.isArray(product.image_urls) && product.image_urls.length > 1 && (
                                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-sm">
                                      +{product.image_urls.length - 1}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className={demoImg ? 'flex-1 min-w-0 px-3 py-2 flex flex-col justify-between' : (aiSingle ? 'flex flex-row items-center justify-between gap-4 flex-1 min-w-0' : '')}>
                              {/* Product name & stock badge */}
                              <div className={`flex items-start gap-1.5 ${aiSingle ? 'flex-1 min-w-0 items-center' : 'justify-between mb-1.5'}`}>
                                <p
                                  className={`${aiSingle ? 'text-base sm:text-lg font-semibold' : 'text-sm font-medium'} flex-1 min-w-0 break-words leading-snug`}
                                  style={{ color: 'var(--foreground)' }}
                                >
                                  {isTopMatch && (
                                    <span
                                      className="top-match-badge inline-flex items-center mr-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold align-middle whitespace-nowrap"
                                      style={{
                                        background: 'linear-gradient(135deg, var(--primary), #8b5cf6)',
                                        color: 'white',
                                        boxShadow: '0 2px 9px -2px color-mix(in srgb, #8b5cf6 55%, transparent)',
                                        letterSpacing: '0.02em',
                                      }}
                                    >
                                      {topMatch.exact ? '✓ 정확' : '🎯 1순위'}
                                    </span>
                                  )}
                                  {hasNote && (
                                    <span className="inline-flex items-center mr-1 align-middle" title={product.note} style={{ color: flagColor || 'var(--warning)' }}>⚠️</span>
                                  )}
                                  {product.name}
                                </p>
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-0.5"
                                  style={{
                                    background: isIncoming
                                      ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                                      : isOutOfStock
                                        ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                                        : isLowStock
                                          ? 'color-mix(in srgb, var(--warning) 20%, transparent)'
                                          : 'color-mix(in srgb, var(--success) 20%, transparent)',
                                    color: isIncoming
                                      ? 'var(--warning)'
                                      : isOutOfStock
                                        ? 'var(--destructive)'
                                        : isLowStock
                                          ? 'var(--warning)'
                                          : 'var(--success)',
                                  }}
                                >
                                  {isIncoming ? (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
                                      입고대기
                                    </>
                                  ) : isOutOfStock ? '품절' : `${availableStock}개`}
                                </span>
                              </div>

                              {/* Price / Cart controls */}
                              {inCart ? (
                                <div className="flex flex-col items-start min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-w-0">
                                  <div className="min-w-0">
                                    <p
                                      className="text-base sm:text-xl font-black whitespace-nowrap leading-tight tabular-nums min-w-0"
                                      style={{
                                        color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)',
                                        letterSpacing: '-0.02em',
                                      }}
                                    >
                                      {formatPrice(displayPrice)}<span className="text-[10px] sm:text-xs font-bold ml-0.5">원</span>
                                    </p>
                                    <p className="text-[10px] whitespace-nowrap mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                      VAT제외 {formatPrice(exVatPrice)}원
                                    </p>
                                  </div>
                                  <div
                                    className="flex items-center gap-0.5 rounded flex-shrink-0 border"
                                    style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                                  >
                                    <button
                                      onClick={(e) => { e.stopPropagation(); stepQuantity(product.id, -1); }}
                                      className="w-7 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-[var(--accent)] active:bg-[var(--accent)] rounded-l-lg transition-colors"
                                    >
                                      <Minus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                                    </button>
                                    <input
                                      type="number"
                                      value={cartItem.quantity}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val) && val >= 0) updateQuantity(product.id, val);
                                      }}
                                      onFocus={(e) => { e.stopPropagation(); e.target.select(); }}
                                      className="w-8 h-8 sm:w-10 sm:h-9 text-center text-sm font-bold bg-transparent border-none focus:outline-none"
                                      style={{ color: 'var(--foreground)' }}
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); stepQuantity(product.id, 1); }}
                                      className="w-7 h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-[var(--accent)] active:bg-[var(--accent)] rounded-r-lg transition-colors"
                                    >
                                      <Plus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className={aiSingle ? 'text-right flex-shrink-0' : 'min-w-0'}>
                                  <p
                                    className={`${aiSingle ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'} font-black whitespace-nowrap leading-tight tabular-nums`}
                                    style={{
                                      color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)',
                                      letterSpacing: '-0.02em',
                                    }}
                                  >
                                    {formatPrice(displayPrice)}<span className="text-xs font-bold ml-0.5">원</span>
                                  </p>
                                  <p className={`${aiSingle ? 'text-xs' : 'text-[10px]'} whitespace-nowrap mt-0.5`} style={{ color: 'var(--muted-foreground)' }}>
                                    VAT제외 {formatPrice(exVatPrice)}원
                                  </p>
                                </div>
                              )}
                              {/* ⚠️ 주의사항 메모 — 카드 하단 상시 표시 */}
                              {hasNote && (
                                <p
                                  className="mt-1.5 px-2 py-1 rounded text-[11px] font-medium leading-snug break-words"
                                  style={{
                                    background: `color-mix(in srgb, ${flagColor || 'var(--warning)'} 12%, transparent)`,
                                    color: flagColor || 'var(--warning)',
                                    border: `1px solid color-mix(in srgb, ${flagColor || 'var(--warning)'} 30%, transparent)`,
                                  }}
                                >
                                  ⚠️ {String(product.note).trim()}
                                </p>
                              )}
                              </div>{/* end demo image inner wrapper */}
                            </div>
                          );
                        })}
                      </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Cart Bottom Bar */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-4 py-3 border-t shadow-lg"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div
              onClick={() => cart.length > 0 && setIsCartExpanded(true)}
              className={`flex-1 ${cart.length > 0 ? 'cursor-pointer' : ''}`}
            >
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                공급가 {formatPrice(vatBreakdown.supply)}원 + VAT
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {formatPrice(totalAmount)}원
                </p>
                {cart.length > 0 && (
                  <ChevronUp className="w-4 h-4 animate-bounce" style={{ color: 'var(--primary)' }} />
                )}
              </div>
            </div>
            <button
              onClick={openOrderConfirm}
              className="px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Calculator className="w-4 h-4" />
              주문 확인 ({totalQuantity})
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Cart Panel (desktop fixed sidebar) */}
      <div
        className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[400px] flex-col border-l z-20"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {/* Cart Header */}
        <div className="px-4 py-3.5 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            <h2 className="font-black text-lg" style={{ color: 'var(--foreground)' }}>주문 목록</h2>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {cart.length}종 / {totalQuantity}개
            </span>
          </div>
          <button
            onClick={() => setIsCartExpanded(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors"
            title="전체보기"
          >
            <Maximize2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <ShoppingCart className="w-10 h-10 mb-2" style={{ color: 'var(--muted-foreground)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>주문 목록이 비어있습니다</p>
            </div>
          ) : (
            // 1열 — 400px 패널에 2열이면 카드가 190px라 폰트를 9~12px까지 줄여야 해서 안 보였다.
            // 1열로 폭을 2배 확보하고 제품명/금액을 읽을 수 있는 크기로 키움 (2026-07-15)
            <div className="p-2.5 space-y-2">
              {cartWithDiscount.map(item => {
                const baseStock = item.stock !== undefined ? item.stock : 50;
                const remainingStock = baseStock - item.quantity;
                const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                // 택배비/퀵비 등 부대비용은 재고 개념이 없다 — 기본값 50에서 빠진 "잔여 49"가 뜨던 버그 (2026-07-16)
                const isFee = item.taxFree === true || item.isCustom === true;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl p-3 group relative border-2 transition-colors hover:bg-[var(--accent)]"
                    style={{
                      background: hasDiscount
                        ? 'color-mix(in srgb, var(--warning) 6%, var(--card))'
                        : 'var(--secondary)',
                      borderColor: hasDiscount
                        ? 'color-mix(in srgb, var(--warning) 40%, var(--border))'
                        : 'var(--border)',
                    }}
                  >
                    {/* Delete button */}
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full transition-all"
                      style={{ background: 'var(--destructive)', color: 'white' }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Name + stock/discount badge */}
                    <div className="flex items-start gap-2 pr-7 mb-2.5">
                      <p className="text-base font-bold flex-1 min-w-0 break-words leading-snug" style={{ color: 'var(--foreground)' }}>
                        {item.name}
                      </p>
                      {hasDiscount ? (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 whitespace-nowrap"
                          style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' }}
                        >
                          {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}%↓` : `${formatPrice(item.appliedTier.value)}↓`}
                        </span>
                      ) : isFee ? (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 whitespace-nowrap"
                          style={{ background: 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)', color: 'var(--muted-foreground)' }}
                        >
                          비과세
                        </span>
                      ) : (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 whitespace-nowrap"
                          style={{
                            background: remainingStock <= 0
                              ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                              : 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)',
                            color: remainingStock <= 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
                          }}
                        >
                          {remainingStock <= 0 ? '마지막' : `잔여 ${remainingStock}`}
                        </span>
                      )}
                    </div>

                    {/* Quantity + amount */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-1 rounded-xl px-1.5 py-1 border"
                        style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                      >
                        <button
                          onClick={() => stepQuantity(item.id, -1)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--accent)] transition-colors"
                        >
                          <Minus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 0) updateQuantity(item.id, val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-12 h-9 text-center text-xl font-black bg-transparent border-none focus:outline-none tabular-nums"
                          style={{ color: 'var(--foreground)' }}
                        />
                        <button
                          onClick={() => stepQuantity(item.id, 1)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--accent)] transition-colors"
                        >
                          <Plus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                        </button>
                      </div>
                      <div className="text-right min-w-0">
                        {hasDiscount && (
                          <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>
                            {formatPrice(item.originalTotal)}원
                          </p>
                        )}
                        <p
                          className="text-2xl font-black leading-tight tabular-nums whitespace-nowrap"
                          style={{ color: hasDiscount ? 'var(--warning)' : 'var(--primary)' }}
                        >
                          {formatPrice(item.finalTotal)}<span className="text-sm font-bold">원</span>
                        </p>
                        <p className="text-xs leading-tight tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                          {/* 비과세는 받은 금액 전액이 공급가 — calcExVat로 나누면 안 됨 (2026-07-16) */}
                          공급 {formatPrice(item.taxFree ? item.finalTotal : calcExVat(item.finalTotal))}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 번들 추천 — 함께 자주 주문되는 제품 */}
        {bundleSuggestions.length > 0 && (
          <div className="px-3 py-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-bold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              🔗 함께 주문하면 좋은 제품
            </p>
            <div className="flex gap-1 flex-wrap">
              {bundleSuggestions.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="px-2 py-1 rounded text-[10px] font-medium border transition-all hover:shadow-sm active:scale-95"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="text-xs space-y-0.5" style={{ color: 'var(--muted-foreground)' }}>
                <p>공급가 {formatPrice(vatBreakdown.supply)}원</p>
                <p>VAT {formatPrice(vatBreakdown.vat)}원</p>
                {totalDiscount > 0 && (
                  <p style={{ color: 'var(--warning)' }}>할인 -{formatPrice(totalDiscount)}원</p>
                )}
              </div>
              <div
                className="text-right cursor-pointer rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-[var(--accent)]"
                onClick={() => onOpenQuickCalculator && onOpenQuickCalculator(totalAmount)}
                title="계산기 열기"
              >
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>총 금액</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                  {formatPrice(totalAmount)}원
                </p>
              </div>
            </div>

            {/* 모의 견적 (주문 확인 전) — 카톡 복사 / 출력 */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={copyQuoteText}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)]"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <Copy className="w-3.5 h-3.5" /> 카톡 복사
              </button>
              <button
                onClick={printQuote}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)]"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <Printer className="w-3.5 h-3.5" /> 견적서 출력
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCart([])}
                className="py-2.5 px-4 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--accent)] border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                초기화
              </button>
              <button
                onClick={openOrderConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Calculator className="w-4 h-4" />
                주문 확인
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Confirmation Page */}
      {showOrderConfirm && (
        <OrderPage
          cart={cart}
          priceType={priceType}
          totalAmount={totalAmount}
          formatPrice={formatPrice}
          onSaveOrder={async (orderData) => {
            if (!saveOrder) return null;
            const result = await saveOrder({
              customer_name: orderData.customerName || '일반고객',
              customer_phone: orderData.customerPhone || '',
              customer_address: orderData.customerAddress || '',
              memo: orderData.memo || '',
              items: orderData.items,
              total_amount: orderData.totalAmount,
              price_type: orderData.priceType,
              order_number: orderData.orderNumber,
              existing_customer_id: orderData.existingCustomerId,
            });
            if (result) onClearLoadedCustomer?.();
            return result;
          }}
          isSaving={isSaving}
          onUpdateQuantity={updateQuantity}
          onStepQuantity={stepQuantity}
          onRemoveItem={removeFromCart}
          onAddItem={addToCart}
          onReplaceItem={replaceItem}
          onUpdateItem={updateItem}
          products={products}
          initialCustomer={loadedCustomer}
          customers={customers}
          onBack={() => {
            setShowOrderConfirm(false);
            onClearLoadedCustomer?.();
          }}
          onSaveCart={(info) => {
            if (onSaveCartModal) onSaveCartModal(info);
          }}
          showToast={showToast}
        />
      )}

      {/* Cart Expanded Modal */}
      {isCartExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-fs-transition"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: isCartFullscreen ? '0' : '1rem' }}
          onClick={() => setIsCartExpanded(false)}
        >
          <div
            className="w-full overflow-hidden flex flex-col border shadow-2xl modal-fs-transition"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', maxWidth: isCartFullscreen ? '100vw' : 'min(56rem, calc(100vw - 2rem))', height: isCartFullscreen ? '100vh' : 'auto', maxHeight: isCartFullscreen ? '100vh' : 'calc(100vh - 2rem)', borderRadius: isCartFullscreen ? '0' : '1rem', boxShadow: isCartFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>주문 목록</h2>
                <span
                  className="text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                >
                  {cart.length}종 / {totalQuantity}개
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCartFullscreen(); }}
                  className="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
                  title={isCartFullscreen ? '원래 크기' : '전체화면'}
                >
                  {isCartFullscreen ? <Minimize2 className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} /> : <Maximize2 className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />}
                </button>
                <button
                  onClick={() => setIsCartExpanded(false)}
                  className="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors"
                >
                  <X className="w-6 h-6" style={{ color: 'var(--muted-foreground)' }} />
                </button>
              </div>
            </div>

            {/* Modal Items */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 modal-scroll-area"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <ShoppingCart className="w-16 h-16 mb-4" style={{ color: 'var(--muted-foreground)', opacity: 0.3 }} />
                  <p className="text-lg" style={{ color: 'var(--muted-foreground)' }}>주문 목록이 비어있습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {cartWithDiscount.map(item => {
                    const baseStock = item.stock !== undefined ? item.stock : 50;
                    const remainingStock = baseStock - item.quantity;
                    const hasDiscount = item.appliedTier && item.totalDiscount > 0;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl p-4 group relative border transition-colors hover:bg-[var(--accent)]"
                        style={{
                          background: hasDiscount ? 'color-mix(in srgb, var(--warning) 6%, var(--card))' : 'var(--secondary)',
                          borderColor: hasDiscount ? 'color-mix(in srgb, var(--warning) 30%, var(--border))' : 'var(--border)',
                        }}
                      >
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-full transition-all"
                          style={{ background: 'var(--destructive)', color: 'white' }}
                        >
                          <X className="w-4 h-4" />
                        </button>

                        <div className="mb-3">
                          <p className="text-sm font-medium pr-6 break-words leading-snug" style={{ color: 'var(--foreground)' }}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {hasDiscount && (
                              <span
                                className="text-xs px-2 py-0.5 rounded font-medium"
                                style={{ background: 'color-mix(in srgb, var(--warning) 20%, transparent)', color: 'var(--warning)' }}
                              >
                                {item.appliedTier.type === 'percent' ? `${item.appliedTier.value}% 할인` : `${formatPrice(item.appliedTier.value)}원 할인`}
                              </span>
                            )}
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                background: remainingStock <= 0
                                  ? 'color-mix(in srgb, var(--destructive) 20%, transparent)'
                                  : 'color-mix(in srgb, var(--muted-foreground) 15%, transparent)',
                                color: remainingStock <= 0 ? 'var(--destructive)' : 'var(--muted-foreground)',
                              }}
                            >
                              {remainingStock <= 0 ? '마지막' : `잔여${remainingStock}`}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs mb-2">
                          {hasDiscount ? (
                            <div className="flex items-center gap-2">
                              <span className="line-through" style={{ color: 'var(--muted-foreground)' }}>
                                {formatPrice(item.unitPrice)}원
                              </span>
                              <span className="font-medium" style={{ color: 'var(--warning)' }}>
                                {formatPrice(item.discountedPrice)}원
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)' }}>
                              단가: {formatPrice(item.unitPrice)}원
                            </span>
                          )}
                        </div>

                        <div
                          className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 mb-3 border"
                          style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                        >
                          <button
                            onClick={() => stepQuantity(item.id, -1)}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                          >
                            <Minus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val) && val >= 0) updateQuantity(item.id, val);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-14 h-8 text-center text-lg font-bold bg-transparent border-none focus:outline-none"
                            style={{ color: 'var(--foreground)' }}
                          />
                          <button
                            onClick={() => stepQuantity(item.id, 1)}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--accent)] transition-colors"
                          >
                            <Plus className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
                          </button>
                        </div>

                        <div className="text-center">
                          {hasDiscount && (
                            <p className="text-xs line-through" style={{ color: 'var(--muted-foreground)' }}>
                              {formatPrice(item.originalTotal)}원
                            </p>
                          )}
                          <p
                            className="text-base font-bold"
                            style={{ color: hasDiscount ? 'var(--warning)' : 'var(--primary)' }}
                          >
                            {formatPrice(item.finalTotal)}원
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm space-y-1" style={{ color: 'var(--muted-foreground)' }}>
                    <p>공급가 {formatPrice(vatBreakdown.supply)}원</p>
                    <p>VAT {formatPrice(vatBreakdown.vat)}원</p>
                    {totalDiscount > 0 && (
                      <p style={{ color: 'var(--warning)' }}>할인 -{formatPrice(totalDiscount)}원</p>
                    )}
                  </div>
                  <div
                    className="text-right cursor-pointer rounded-lg p-2 -m-2 transition-colors hover:bg-[var(--accent)]"
                    onClick={() => onOpenQuickCalculator && onOpenQuickCalculator(totalAmount)}
                    title="계산기 열기"
                  >
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>총 금액</p>
                    <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
                      {formatPrice(totalAmount)}원
                    </p>
                  </div>
                </div>

                {/* 모의 견적 (주문 확인 전) — 카톡 복사 / 출력 */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={copyQuoteText}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    <Copy className="w-4 h-4" /> 카톡 복사
                  </button>
                  <button
                    onClick={printQuote}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--accent)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    <Printer className="w-4 h-4" /> 견적서 출력
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCart([])}
                    className="py-3 px-6 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--accent)] border"
                    style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  >
                    초기화
                  </button>
                  <button
                    onClick={() => {
                      setIsCartExpanded(false);
                      openOrderConfirm();
                    }}
                    className="flex-1 py-3 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-colors"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    <Calculator className="w-5 h-5" />
                    주문 확인
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* AI 주문 인식 모달 */}
      {showAiModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAiModal(false)}
        >
          <div
            className="w-full overflow-hidden flex flex-col modal-fs-transition animate-modal-up"
            style={{
              backgroundColor: 'var(--background)',
              maxWidth: isAiFullscreen ? '100vw' : '64rem',
              height: isAiFullscreen ? '100vh' : '95vh',
              maxHeight: isAiFullscreen ? '100vh' : '90vh',
              borderRadius: isAiFullscreen ? '0' : '1rem',
            }}
            onClick={e => e.stopPropagation()}
          >
            <TextAnalyze
              products={products}
              onAddToCart={(newItems) => {
                setCart(prev => {
                  const merged = [...prev];
                  for (const newItem of newItems) {
                    const idx = merged.findIndex(i => i.id === newItem.id && i.price === newItem.price);
                    if (idx >= 0) {
                      merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + newItem.quantity };
                    } else {
                      merged.push(newItem);
                    }
                  }
                  return merged;
                });
                showToast && showToast('상품이 장바구니에 추가되었습니다', 'success');
              }}
              formatPrice={formatPrice}
              priceType={priceType}
              onBack={() => setShowAiModal(false)}
              isFullscreen={isAiFullscreen}
              onToggleFullscreen={toggleAiFullscreen}
              onClose={() => setShowAiModal(false)}
            />
          </div>
        </div>
      )}

      {/* 주문 저장 로딩 오버레이 - OrderPage(z-50), successModal(z-70) 위에 표시 */}
      {isSaving && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="flex flex-col items-center gap-4 p-8 rounded-2xl shadow-2xl mx-4 animate-pulse"
            style={{ background: 'var(--card)', minWidth: '240px' }}
          >
            <div className="relative w-16 h-16">
              <div
                className="absolute inset-0 rounded-full border-4 animate-spin"
                style={{ borderColor: 'var(--muted)', borderTopColor: 'var(--primary)' }}
              />
              <div
                className="absolute inset-2 rounded-full border-4 animate-spin"
                style={{ borderColor: 'transparent', borderBottomColor: 'var(--primary)', animationDirection: 'reverse', animationDuration: '0.8s' }}
              />
            </div>
            <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              {savingStep || '처리 중...'}
            </p>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              잠시만 기다려주세요
            </p>
          </div>
        </div>
      )}

      {/* 🖼️ 제품 이미지 갤러리 (썸네일 클릭 시) */}
      {galleryProduct && Array.isArray(galleryProduct.image_urls) && galleryProduct.image_urls.length > 0 && (
        <ProductGalleryModal
          images={galleryProduct.image_urls}
          productName={galleryProduct.name}
          onClose={() => setGalleryProduct(null)}
        />
      )}
    </div>
  );
}
