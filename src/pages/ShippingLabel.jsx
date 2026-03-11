import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Menu, Truck, X, Plus, Search, Trash2, Download, FileText,
  Printer, Check, Maximize2, Minimize2
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { formatPrice, escapeHtml, handleSearchFocus } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import useKeyboardNav from '@/hooks/useKeyboardNav';
import useModalFullscreen from '@/hooks/useModalFullscreen';

export default function ShippingLabel({ orders = [], customers = [], onBack, refreshCustomers, showToast }) {
  const [selectedOrders, setSelectedOrders] = useState([]);
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
  const [newCustomEntry, setNewCustomEntry] = useState({
    name: '',
    phone: '',
    address: '',
    product: '',
    amount: '',
    packaging: '박스1',
    paymentType: '착불',
    sender: '무브모터스'
  });

  useEffect(() => {
    localStorage.setItem('shippingCustomEntries', JSON.stringify(customEntries));
  }, [customEntries]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

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

  const { isFullscreen: isAddModalFullscreen, toggleFullscreen: toggleAddModalFullscreen } = useModalFullscreen();

  // -- Filtering --

  const safeOrders = orders || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const filteredOrders = safeOrders.filter(order => {
    if (!order.createdAt) return false;
    const orderDate = new Date(order.createdAt);
    orderDate.setHours(0, 0, 0, 0);
    if (dateFilter === 'today') return orderDate.getTime() === today.getTime();
    if (dateFilter === 'yesterday') return orderDate.getTime() === yesterday.getTime();
    if (dateFilter === 'week') return orderDate >= weekAgo;
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

  const getOrderSetting = (orderNumber, customerName = null) => {
    if (orderSettings[orderNumber]) return orderSettings[orderNumber];
    if (customerName && savedCustomerSettings[customerName]) return savedCustomerSettings[customerName];
    return { paymentType: '착불', packaging: '박스1', shippingCost: '7300', sender: senderList[0] };
  };

  const getMostExpensiveItem = (items) => {
    if (!items || items.length === 0) return '상품';
    return items.reduce((max, item) => item.price > max.price ? item : max, items[0]).name;
  };

  const updateOrderSetting = (orderNumber, field, value) => {
    setOrderSettings(prev => {
      const current = prev[orderNumber] || { paymentType: '착불', packaging: '박스1', shippingCost: '7300', sender: senderList[0] };
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
    setNewCustomEntry({ name: '', phone: '', address: '', product: '', amount: '', packaging: '박스1', paymentType: '착불', sender: '무브모터스' });
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
      const setting = getOrderSetting(order.orderNumber, order.customerName);
      const sender = setting.sender || senderList[0];
      if (groupedBySender[sender]) groupedBySender[sender].orders.push(order);
    });
    selectedCustom.forEach(entry => {
      const sender = entry.sender || senderList[0];
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
          const phone = customer?.phone || order.customerPhone || '';
          const address = customer?.address || '';
          const setting = getOrderSetting(order.orderNumber, order.customerName);
          csv += `${index},${order.customerName},${setting.paymentType},${setting.packaging},${setting.shippingCost},${mostExpensive},${phone}\n`;
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
    worksheet.pageSetup = { paperSize: 9, orientation: 'landscape', horizontalCentered: true, verticalCentered: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
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
          const phone = customer?.phone || order.customerPhone || '';
          const address = customer?.address || '';
          const setting = getOrderSetting(order.orderNumber, order.customerName);
          const isPrepaid = setting.paymentType === '선불';
          const packagingValue = String(setting.packaging || '');
          const shippingCostValue = String(setting.shippingCost || '');
          const packagingDisplay = packagingValue.includes(',') ? packagingValue.split(',').join('\n') : packagingValue;
          const shippingDisplay = shippingCostValue.includes(',') ? shippingCostValue.split(',').join('\n') : shippingCostValue;
          const dataRow = worksheet.getRow(rowNum);
          const rowData = [dataIndex, order.customerName || '', setting.paymentType, packagingDisplay, shippingDisplay, mostExpensive, phone];
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
          const phone = customer?.phone || order.customerPhone || '';
          const address = customer?.address || '';
          const setting = getOrderSetting(order.orderNumber, order.customerName);
          const isPrepaid = setting.paymentType === '선불';
          const rowClass = isPrepaid ? 'prepaid' : '';
          const packagingDisplay = escapeHtml(String(setting.packaging || '')).replace(/,/g, '<br>');
          const shippingDisplay = escapeHtml(String(setting.shippingCost || '')).replace(/,/g, '<br>');
          html += `<tr class="${rowClass}">
            <td class="col-num">${dataIndex}</td>
            <td class="col-name">${escapeHtml(order.customerName || '')}</td>
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
    printWindow.document.write(html);
    printWindow.document.close();
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
              onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
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
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4">
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
                const hasAddress = customer?.address;
                const setting = getOrderSetting(order.orderNumber, order.customerName);
                const isSelected = selectedOrders.includes(order.orderNumber);
                const hasSavedSetting = order.customerName && savedCustomerSettings[order.customerName];

                return (
                  <div
                    key={order.orderNumber}
                    className={`rounded-xl border transition-colors ${
                      isSelected ? '' : 'bg-[var(--card)] border-[var(--border)]'
                    }`}
                    style={isSelected
                      ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }
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
                          </div>
                          <p className="text-[var(--muted-foreground)] text-xs truncate">{customer?.address || '주소 미등록'}</p>
                          <p className="text-[var(--muted-foreground)] text-xs mt-0.5">{order.items?.length || 0}종 · {formatPrice(order.totalAmount)}</p>
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
                            <p className="text-[var(--muted-foreground)] text-xs truncate">{entry.address || '주소 미입력'}</p>
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
          <div className="p-4 flex-1 flex flex-col justify-between lg:justify-start gap-4">
            {/* Selection summary */}
            <div className="bg-[var(--secondary)] rounded-xl p-4">
              <p className="text-[var(--muted-foreground)] text-xs mb-2">선택 현황</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">주문 선택</span>
                  <span className="font-semibold">{selectedOrders.filter(id => filteredOrders.some(o => o.orderNumber === id)).length}건</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">임의 추가</span>
                  <span className="font-semibold">{selectedOrders.filter(id => customEntries.some(e => e.id === id)).length}건</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-[var(--border)] pt-1 mt-1">
                  <span>합계</span>
                  <span style={{ color: 'var(--warning)' }}>{selectedOrders.length}건</span>
                </div>
              </div>
              {selectedOrders.length === 0 && (
                <p className="text-[var(--muted-foreground)] text-xs mt-2">주문을 선택하지 않으면 빈 양식이 출력됩니다</p>
              )}
            </div>

            {/* Sender preview */}
            <div className="bg-[var(--secondary)] rounded-xl p-3">
              <p className="text-[var(--muted-foreground)] text-xs mb-2">보내는 곳별 현황</p>
              {senderList.map(sender => {
                const senderCount = selectedOrders.filter(id => {
                  const order = filteredOrders.find(o => o.orderNumber === id);
                  if (order) {
                    const setting = getOrderSetting(order.orderNumber, order.customerName);
                    return (setting.sender || senderList[0]) === sender;
                  }
                  const entry = customEntries.find(e => e.id === id);
                  if (entry) return entry.sender === sender;
                  return false;
                }).length;
                return (
                  <div key={sender} className="flex justify-between text-sm py-0.5">
                    <span className="text-[var(--muted-foreground)]">{sender}</span>
                    <span className="font-medium">{senderCount}건</span>
                  </div>
                );
              })}
            </div>

            {/* Export buttons */}
            <div className="space-y-2">
              <button
                onClick={generateShippingLabel}
                className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors hover:opacity-90 text-white"
                style={{ background: 'var(--success)', color: 'white' }}
              >
                <Download className="w-4 h-4" />
                CSV 다운로드
              </button>
              <button
                onClick={generateXlsxLabel}
                className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors bg-[var(--primary)] hover:opacity-90 text-white"
              >
                <FileText className="w-4 h-4" />
                Excel 다운로드
              </button>
              <button
                onClick={printShippingLabels}
                className="w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors hover:opacity-90 text-white"
                style={{ background: 'var(--warning)', color: 'white' }}
              >
                <Printer className="w-4 h-4" />
                인쇄
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add custom entry modal */}
      {showAddCustomModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 animate-modal-backdrop modal-backdrop-fs-transition" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: isAddModalFullscreen ? '0' : '1rem' }} onClick={() => setShowAddCustomModal(false)}>
          <div className="bg-[var(--card)] w-full h-full border border-[var(--border)] shadow-2xl animate-modal-up modal-fs-transition overflow-y-auto" style={{ maxWidth: isAddModalFullscreen ? '100vw' : '48rem', maxHeight: isAddModalFullscreen ? '100vh' : '90vh', borderRadius: isAddModalFullscreen ? '0' : '0.75rem', boxShadow: isAddModalFullscreen ? '0 0 0 1px var(--border)' : '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div className={`px-4 py-3 flex items-center justify-between ${isAddModalFullscreen ? '' : 'rounded-t-xl'}`} style={{ background: 'var(--success)' }}>
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
