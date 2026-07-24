import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Menu, Truck, X, Plus, Search, Trash2, Download, FileText,
  Printer, Check, Maximize2, Minimize2, MessageCircle, Copy
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { formatPrice, escapeHtml, handleSearchFocus, getTodayKST, toDateKST, offsetDateKST } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useDraggableResizable from '@/hooks/useDraggableResizable';
import { NAVER_COURIERS, DEFAULT_COURIER_CODE } from '@/lib/naverCouriers';

// 커스텀 항목/주문에서 네이버 주문번호(provider_order_id) 추출.
// 📦 버튼 생성 항목: id="naver-{poid}-{ts}" / note="[네이버 {poid}]"
const getEntryNaverPoid = (entry) => {
  if (!entry) return null;
  const m1 = /^naver-(\d+)-/.exec(entry.id || '');
  if (m1) return m1[1];
  const m2 = /\[네이버\s*(\d+)\]/.exec(entry.note || '');
  return m2 ? m2[1] : null;
};
// 내부주문 전환 건: memo="[엠파츠] [네이버 스마트스토어] {poid} ..."
const getOrderNaverPoid = (order) => {
  if (!order || typeof order.memo !== 'string') return null;
  const m = /\[네이버 스마트스토어\]\s*(\d+)/.exec(order.memo);
  return m ? m[1] : null;
};

// 송장번호 입력 → 네이버 발송처리 큐 등록 인라인 패널.
// 매장 PC sync.js 가 60초 내 네이버 dispatch API 로 자동 연동 (IP 화이트리스트 우회).
function NaverDispatchPanel({ providerOrderId, showToast }) {
  const [company, setCompany] = useState(DEFAULT_COURIER_CODE);
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const t = (tracking || '').trim();
    if (!t) { showToast?.('송장번호를 입력해주세요', 'error'); return; }
    setBusy(true);
    try {
      const ext = await supabase.getExternalOrderByProviderOrderId(providerOrderId);
      if (!ext) { showToast?.(`네이버 주문(${providerOrderId})을 찾지 못했어요`, 'error'); return; }
      if (ext.naver_dispatch_succeeded_at) {
        showToast?.('이미 네이버 발송처리된 주문이에요', 'info'); setDone(true); return;
      }
      const courier = NAVER_COURIERS.find((c) => c.code === company);
      const needsConfirm = !ext.naver_confirm_succeeded_at;
      const patch = {
        needs_naver_dispatch: true,
        naver_dispatch_company_code: company,
        naver_dispatch_company_name: courier?.name || company,
        naver_dispatch_tracking: t,
        naver_dispatch_retry_count: 0,
        naver_dispatch_next_retry_at: null,
      };
      // 발주확인 안 됐으면 confirm 큐도 함께 (sync.js 가 confirm→dispatch 순서 처리)
      if (needsConfirm) {
        patch.needs_naver_confirm = true;
        patch.naver_confirm_retry_count = 0;
        patch.naver_confirm_next_retry_at = null;
      }
      const ok = await supabase.updateExternalOrder(ext.id, patch);
      if (ok) {
        setDone(true);
        showToast?.(`네이버 발송처리 대기열 등록 (${courier?.name} · ${t}) — 60초 내 자동 연동`, 'success');
      } else {
        showToast?.('네이버 연동 실패 — 다시 시도해주세요', 'error');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-2 p-2.5 rounded-lg border" style={{ background: 'color-mix(in srgb, #03c75a 8%, transparent)', borderColor: 'color-mix(in srgb, #03c75a 35%, var(--border))' }}>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-bold" style={{ color: '#03c75a' }}>
        <Truck className="w-3.5 h-3.5" /> 네이버 발송 연동 (송장번호 입력 → 자동 발송처리)
      </div>
      {done ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#03c75a' }}>
          <Check className="w-4 h-4" /> 네이버 발송 대기열 등록됨 — 60초 내 연동
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select value={company} onChange={(e) => setCompany(e.target.value)}
            className="px-2 py-1.5 border rounded-lg text-sm focus:outline-none bg-[var(--background)] border-[var(--border)]">
            {NAVER_COURIERS.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)}
            placeholder="송장번호" inputMode="numeric"
            className="flex-1 min-w-0 px-2 py-1.5 border rounded-lg text-sm focus:outline-none bg-[var(--background)] border-[var(--border)]" />
          <button onClick={submit} disabled={busy}
            className="px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0 disabled:opacity-50"
            style={{ background: '#03c75a', color: 'white' }}>
            {busy ? '등록 중…' : '네이버 발송'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShippingLabel({ orders = [], customers = [], savedCarts = [], onBack, refreshCustomers, showToast }) {
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [kakaoCopied, setKakaoCopied] = useState(false);
  const [senderList] = useState(['무브모터스', '엠파츠']);
  const [dateFilter, setDateFilter] = useState('today');
  const [orderSettings, setOrderSettings] = useState({});
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [tempAddress, setTempAddress] = useState('');
  const [tempPhone, setTempPhone] = useState('');

  const [savedCustomerSettings, setSavedCustomerSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('shippingCustomerSettings');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('shippingCustomerSettings 파싱 실패:', e);
      return {};
    }
  });

  const [customEntries, setCustomEntries] = useState(() => {
    const saved = localStorage.getItem('shippingCustomEntries');
    try { return saved ? JSON.parse(saved) : []; }
    catch (e) { console.warn('shippingCustomEntries 파싱 실패:', e); return []; }
  });
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  // 동적 default sender — 가장 최근 customEntry 의 sender 따라감 (네이버 prefill 자동 반영)
  const computeDefaultSender = () => {
    try {
      const saved = localStorage.getItem('shippingCustomEntries');
      if (saved) {
        const list = JSON.parse(saved);
        if (list[0]?.sender) return list[0].sender;
      }
    } catch {}
    return '무브모터스';
  };
  const [newCustomEntry, setNewCustomEntry] = useState({
    name: '',
    phone: '',
    address: '',
    product: '',
    amount: '',
    packaging: '박스1',
    paymentType: '착불',
    sender: computeDefaultSender()
  });

  // customEntries 변경 시 최신 entry 의 sender 자동 반영 (네이버 prefill 직후 즉시 동기화)
  useEffect(() => {
    if (customEntries.length > 0 && customEntries[0]?.sender) {
      setNewCustomEntry((prev) =>
        prev.sender === customEntries[0].sender ? prev : { ...prev, sender: customEntries[0].sender }
      );
    }
  }, [customEntries]);

  useEffect(() => {
    localStorage.setItem('shippingCustomEntries', JSON.stringify(customEntries));
  }, [customEntries]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showAddCustomModal) { setShowAddCustomModal(false); return; }
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, showAddCustomModal]);

  useEffect(() => {
    if (refreshCustomers) refreshCustomers();
  }, [refreshCustomers]);

  // -- Customer search keyboard nav --
  const filteredCustomerSearch = useMemo(() => {
    if (!newCustomEntry.name) return [];
    const term = newCustomEntry.name.toLowerCase().replace(/\s/g, '');
    const filtered = (customers || []).filter(c => {
      if (!c?.name) return false;
      const name = c.name.toLowerCase().replace(/\s/g, '');
      const phone = (c.phone || '').replace(/\s/g, '');
      return name.includes(term) || phone.includes(term);
    }).slice(0, 5);
    const exactMatch = filtered.find(c => c.name === newCustomEntry.name);
    if (exactMatch && newCustomEntry.phone === (exactMatch.phone || '')) return [];
    return filtered;
  }, [newCustomEntry.name, newCustomEntry.phone, customers]);

  const selectShippingCustomer = useCallback((c) => {
    const savedSetting = savedCustomerSettings[c.name];
    setNewCustomEntry(prev => ({
      ...prev,
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      ...(savedSetting && {
        paymentType: savedSetting.paymentType || '착불',
        packaging: savedSetting.packaging || '박스1',
        sender: savedSetting.sender || '무브모터스'
      })
    }));
  }, [savedCustomerSettings]);

  const { highlightIndex: shipCustHi, handleKeyDown: shipCustKeyDown } = useKeyboardNav(
    filteredCustomerSearch,
    selectShippingCustomer,
    filteredCustomerSearch.length > 0
  );

  const {
    maximized: isAddModalFullscreen,
    toggleMaximized: toggleAddModalFullscreen,
    isDesktop: isAddModalDraggable,
    containerStyle: addModalDragStyle,
    dragHandleProps: addModalDragHandleProps,
    handles: addModalResizeHandles,
  } = useDraggableResizable('pos-web.shippingAddCustomer', { w: 760, h: 720 });

  // -- Filtering --

  const todayKST = getTodayKST();
  const yesterdayKST = offsetDateKST(todayKST, -1);
  const weekAgoKST = offsetDateKST(todayKST, -7);

  // 오늘 출고 예약된 저장 장바구니를 주문 형식으로 변환해 합침
  const todayCartsAsOrders = useMemo(() => {
    return (savedCarts || [])
      .filter((c) => c?.delivery_date === todayKST)
      .map((c) => ({
        id: `cart-${c.id}`,
        orderNumber: `CART-${String(c.id || '').slice(-6).toUpperCase()}`,
        customerName: c.name || '',
        customerPhone: c.phone || '',
        customerAddress: c.address || '',
        items: c.items || [],
        totalAmount: c.total || 0,
        priceType: c.priceType || c.price_type || 'wholesale',
        // dateFilter='today' 매칭을 위해 오늘 자정 KST로 세팅 (실제 카트는 createdAt 별개)
        createdAt: `${todayKST}T00:00:00+09:00`,
        memo: c.memo || '',
        __fromSavedCart: true,
      }));
  }, [savedCarts, todayKST]);

  const safeOrders = [...(orders || []), ...todayCartsAsOrders];

  const filteredOrders = safeOrders.filter(order => {
    if (!order.createdAt) return false;
    const orderDateKST = toDateKST(order.createdAt);
    if (dateFilter === 'today') return orderDateKST === todayKST;
    if (dateFilter === 'yesterday') return orderDateKST === yesterdayKST;
    if (dateFilter === 'week') return orderDateKST >= weekAgoKST;
    return true;
  });

  // -- Helpers --

  const findCustomer = (name) => {
    if (!name) return null;
    return (customers || []).find(c => c.name && c.name.toLowerCase().replace(/\s/g, '') === name.toLowerCase().replace(/\s/g, ''));
  };

  const calculateShippingCost = (packaging) => {
    if (!packaging) return '7300';
    let costs = [];
    const input = String(packaging);
    const boxIndex = input.indexOf('박스');
    const nakedIndex = input.indexOf('나체');

    const addBoxCosts = () => {
      const boxNum = input.match(/박스(\d)/);
      if (boxNum && boxNum[1]) {
        const count = parseInt(boxNum[1]) || 1;
        for (let i = 0; i < count; i++) costs.push(7300);
      }
    };
    const addNakedCosts = () => {
      const nakedNum = input.match(/나체(\d)/);
      if (nakedNum && nakedNum[1]) {
        const count = parseInt(nakedNum[1]) || 1;
        for (let i = 0; i < count; i++) costs.push(12000);
      }
    };

    if (boxIndex >= 0 && nakedIndex >= 0) {
      if (boxIndex < nakedIndex) { addBoxCosts(); addNakedCosts(); }
      else { addNakedCosts(); addBoxCosts(); }
    } else if (boxIndex >= 0) {
      addBoxCosts();
    } else if (nakedIndex >= 0) {
      addNakedCosts();
    }

    if (costs.length === 0) return '7300';
    return costs.join(',');
  };

  // 스토어(엠파츠) 주문 식별
  //  1) 내부주문 전환 시 memo에 "[엠파츠] [네이버 스마트스토어]" 마커 기록됨
  //  2) 마커 유실(과거 병합 등)·수동/저장카트 주문 대비 — 거래처가 '엠파츠' 카테고리면 스토어 주문으로 간주
  const isEmpartsCustomer = (name) => {
    if (!name) return false;
    const c = (customers || []).find((x) => x?.name === name);
    return !!c && c.category === '엠파츠';
  };
  const isStoreOrder = (order) => {
    if (!order) return false;
    if (typeof order.memo === 'string' &&
        (order.memo.includes('[엠파츠]') || order.memo.includes('네이버 스마트스토어'))) return true;
    return isEmpartsCustomer(order.customerName || order.customer_name);
  };

  const getOrderSetting = (orderNumber, customerName = null, order = null) => {
    const override = orderSettings[orderNumber]; // 사용자가 직접 바꾼 값
    const storeOrder = isStoreOrder(order);
    if (override) {
      // 🚨 스토어(엠파츠) 주문은 발송인을 항상 엠파츠로 강제 — 포장/금액만 바꿔도 발송인이 무브모터스로
      //    유실되던 버그 방지(커스텀 항목과 동일 정책). packaging/paymentType 등 나머지 override는 존중.
      return storeOrder ? { ...override, sender: '엠파츠' } : override;
    }
    // 스토어 주문은 발송인=엠파츠 고정 + 착불/선불은 memo에서 자동 (매장 거래처 설정보다 우선)
    if (storeOrder) {
      const paymentType = /배송:\s*착불/.test(order?.memo || '') ? '착불' : '선불';
      return { paymentType, packaging: '박스1', shippingCost: '7300', sender: '엠파츠' };
    }
    if (customerName && savedCustomerSettings[customerName]) return savedCustomerSettings[customerName];
    return { paymentType: '착불', packaging: '박스1', shippingCost: '7300', sender: senderList[0] };
  };

  const getMostExpensiveItem = (items) => {
    if (!items || items.length === 0) return '상품';
    return items.reduce((max, item) => item.price > max.price ? item : max, items[0]).name;
  };

  // 발송은 "받는사람" 기준 — 전환 memo의 "받는분: 이름 / 전화" 파싱 (없으면 주문자명 사용)
  const parseReceiver = (order) => {
    const m = (order?.memo || '').match(/받는분:\s*([^\n/]+?)(?:\s*\/\s*([0-9+\-\s]+))?\s*(?:\n|$)/);
    if (!m) return null;
    const name = (m[1] || '').trim();
    return name ? { name, tel: (m[2] || '').trim() } : null;
  };
  // 송장/엑셀/인쇄에 쓸 수령인 이름 (받는분 우선, 없으면 주문자명)
  const shippingName = (order) => parseReceiver(order)?.name || order?.customerName || '';
  // 배송메모 (전환 memo의 "배송메모: ...")
  const parseShippingMemo = (order) => {
    const m = (order?.memo || '').match(/배송메모:\s*([^\n]+)/);
    return m ? m[1].trim() : '';
  };
  // 송장 배송지 주소 — 주문의 주소(주문 수정 반영) 최우선 → 전환 memo "주소:" → 거래처 레코드 폴백
  // (이전엔 거래처 레코드 주소만 봐서, 거래처 미등록·주문에만 주소 입력한 건이 "주소 없음"으로 누락됨)
  const shipAddress = (order, customer) => {
    const oa = (order?.customerAddress || order?.customer_address || '').trim();
    if (oa) return oa;
    const m = (order?.memo || '').match(/주소:\s*([^\n]+)/);
    if (m && m[1].trim()) return m[1].trim();
    return customer?.address || '';
  };
  // 사장님이 직접 적은 주문 메모 (주문내역에 뜨는 그 메모) — 스토어 자동메모 마커 줄은 제외
  const getUserNote = (order) => {
    const raw = (order?.memo || '').trim();
    if (!raw) return '';
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) =>
      l &&
      !/^\[/.test(l) &&                 // [엠파츠] [네이버 스마트스토어] 마커
      !/^구매자\s*:/.test(l) &&
      !/^받는분\s*:/.test(l) &&
      !/^주소\s*:/.test(l) &&
      !/^배송메모\s*:/.test(l) &&
      !/^배송\s*:/.test(l) &&
      !/네이버\s*스마트스토어/.test(l)
    );
    return lines.join(' ').trim();
  };

  const updateOrderSetting = (orderNumber, field, value) => {
    const order = filteredOrders.find(o => o.orderNumber === orderNumber) || null;
    setOrderSettings(prev => {
      // ⚠️ override 없을 때 하드코딩 기본(무브모터스) 대신 '계산된 기본값'을 base로 —
      //    스토어=엠파츠/저장고객 설정의 발송인이 첫 편집에서 유실되던 버그 수정
      const current = prev[orderNumber] || getOrderSetting(orderNumber, order?.customerName || null, order);
      let updated = { ...current, [field]: value };
      if (field === 'packaging') updated.shippingCost = calculateShippingCost(value);
      return { ...prev, [orderNumber]: updated };
    });
  };

  const handleSelectAll = () => {
    const allIds = [...filteredOrders.map(o => o.orderNumber), ...customEntries.map(e => e.id)];
    if (selectedOrders.length === allIds.length) setSelectedOrders([]);
    else setSelectedOrders(allIds);
  };

  const toggleOrder = (orderNumber) => {
    setSelectedOrders(prev => prev.includes(orderNumber) ? prev.filter(o => o !== orderNumber) : [...prev, orderNumber]);
  };

  // -- Customer info edit --

  const startEditCustomer = (customerName) => {
    const customer = (customers || []).find(c => c?.name === customerName);
    if (customer) {
      setEditingCustomer(customer.id);
      setTempAddress(customer.address || '');
      setTempPhone(customer.phone || '');
    }
  };

  const cancelEditCustomer = () => {
    setEditingCustomer(null);
    setTempAddress('');
    setTempPhone('');
  };

  const saveCustomerInfo = async (customerId) => {
    try {
      const updated = await supabase.updateCustomer(customerId, { address: tempAddress, phone: tempPhone });
      if (updated) {
        if (refreshCustomers) await refreshCustomers();
        setEditingCustomer(null);
        setTempAddress('');
        setTempPhone('');
        if (showToast) showToast('업체 정보가 업데이트되었습니다');
      } else {
        if (showToast) showToast('업데이트 실패');
      }
    } catch (error) {
      console.error('고객 정보 업데이트 오류:', error);
      if (showToast) showToast('업데이트 실패');
    }
  };

  // -- Custom entries --

  const addCustomEntry = () => {
    if (!newCustomEntry.name) return;
    const entry = {
      ...newCustomEntry,
      id: `custom_${Date.now()}`,
      shippingCost: calculateShippingCost(newCustomEntry.packaging)
    };
    setCustomEntries(prev => [...prev, entry]);
    // sender 는 방금 선택한 값 보존 (네이버=엠파츠 / 매장=무브모터스 연속 입력 시 매번 변경 부담 제거)
    setNewCustomEntry((prev) => ({ name: '', phone: '', address: '', product: '', amount: '', packaging: '박스1', paymentType: '착불', sender: prev.sender || '무브모터스' }));
    setShowAddCustomModal(false);
  };

  const removeCustomEntry = (id) => {
    setCustomEntries(prev => prev.filter(e => e.id !== id));
    setSelectedOrders(prev => prev.filter(o => o !== id));
  };

  const updateCustomEntry = (id, field, value) => {
    setCustomEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        if (field === 'packaging') updated.shippingCost = calculateShippingCost(value);
        return updated;
      }
      return entry;
    }));
  };

  // -- Customer settings --

  const saveCustomerSetting = (customerName, setting) => {
    if (!customerName) return;
    const newSettings = {
      ...savedCustomerSettings,
      [customerName]: { paymentType: setting.paymentType, packaging: setting.packaging, shippingCost: setting.shippingCost, sender: setting.sender }
    };
    setSavedCustomerSettings(newSettings);
    localStorage.setItem('shippingCustomerSettings', JSON.stringify(newSettings));
    if (showToast) showToast(`${customerName} 설정 저장됨`);
  };

  const deleteCustomerSetting = (customerName) => {
    const newSettings = { ...savedCustomerSettings };
    delete newSettings[customerName];
    setSavedCustomerSettings(newSettings);
    localStorage.setItem('shippingCustomerSettings', JSON.stringify(newSettings));
    if (showToast) showToast(`${customerName} 설정 삭제됨`);
  };

  // -- Export functions --

  const generateGroupedData = () => {
    const selectedData = filteredOrders.filter(o => selectedOrders.includes(o.orderNumber));
    const selectedCustom = customEntries.filter(e => selectedOrders.includes(e.id));
    const groupedBySender = {};
    senderList.forEach(sender => { groupedBySender[sender] = { orders: [], custom: [] }; });
    selectedData.forEach(order => {
      const setting = getOrderSetting(order.orderNumber, order.customerName, order);
      const sender = setting.sender || senderList[0];
      if (groupedBySender[sender]) groupedBySender[sender].orders.push(order);
    });
    selectedCustom.forEach(entry => {
      // 안전망: 네이버 항목(note에 [네이버) 또는 엠파츠 거래처면 stale sender 무시하고 엠파츠로 강제
      const isEmp = entry.sender === '엠파츠' || /\[네이버/.test(entry.note || '') || isEmpartsCustomer(entry.name);
      const sender = isEmp ? '엠파츠' : (entry.sender || senderList[0]);
      if (groupedBySender[sender]) groupedBySender[sender].custom.push(entry);
    });
    return groupedBySender;
  };

  const generateShippingLabel = () => {
    const groupedBySender = generateGroupedData();
    let csv = '\uFEFF';
    senderList.forEach((sender, senderIndex) => {
      if (senderIndex > 0) csv += '\n';
      csv += '보내는곳 : ' + sender + '\n';
      csv += '번호,받는곳,배송,포장,운임,품명,연락처\n';
      const { orders: sOrders, custom } = groupedBySender[sender];
      const totalCount = sOrders.length + custom.length;
      if (totalCount === 0) {
        csv += ',,,,,, \n';
      } else {
        let index = 1;
        sOrders.forEach((order) => {
          const customer = findCustomer(order.customerName);
          const mostExpensive = getMostExpensiveItem(order.items);
          const recv = parseReceiver(order);
          const phone = recv?.tel || customer?.phone || order.customerPhone || '';
          const address = shipAddress(order, customer);
          const setting = getOrderSetting(order.orderNumber, order.customerName, order);
          csv += `${index},${shippingName(order)},${setting.paymentType},${setting.packaging},${setting.shippingCost},${mostExpensive},${phone}\n`;
          if (address) csv += `${address}\n`;
          index++;
        });
        custom.forEach((entry) => {
          csv += `${index},${entry.name},${entry.paymentType},${entry.packaging},${entry.shippingCost},${entry.product || '상품'},${entry.phone}\n`;
          if (entry.address) csv += `${entry.address}\n`;
          index++;
        });
      }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `택배송장_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const generateXlsxLabel = async () => {
    const groupedBySender = generateGroupedData();

    if (!window.ExcelJS) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }
    const ExcelJS = window.ExcelJS;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('택배 송장');
    const headerHeight = 55, colHeaderHeight = 45, dataHeight = 60, addrHeight = 50;
    worksheet.pageSetup = { paperSize: 9, orientation: 'landscape', horizontalCentered: true, verticalCentered: true, margins: { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 } };
    worksheet.columns = [{ width: 7 }, { width: 22 }, { width: 11 }, { width: 13 }, { width: 18 }, { width: 28 }, { width: 22 }];
    const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const headers = ['번호', '받는곳', '배송', '포장', '운임', '품명', '연락처'];
    let rowNum = 1;

    senderList.forEach((sender, senderIndex) => {
      if (senderIndex > 0) rowNum++;
      worksheet.mergeCells(`A${rowNum}:G${rowNum}`);
      const senderHeaderRow = worksheet.getRow(rowNum);
      senderHeaderRow.getCell(1).value = '보내는곳 : ' + sender;
      senderHeaderRow.getCell(1).font = { bold: true, size: 15, name: 'Malgun Gothic' };
      senderHeaderRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      senderHeaderRow.getCell(1).border = thinBorder;
      senderHeaderRow.height = headerHeight;
      rowNum++;

      const colHeaderRow = worksheet.getRow(rowNum);
      headers.forEach((header, idx) => {
        const cell = colHeaderRow.getCell(idx + 1);
        cell.value = header;
        cell.font = { bold: true, size: 14, name: 'Malgun Gothic' };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      });
      colHeaderRow.height = colHeaderHeight;
      rowNum++;

      const { orders: sOrders, custom } = groupedBySender[sender] || { orders: [], custom: [] };
      const totalCount = sOrders.length + custom.length;

      if (totalCount === 0) {
        const emptyRow = worksheet.getRow(rowNum);
        headers.forEach((_, idx) => {
          const cell = emptyRow.getCell(idx + 1);
          cell.value = '';
          cell.font = { size: 12, name: 'Malgun Gothic' };
          cell.border = thinBorder;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        emptyRow.height = dataHeight;
        rowNum++;
        worksheet.mergeCells(`A${rowNum}:G${rowNum}`);
        const addrRow = worksheet.getRow(rowNum);
        addrRow.getCell(1).value = '';
        addrRow.getCell(1).font = { size: 12, name: 'Malgun Gothic' };
        addrRow.getCell(1).border = thinBorder;
        addrRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        addrRow.height = addrHeight;
        rowNum++;
      } else {
        let dataIndex = 1;
        sOrders.forEach((order) => {
          const customer = order.customerName ? findCustomer(order.customerName) : null;
          const mostExpensive = getMostExpensiveItem(order.items);
          const recv = parseReceiver(order);
          const phone = recv?.tel || customer?.phone || order.customerPhone || '';
          const address = shipAddress(order, customer);
          const setting = getOrderSetting(order.orderNumber, order.customerName, order);
          const isPrepaid = setting.paymentType === '선불';
          const packagingValue = String(setting.packaging || '');
          const shippingCostValue = String(setting.shippingCost || '');
          const packagingDisplay = packagingValue.includes(',') ? packagingValue.split(',').join('\n') : packagingValue;
          const shippingDisplay = shippingCostValue.includes(',') ? shippingCostValue.split(',').join('\n') : shippingCostValue;
          const dataRow = worksheet.getRow(rowNum);
          const rowData = [dataIndex, shippingName(order) || '', setting.paymentType, packagingDisplay, shippingDisplay, mostExpensive, phone];
          dataIndex++;
          rowData.forEach((value, idx) => {
            const cell = dataRow.getCell(idx + 1);
            cell.value = value;
            cell.font = { size: 12, bold: isPrepaid, name: 'Malgun Gothic' };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;
          });
          const maxLines = Math.max((packagingValue.match(/,/g) || []).length + 1, (shippingCostValue.match(/,/g) || []).length + 1);
          dataRow.height = Math.max(dataHeight, 35 * maxLines);
          rowNum++;
          if (address) {
            worksheet.mergeCells(`A${rowNum}:G${rowNum}`);
            const addrRow = worksheet.getRow(rowNum);
            addrRow.getCell(1).value = address;
            addrRow.getCell(1).font = { size: 12, bold: isPrepaid, name: 'Malgun Gothic' };
            addrRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            addrRow.getCell(1).border = thinBorder;
            addrRow.height = addrHeight;
            rowNum++;
          }
        });

        custom.forEach((entry) => {
          const isPrepaid = entry.paymentType === '선불';
          const packagingValue = String(entry.packaging || '');
          const shippingCostValue = String(entry.shippingCost || '');
          const packagingDisplay = packagingValue.includes(',') ? packagingValue.split(',').join('\n') : packagingValue;
          const shippingDisplay = shippingCostValue.includes(',') ? shippingCostValue.split(',').join('\n') : shippingCostValue;
          const dataRow = worksheet.getRow(rowNum);
          const rowData = [dataIndex, entry.name || '', entry.paymentType, packagingDisplay, shippingDisplay, entry.product || '상품', entry.phone || ''];
          dataIndex++;
          rowData.forEach((value, idx) => {
            const cell = dataRow.getCell(idx + 1);
            cell.value = value;
            cell.font = { size: 12, bold: isPrepaid, name: 'Malgun Gothic' };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;
          });
          const maxLines = Math.max((packagingValue.match(/,/g) || []).length + 1, (shippingCostValue.match(/,/g) || []).length + 1);
          dataRow.height = Math.max(dataHeight, 35 * maxLines);
          rowNum++;
          if (entry.address) {
            worksheet.mergeCells(`A${rowNum}:G${rowNum}`);
            const addrRow = worksheet.getRow(rowNum);
            addrRow.getCell(1).value = entry.address;
            addrRow.getCell(1).font = { size: 12, bold: isPrepaid, name: 'Malgun Gothic' };
            addrRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            addrRow.getCell(1).border = thinBorder;
            addrRow.height = addrHeight;
            rowNum++;
          }
        });
      }
    });

    const lastRow = rowNum - 1;
    if (lastRow > 1) {
      worksheet.addConditionalFormatting({
        ref: `A1:G${lastRow}`,
        rules: [{ type: 'expression', formulae: ['$C1="선불"'], style: { font: { bold: true } } }]
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `택배송장_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const printShippingLabels = () => {
    const groupedBySender = generateGroupedData();

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>택배 송장</title>
  <style>
    @page { size: A4 landscape; margin: 0.5cm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; padding: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 6px 4px; text-align: center; word-wrap: break-word; vertical-align: middle; }
    th { background-color: #f0f0f0; font-weight: bold; }
    .header { font-size: 14pt; font-weight: bold; text-align: center; padding: 12px; }
    .header-green { background-color: #e8f5e9; }
    .header-plain { background-color: transparent; }
    .prepaid { font-weight: bold; }
    .col-num { width: 5%; } .col-name { width: 18%; } .col-payment { width: 8%; }
    .col-pack { width: 10%; } .col-cost { width: 12%; } .col-item { width: 30%; } .col-phone { width: 17%; }
    .address-row { text-align: center; padding: 8px; word-break: keep-all; line-height: 1.4; }
    @media print { body { padding: 0; } @page { margin: 0.5cm; } }
  </style>
</head>
<body>`;

    senderList.forEach((sender) => {
      const headerClass = sender === '무브모터스' ? 'header header-green' : 'header header-plain';
      html += `
  <table>
    <thead>
      <tr><td colspan="7" class="${headerClass}">보내는곳 : ${sender}</td></tr>
      <tr>
        <th class="col-num">번호</th><th class="col-name">받는곳</th><th class="col-payment">배송</th>
        <th class="col-pack">포장</th><th class="col-cost">운임</th><th class="col-item">품명</th><th class="col-phone">연락처</th>
      </tr>
    </thead>
    <tbody>`;

      const { orders: sOrders, custom } = groupedBySender[sender] || { orders: [], custom: [] };
      const totalCount = sOrders.length + custom.length;

      if (totalCount === 0) {
        html += `<tr><td class="col-num"></td><td class="col-name"></td><td class="col-payment"></td><td class="col-pack"></td><td class="col-cost"></td><td class="col-item"></td><td class="col-phone"></td></tr>`;
      } else {
        let dataIndex = 1;
        sOrders.forEach((order) => {
          const customer = findCustomer(order.customerName);
          const mostExpensive = getMostExpensiveItem(order.items);
          const recv = parseReceiver(order);
          const phone = recv?.tel || customer?.phone || order.customerPhone || '';
          const address = shipAddress(order, customer);
          const setting = getOrderSetting(order.orderNumber, order.customerName, order);
          const isPrepaid = setting.paymentType === '선불';
          const rowClass = isPrepaid ? 'prepaid' : '';
          const packagingDisplay = escapeHtml(String(setting.packaging || '')).replace(/,/g, '<br>');
          const shippingDisplay = escapeHtml(String(setting.shippingCost || '')).replace(/,/g, '<br>');
          html += `<tr class="${rowClass}">
            <td class="col-num">${dataIndex}</td>
            <td class="col-name">${escapeHtml(shippingName(order) || '')}</td>
            <td class="col-payment">${escapeHtml(setting.paymentType)}</td>
            <td class="col-pack">${packagingDisplay}</td>
            <td class="col-cost">${shippingDisplay}</td>
            <td class="col-item">${escapeHtml(mostExpensive)}</td>
            <td class="col-phone">${escapeHtml(phone)}</td>
          </tr>`;
          if (address) html += `<tr class="${rowClass}"><td colspan="7" class="address-row">${escapeHtml(address)}</td></tr>`;
          dataIndex++;
        });
        custom.forEach((entry) => {
          const isPrepaid = entry.paymentType === '선불';
          const rowClass = isPrepaid ? 'prepaid' : '';
          const packagingDisplay = escapeHtml(String(entry.packaging || '')).replace(/,/g, '<br>');
          const shippingDisplay = escapeHtml(String(entry.shippingCost || '')).replace(/,/g, '<br>');
          html += `<tr class="${rowClass}">
            <td class="col-num">${dataIndex}</td>
            <td class="col-name">${escapeHtml(entry.name || '')}</td>
            <td class="col-payment">${escapeHtml(entry.paymentType)}</td>
            <td class="col-pack">${packagingDisplay}</td>
            <td class="col-cost">${shippingDisplay}</td>
            <td class="col-item">${escapeHtml(entry.product || '상품')}</td>
            <td class="col-phone">${escapeHtml(entry.phone || '')}</td>
          </tr>`;
          if (entry.address) html += `<tr class="${rowClass}"><td colspan="7" class="address-row">${escapeHtml(entry.address)}</td></tr>`;
          dataIndex++;
        });
      }
      html += `</tbody></table>`;
    });

    html += `<script>window.onload = function() { window.print(); }</script></body></html>`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { if (showToast) showToast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.', 'error'); return; }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // 카톡용 발송 내역 텍스트 — 오늘 배송(업체/받는분/주소/품명/착불선불) 보기좋게 복붙용
  // 선택된 주문이 있으면 선택분만, 없으면 화면에 보이는 전체(오늘)를 발송인별로 묶어 출력
  const buildKakaoText = () => {
    const useAll = selectedOrders.length === 0;
    const pickedOrders = useAll ? filteredOrders : filteredOrders.filter(o => selectedOrders.includes(o.orderNumber));
    const pickedCustom = useAll ? customEntries : customEntries.filter(e => selectedOrders.includes(e.id));

    const grouped = {};
    senderList.forEach(s => { grouped[s] = { orders: [], custom: [] }; });
    pickedOrders.forEach(order => {
      const setting = getOrderSetting(order.orderNumber, order.customerName, order);
      const sender = setting.sender || senderList[0];
      if (grouped[sender]) grouped[sender].orders.push(order);
    });
    pickedCustom.forEach(entry => {
      const isEmp = entry.sender === '엠파츠' || /\[네이버/.test(entry.note || '') || isEmpartsCustomer(entry.name);
      const sender = isEmp ? '엠파츠' : (entry.sender || senderList[0]);
      if (grouped[sender]) grouped[sender].custom.push(entry);
    });

    // 숫자만 추출 (금액 문자열 방어)
    const money = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
    // 주문 품목 → "  품명 ×수량  N,NNN원" 한 줄씩. 금액=단가×수량 (items.price는 단가, total과 합치 검증됨)
    const orderItemLines = (items) => {
      const out = [];
      (items || []).forEach((i) => {
        const name = (i?.name || '').trim();
        if (!name) return;
        const qty = Number(i?.quantity) || 1;
        const amt = money(i?.price ?? i?.wholesale ?? i?.retail) * qty;
        const qtyStr = qty > 1 ? ` ×${qty}` : '';
        out.push(`  ${name}${qtyStr}${amt > 0 ? `  ${formatPrice(amt)}원` : ''}`);
      });
      if (out.length === 0) out.push('  상품');
      return out;
    };

    const now = new Date();
    const dLabel = `${now.getMonth() + 1}/${now.getDate()}`;
    const blocks = [];
    let grand = 0;
    let grandAmount = 0;

    senderList.forEach(sender => {
      const { orders: sOrders, custom } = grouped[sender];
      const count = sOrders.length + custom.length;
      if (count === 0) return;
      grand += count;
      const lines = [`[${sender}] ${count}건`, ''];
      let idx = 1;
      sOrders.forEach(order => {
        const customer = findCustomer(order.customerName);
        const recv = parseReceiver(order);
        const phone = recv?.tel || customer?.phone || order.customerPhone || '';
        const address = shipAddress(order, customer);
        const setting = getOrderSetting(order.orderNumber, order.customerName, order);
        grandAmount += money(order.totalAmount ?? order.total);
        lines.push(`${idx}. ${shippingName(order)}${phone ? `  ${phone}` : ''}`);
        if (address) lines.push(`  ${address}`);
        orderItemLines(order.items).forEach(l => lines.push(l));
        const foot = [setting.packaging, setting.paymentType].filter(Boolean).join(' · ');
        if (foot) lines.push(`  ${foot}`);
        lines.push('');
        idx++;
      });
      custom.forEach(entry => {
        const amt = money(entry.amount);
        grandAmount += amt;
        lines.push(`${idx}. ${entry.name || ''}${entry.phone ? `  ${entry.phone}` : ''}`);
        if (entry.address) lines.push(`  ${entry.address}`);
        // product는 자유 입력(여러 줄 가능) — 있는 그대로 줄마다 들여쓰기
        String(entry.product || '상품').split('\n').map(s => s.trim()).filter(Boolean).forEach(p => lines.push(`  ${p}`));
        if (amt > 0) lines.push(`  합계 ${formatPrice(amt)}원`);
        const foot = [entry.packaging, entry.paymentType].filter(Boolean).join(' · ');
        if (foot) lines.push(`  ${foot}`);
        lines.push('');
        idx++;
      });
      blocks.push(lines.join('\n').trimEnd());
    });

    if (grand === 0) return '';
    const header = grandAmount > 0
      ? `${dLabel} 택배 발송 · 총 ${grand}건 · ${formatPrice(grandAmount)}원`
      : `${dLabel} 택배 발송 · 총 ${grand}건`;
    return [header, '━━━━━━━━━━━━━━', ...blocks].join('\n\n');
  };

  const copyKakaoText = async () => {
    const text = buildKakaoText();
    if (!text) { if (showToast) showToast('복사할 발송 내역이 없습니다.', 'error'); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setKakaoCopied(true);
      setTimeout(() => setKakaoCopied(false), 2000);
      if (showToast) showToast('카톡용 발송 내역을 복사했습니다 📋', 'success');
    } catch (e) {
      if (showToast) showToast('복사 실패 — 아래 버튼 대신 길게 눌러 직접 복사해주세요.', 'error');
    }
  };

  const packagingOptions = ['박스1', '박스2', '박스3', '나체1', '나체2', '나체3'];

  return (
    <div className="h-full bg-[var(--background)] flex flex-col">
      {/* Page header */}
      <header className="bg-[var(--card)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="px-2 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile: menu button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
              className="md:hidden p-2 hover:bg-[var(--accent)] rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
            </button>
            {/* Desktop: back button */}
            <button onClick={onBack} className="hidden md:block p-2 hover:bg-[var(--accent)] rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Truck className="w-5 h-5" style={{ color: 'var(--warning)' }} />
            <div>
              <h1 className="text-lg font-bold">택배 송장 생성</h1>
              <p className="text-[var(--muted-foreground)] text-xs">
                전체 {safeOrders.length}건 / 필터 {filteredOrders.length}건 / 선택 {selectedOrders.length}건
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content - two panel layout on large screens */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left panel: Order selection */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 py-4">
          {/* Date filter */}
          <div className="bg-[var(--card)] rounded-xl p-3 mb-4 border border-[var(--border)]">
            <p className="text-[var(--muted-foreground)] text-xs mb-2">날짜 필터</p>
            <div className="flex flex-wrap gap-2">
              {[{ key: 'today', label: '오늘' }, { key: 'yesterday', label: '어제' }, { key: 'week', label: '최근 7일' }, { key: 'all', label: '전체' }].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setDateFilter(key); setSelectedOrders([]); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    dateFilter === key
                      ? 'text-white'
                      : 'border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'
                  }`}
                  style={dateFilter === key ? { background: 'var(--warning)', color: 'white' } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Select all + add custom */}
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={handleSelectAll}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                  (filteredOrders.length + customEntries.length) > 0 && selectedOrders.length === (filteredOrders.length + customEntries.length)
                    ? ''
                    : 'border-[var(--border)]'
                }`}
                style={(filteredOrders.length + customEntries.length) > 0 && selectedOrders.length === (filteredOrders.length + customEntries.length)
                  ? { background: 'var(--warning)', borderColor: 'var(--warning)' }
                  : {}
                }
              >
                {(filteredOrders.length + customEntries.length) > 0 && selectedOrders.length === (filteredOrders.length + customEntries.length) && (
                  <Check className="w-3 h-3 text-white" />
                )}
              </div>
              <span className="text-sm">전체 선택</span>
            </label>
            <button
              onClick={() => setShowAddCustomModal(true)}
              className="px-3 py-1.5 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors hover:opacity-90"
              style={{ background: 'var(--success)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              임의 추가
            </button>
          </div>

          {/* Order list */}
          {filteredOrders.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="해당 기간 주문 내역이 없습니다"
              description="다른 날짜 필터를 선택해보세요"
            />
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(order => {
                const customer = order.customerName ? findCustomer(order.customerName) : null;
                const hasAddress = shipAddress(order, customer);
                const setting = getOrderSetting(order.orderNumber, order.customerName, order);
                const isSelected = selectedOrders.includes(order.orderNumber);
                const hasSavedSetting = order.customerName && savedCustomerSettings[order.customerName];

                return (
                  <div
                    key={order.orderNumber}
                    className={`rounded-xl border transition-colors ${
                      isSelected ? '' : !order.__fromSavedCart ? 'bg-[var(--card)] border-[var(--border)]' : ''
                    }`}
                    style={isSelected
                      ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }
                      : order.__fromSavedCart
                        ? { background: 'color-mix(in srgb, #f59e0b 5%, var(--card))', borderColor: 'color-mix(in srgb, #f59e0b 35%, var(--border))', borderLeftWidth: '3px', borderLeftColor: '#f59e0b' }
                        : {}
                    }
                  >
                    <div className="p-3 cursor-pointer" onClick={() => toggleOrder(order.orderNumber)}>
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected ? '' : 'border-[var(--border)]'
                          }`}
                          style={isSelected ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`font-medium text-sm ${setting.paymentType === '선불' ? 'font-bold' : ''}`} style={setting.paymentType === '선불' ? { color: 'var(--warning)' } : {}}>
                              {order.customerName || '고객명 없음'}
                            </span>
                            <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={(setting.sender || senderList[0]) === '엠파츠'
                              ? { background: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)' }
                              : { background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)' }
                            }>
                              {setting.sender || senderList[0]}
                            </span>
                            {setting.paymentType === '선불' && (
                              <span className="px-2 py-0.5 text-xs rounded-full font-bold" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)' }}>선불</span>
                            )}
                            {hasAddress ? (
                              <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>주소 있음</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--destructive) 15%, transparent)', color: 'var(--destructive)' }}>주소 없음</span>
                            )}
                            {hasSavedSetting && (
                              <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}>설정저장됨</span>
                            )}
                            {order.__fromSavedCart && (
                              <span className="px-2 py-0.5 text-xs rounded-full font-bold flex items-center gap-1" style={{ background: '#f59e0b', color: 'white' }} title="저장된 장바구니에서 가져온 출고 예약 항목">
                                📦 출고예약
                              </span>
                            )}
                          </div>
                          <p className="text-[var(--muted-foreground)] text-xs break-words leading-snug">{shipAddress(order, customer) || '주소 미등록'}</p>
                          {/* 받는분(수령인)·배송메모 — 발송은 받는사람 기준 */}
                          {(() => {
                            const recv = parseReceiver(order);
                            const smemo = parseShippingMemo(order);
                            const note = getUserNote(order);
                            if (!recv && !smemo && !note) return null;
                            return (
                              <div className="mt-1 space-y-0.5">
                                {recv && (
                                  <p className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--success)' }}>
                                    🎁 받는분: {recv.name}{recv.tel ? ` · ${recv.tel}` : ''}
                                    {recv.name !== order.customerName && <span className="px-1 py-0.5 rounded text-[10px] font-bold" style={{ background: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' }}>주문자와 다름</span>}
                                  </p>
                                )}
                                {smemo && (
                                  <p className="text-xs break-words leading-snug" style={{ color: 'var(--warning)' }}>📝 배송메모: {smemo}</p>
                                )}
                                {note && (
                                  <p className="text-xs break-words leading-snug font-semibold px-1.5 py-1 rounded" style={{ color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 10%, transparent)' }}>🗒️ 주문 메모: {note}</p>
                                )}
                              </div>
                            );
                          })()}
                          {/* 주문 물품 — 제품명 칩으로 한눈에 (사장님 요청) */}
                          {order.items?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {order.items.slice(0, 6).map((it, i) => (
                                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold break-keep leading-tight"
                                  style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}
                                  title={`${it.name}${(it.quantity || 1) > 1 ? ` × ${it.quantity}개` : ''}`}>
                                  📦 {it.name}{(it.quantity || 1) > 1 ? ` ×${it.quantity}` : ''}
                                </span>
                              ))}
                              {order.items.length > 6 && (
                                <span className="inline-flex items-center px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">외 {order.items.length - 6}건</span>
                              )}
                            </div>
                          )}
                          <p className="text-[var(--muted-foreground)] text-xs mt-1">{order.items?.length || 0}종 · {formatPrice(order.totalAmount)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[var(--muted-foreground)] text-xs">{customer?.phone || order.customerPhone || '번호 없음'}</p>
                          {customer && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditCustomer(order.customerName); }}
                              className="mt-1 px-2 py-0.5 border text-xs rounded-lg transition-colors"
                              style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))', color: 'var(--primary)' }}
                            >
                              정보 수정
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded settings when selected */}
                    {isSelected && (
                      <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">보내는 곳</label>
                            <select
                              value={setting.sender || senderList[0]}
                              onChange={(e) => updateOrderSetting(order.orderNumber, 'sender', e.target.value)}
                              className="w-full px-2 py-1.5 border rounded-lg text-sm font-medium focus:outline-none text-center"
                              style={{ borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))', background: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}
                            >
                              {senderList.map(sender => <option key={sender} value={sender}>{sender}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">배송 방식</label>
                            <select
                              value={setting.paymentType}
                              onChange={(e) => updateOrderSetting(order.orderNumber, 'paymentType', e.target.value)}
                              className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]"
                            >
                              <option value="착불">착불</option>
                              <option value="선불">선불</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">포장</label>
                            <input
                              type="text"
                              list={`packaging-options-${order.orderNumber}`}
                              value={setting.packaging}
                              onChange={(e) => updateOrderSetting(order.orderNumber, 'packaging', e.target.value)}
                              onInput={(e) => updateOrderSetting(order.orderNumber, 'packaging', e.target.value)}
                              placeholder="박스1"
                              className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]"
                            />
                            <datalist id={`packaging-options-${order.orderNumber}`}>
                              {packagingOptions.map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                          </div>
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">택배비</label>
                            <input
                              type="text"
                              value={setting.shippingCost}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || /^[\d,]+$/.test(value)) {
                                  updateOrderSetting(order.orderNumber, 'shippingCost', value);
                                }
                              }}
                              placeholder="7300"
                              className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]"
                            />
                          </div>
                        </div>

                        {/* 네이버 스토어에서 전환된 주문이면 송장 → 네이버 발송 연동 패널 */}
                        {getOrderNaverPoid(order) && (
                          <NaverDispatchPanel providerOrderId={getOrderNaverPoid(order)} showToast={showToast} />
                        )}

                        {/* Save / delete customer setting */}
                        {order.customerName && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveCustomerSetting(order.customerName, setting)}
                              className="flex-1 px-2 py-1.5 border text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                              style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 30%, var(--border))', color: 'var(--success)' }}
                            >
                              {hasSavedSetting ? '설정 업데이트' : '이 설정 저장'}
                            </button>
                            {hasSavedSetting && (
                              <button
                                onClick={() => deleteCustomerSetting(order.customerName)}
                                className="px-2 py-1.5 border text-xs font-medium rounded-lg transition-colors"
                                style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))', color: 'var(--destructive)' }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Customer info edit form */}
                        {customer && editingCustomer === customer.id && (
                          <div className="mt-2 p-3 border rounded-xl" style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }}>
                            <p className="font-medium text-sm mb-2" style={{ color: 'var(--primary)' }}>{order.customerName} 정보 수정</p>
                            <div className="space-y-2">
                              <div>
                                <label className="block text-[var(--muted-foreground)] text-xs mb-1">주소</label>
                                <input
                                  type="text"
                                  value={tempAddress}
                                  onChange={(e) => setTempAddress(e.target.value)}
                                  placeholder="주소를 입력하세요"
                                  className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                                />
                              </div>
                              <div>
                                <label className="block text-[var(--muted-foreground)] text-xs mb-1">전화번호</label>
                                <input
                                  type="text"
                                  value={tempPhone}
                                  onChange={(e) => setTempPhone(e.target.value)}
                                  placeholder="전화번호를 입력하세요"
                                  className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveCustomerInfo(customer.id)}
                                  className="flex-1 px-3 py-1.5 bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium rounded-lg transition-opacity"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={cancelEditCustomer}
                                  className="flex-1 px-3 py-1.5 border border-[var(--border)] hover:bg-[var(--accent)] text-sm font-medium rounded-lg transition-colors"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom entries */}
          {customEntries.length > 0 && (
            <div className="mt-4">
              <p className="text-[var(--muted-foreground)] text-sm font-medium mb-2 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                임의 추가 ({customEntries.length}건)
              </p>
              <div className="space-y-2">
                {customEntries.map(entry => {
                  const isSelected = selectedOrders.includes(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-xl border transition-colors ${
                        isSelected ? '' : 'bg-[var(--card)] border-[var(--border)]'
                      }`}
                      style={isSelected
                        ? { background: 'color-mix(in srgb, var(--success) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))' }
                        : {}
                      }
                    >
                      <div className="p-3 cursor-pointer" onClick={() => toggleOrder(entry.id)}>
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected ? '' : 'border-[var(--border)]'
                            }`}
                            style={isSelected ? { background: 'var(--success)', borderColor: 'var(--success)' } : {}}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-medium text-sm">{entry.name}</span>
                              <span className="px-2 py-0.5 text-xs rounded-full font-medium" style={entry.sender === '엠파츠'
                                ? { background: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)' }
                                : { background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)' }
                              }>{entry.sender}</span>
                              {entry.paymentType === '선불' && (
                                <span className="px-2 py-0.5 text-xs rounded-full font-bold" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)' }}>선불</span>
                              )}
                              <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)' }}>직접 추가</span>
                            </div>
                            <p className="text-[var(--muted-foreground)] text-xs break-words leading-snug">{entry.address || '주소 미입력'}</p>
                            <p className="text-[var(--muted-foreground)] text-xs mt-0.5">{entry.product || '상품'} · {entry.packaging} · {entry.shippingCost}원</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <p className="text-[var(--muted-foreground)] text-xs">{entry.phone || '번호 없음'}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeCustomEntry(entry.id); }}
                              className="p-1.5 border rounded-lg transition-colors"
                              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 30%, var(--border))', color: 'var(--destructive)' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1">받는분</label>
                              <input type="text" value={entry.name} onChange={(e) => updateCustomEntry(entry.id, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none bg-[var(--background)]" />
                            </div>
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1">연락처</label>
                              <input type="text" value={entry.phone} onChange={(e) => updateCustomEntry(entry.id, 'phone', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none bg-[var(--background)]" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1">주소</label>
                            <input type="text" value={entry.address} onChange={(e) => updateCustomEntry(entry.id, 'address', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none bg-[var(--background)]" />
                          </div>
                          <div>
                            <label className="block text-[var(--muted-foreground)] text-xs mb-1">품명</label>
                            <input type="text" value={entry.product} onChange={(e) => updateCustomEntry(entry.id, 'product', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none bg-[var(--background)]" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border)]">
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">보내는 곳</label>
                              <select value={entry.sender} onChange={(e) => updateCustomEntry(entry.id, 'sender', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]">
                                {senderList.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">결제</label>
                              <select value={entry.paymentType} onChange={(e) => updateCustomEntry(entry.id, 'paymentType', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]">
                                <option value="착불">착불</option>
                                <option value="선불">선불</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">포장</label>
                              <input type="text" value={entry.packaging} onChange={(e) => updateCustomEntry(entry.id, 'packaging', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]" />
                            </div>
                            <div>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1 text-center">운임</label>
                              <input type="text" value={entry.shippingCost} onChange={(e) => updateCustomEntry(entry.id, 'shippingCost', e.target.value)} className="w-full px-2 py-1.5 border border-[var(--border)] rounded-lg text-sm focus:outline-none text-center bg-[var(--background)]" />
                            </div>
                          </div>
                          {/* 네이버 스토어 주문이면 송장 → 네이버 발송 연동 패널 */}
                          {getEntryNaverPoid(entry) && (
                            <NaverDispatchPanel providerOrderId={getEntryNaverPoid(entry)} showToast={showToast} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right panel (or bottom on mobile): Export actions */}
        <div className="lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[var(--card)] flex flex-col">
          <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between lg:justify-start gap-3 sm:gap-4">
            {/* Selection summary + Sender preview: 모바일 가로 2열 */}
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 sm:gap-4">
            {/* Selection summary */}
            <div className="bg-[var(--secondary)] rounded-xl p-3 sm:p-4">
              <p className="text-[var(--muted-foreground)] text-[10px] sm:text-xs mb-1 sm:mb-2">선택 현황</p>
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-[var(--muted-foreground)]">주문 선택</span>
                  <span className="font-semibold">{selectedOrders.filter(id => filteredOrders.some(o => o.orderNumber === id)).length}건</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-[var(--muted-foreground)]">임의 추가</span>
                  <span className="font-semibold">{selectedOrders.filter(id => customEntries.some(e => e.id === id)).length}건</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm font-bold border-t border-[var(--border)] pt-1 mt-1">
                  <span>합계</span>
                  <span style={{ color: 'var(--warning)' }}>{selectedOrders.length}건</span>
                </div>
              </div>
              {selectedOrders.length === 0 && (
                <p className="text-[var(--muted-foreground)] text-[10px] sm:text-xs mt-1 sm:mt-2">선택 없으면 빈 양식 출력</p>
              )}
            </div>

            {/* Sender preview */}
            <div className="bg-[var(--secondary)] rounded-xl p-3">
              <p className="text-[var(--muted-foreground)] text-[10px] sm:text-xs mb-1 sm:mb-2">보내는 곳별 현황</p>
              {senderList.map(sender => {
                const senderCount = selectedOrders.filter(id => {
                  const order = filteredOrders.find(o => o.orderNumber === id);
                  if (order) {
                    const setting = getOrderSetting(order.orderNumber, order.customerName, order);
                    return (setting.sender || senderList[0]) === sender;
                  }
                  const entry = customEntries.find(e => e.id === id);
                  if (entry) return entry.sender === sender;
                  return false;
                }).length;
                return (
                  <div key={sender} className="flex justify-between text-xs sm:text-sm py-0.5">
                    <span className="text-[var(--muted-foreground)]">{sender}</span>
                    <span className="font-medium">{senderCount}건</span>
                  </div>
                );
              })}
            </div>
            </div>

            {/* 카톡용 복사 — 모바일에서 택배사에 그대로 붙여넣기 */}
            <button
              onClick={copyKakaoText}
              className="w-full py-2.5 sm:py-3 mb-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all hover:brightness-95 active:scale-[0.98] text-xs sm:text-sm shadow-sm"
              style={{ background: kakaoCopied ? '#22c55e' : '#FEE500', color: kakaoCopied ? 'white' : '#3C1E1E' }}
              title="오늘 발송 내역(업체·주소·품명·착불선불)을 카톡에 붙여넣기 좋게 복사"
            >
              {kakaoCopied ? <Check className="w-4 h-4 flex-shrink-0" /> : <MessageCircle className="w-4 h-4 flex-shrink-0" />}
              {kakaoCopied ? '복사됨!' : (
                <>
                  <span className="hidden sm:inline">카톡용 발송내역 복사</span>
                  <span className="sm:hidden">카톡 복사</span>
                </>
              )}
            </button>

            {/* Export buttons - 모바일: 가로 한줄, 데스크톱: 세로 */}
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-2">
              <button
                onClick={generateShippingLabel}
                className="w-full py-2 sm:py-2.5 rounded-lg font-medium flex items-center justify-center gap-1 sm:gap-2 transition-colors hover:opacity-90 text-white text-xs sm:text-sm"
                style={{ background: 'var(--success)', color: 'white' }}
              >
                <Download className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">CSV 다운로드</span>
                <span className="sm:hidden">CSV</span>
              </button>
              <button
                onClick={generateXlsxLabel}
                className="w-full py-2 sm:py-2.5 rounded-lg font-medium flex items-center justify-center gap-1 sm:gap-2 transition-colors bg-[var(--primary)] hover:opacity-90 text-white text-xs sm:text-sm"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Excel 다운로드</span>
                <span className="sm:hidden">Excel</span>
              </button>
              <button
                onClick={printShippingLabels}
                className="w-full py-2 sm:py-2.5 rounded-lg font-medium flex items-center justify-center gap-1 sm:gap-2 transition-colors hover:opacity-90 text-white text-xs sm:text-sm"
                style={{ background: 'var(--warning)', color: 'white' }}
              >
                <Printer className="w-4 h-4 flex-shrink-0" />
                인쇄
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add custom entry modal */}
      {showAddCustomModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 animate-modal-backdrop modal-backdrop-fs-transition" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isAddModalFullscreen ? '0' : '1rem' }} onClick={() => setShowAddCustomModal(false)}>
          <div className="relative bg-[var(--card)] w-full h-full border border-[var(--border)] shadow-2xl animate-modal-up modal-fs-transition overflow-y-auto" style={{ maxWidth: isAddModalFullscreen ? '100vw' : '48rem', maxHeight: isAddModalFullscreen ? '100vh' : '90vh', borderRadius: isAddModalFullscreen ? '0' : '0.75rem', boxShadow: isAddModalFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)', ...(isAddModalDraggable ? addModalDragStyle : {}) }} onClick={e => e.stopPropagation()}>
            {addModalResizeHandles}
            <div
              {...addModalDragHandleProps}
              onDoubleClick={isAddModalDraggable ? toggleAddModalFullscreen : undefined}
              title={isAddModalDraggable ? '드래그 이동 · 더블클릭 = 전체화면' : undefined}
              className={`px-4 py-3 flex items-center justify-between ${isAddModalFullscreen ? '' : 'rounded-t-xl'}`}
              style={{ background: 'var(--success)', ...(addModalDragHandleProps.style || {}) }}
            >
              <h3 className="text-white font-bold flex items-center gap-2">
                <Plus className="w-5 h-5" />
                임의 항목 추가
              </h3>
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); toggleAddModalFullscreen(); }} className="p-1 hover:bg-white/20 rounded transition-colors" title={isAddModalFullscreen ? '원래 크기' : '전체화면'}>
                  {isAddModalFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
                </button>
                <button onClick={() => setShowAddCustomModal(false)} className="p-1 hover:bg-white/20 rounded transition-colors">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              {/* Name with customer search */}
              <div className="relative">
                <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">받는분 * (등록된 거래처 검색)</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={newCustomEntry.name}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, name: e.target.value }))}
                    onFocus={handleSearchFocus}
                    onKeyDown={shipCustKeyDown}
                    placeholder="받는분 이름 입력..."
                    className="w-full pl-11 pr-4 py-3 border-2 border-[var(--primary)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
                {/* Live search dropdown */}
                {filteredCustomerSearch.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {filteredCustomerSearch.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectShippingCustomer(c)}
                          className="w-full px-4 py-3 text-left transition-colors flex items-center justify-between border-b border-[var(--border)] last:border-0"
                          style={{ background: idx === shipCustHi ? 'var(--accent)' : 'transparent' }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{c.name}</span>
                            {savedCustomerSettings[c.name] && <span className="text-xs" style={{ color: 'var(--primary)' }}>설정저장됨</span>}
                          </div>
                          <span className="text-[var(--muted-foreground)]">{c.phone || ''}</span>
                        </button>
                      ))}
                    </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">연락처</label>
                  <input
                    type="text"
                    value={newCustomEntry.phone}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="010-0000-0000"
                    className="w-full px-4 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">품명</label>
                  <input
                    type="text"
                    value={newCustomEntry.product}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, product: e.target.value }))}
                    placeholder="상품명"
                    className="w-full px-4 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">주소</label>
                <input
                  type="text"
                  value={newCustomEntry.address}
                  onChange={e => setNewCustomEntry(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="배송 주소"
                  className="w-full px-4 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                />
              </div>

              <div>
                <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">금액</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newCustomEntry.amount}
                  onChange={e => setNewCustomEntry(prev => ({ ...prev, amount: e.target.value.replace(/[^0-9]/g, '') }))}
                  placeholder="0"
                  className="w-full px-4 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">보내는 곳</label>
                  <select
                    value={newCustomEntry.sender}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, sender: e.target.value }))}
                    className="w-full px-3 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  >
                    {senderList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">결제</label>
                  <select
                    value={newCustomEntry.paymentType}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, paymentType: e.target.value }))}
                    className="w-full px-3 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  >
                    <option value="착불">착불</option>
                    <option value="선불">선불</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[var(--muted-foreground)] text-sm font-medium mb-1.5">포장</label>
                  <input
                    type="text"
                    value={newCustomEntry.packaging}
                    onChange={e => setNewCustomEntry(prev => ({ ...prev, packaging: e.target.value }))}
                    placeholder="박스1"
                    className="w-full px-3 py-3 border border-[var(--border)] rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--background)]"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 pt-2 flex gap-3">
              <button
                onClick={() => setShowAddCustomModal(false)}
                className="flex-1 py-3 border border-[var(--border)] hover:bg-[var(--accent)] rounded-xl font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={addCustomEntry}
                disabled={!newCustomEntry.name}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors text-sm flex items-center justify-center gap-2 ${
                  newCustomEntry.name ? 'text-white hover:opacity-90' : 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed border border-[var(--border)]'
                }`}
                style={newCustomEntry.name ? { background: 'var(--success)', color: 'white' } : {}}
              >
                <Plus className="w-4 h-4" />
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
