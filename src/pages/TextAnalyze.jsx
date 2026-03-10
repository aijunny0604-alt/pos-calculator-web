import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, X, Settings, Search, Plus, Minus, Trash2, Edit3,
  ShoppingCart, FileText, Save, FolderOpen, RotateCcw, RefreshCw,
  AlertTriangle, Check, Zap, Package,
} from 'lucide-react';

// Utility: normalize text (remove whitespace, lowercase)
function normalizeText(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

function matchesSearchQuery(name, query) {
  if (!query.trim()) return true;
  return normalizeText(name).includes(normalizeText(query));
}

export default function TextAnalyze({
  products = [],
  onAddToCart,
  formatPrice,
  priceType = 'wholesale',
  initialText = '',
  onBack,
}) {
  const [inputText, setInputText] = useState(() => {
    const saved = localStorage.getItem('aiOrderInputText');
    return initialText || saved || '';
  });
  const [analyzedItems, setAnalyzedItems] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchingIndex, setSearchingIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [backupList, setBackupList] = useState(() => {
    try {
      const saved = localStorage.getItem('aiOrderBackups');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [aiError, setAiError] = useState('');

  const getDefaultApiKey = () => {
    const encoded = 'QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj';
    try { return atob(encoded); } catch { return ''; }
  };

  const [geminiApiKey, setGeminiApiKey] = useState(
    () => localStorage.getItem('geminiApiKey') || getDefaultApiKey()
  );
  const [tempApiKey, setTempApiKey] = useState('');
  const [useAI, setUseAI] = useState(() => {
    const saved = localStorage.getItem('useGeminiAI');
    if (saved !== null) return saved === 'true';
    return true;
  });

  // Autosave
  useEffect(() => {
    localStorage.setItem('aiOrderInputText', inputText);
  }, [inputText]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  // --- Synonym map ---
  const synonyms = {
    '스텐': '스덴', '스테인': '스덴', '스테인레스': '스덴', 'sus': '스덴',
    '밴드': '밴딩', '벤딩': '밴딩', '벤드': '밴딩',
    '플랜지': '플랜지', '후렌지': '플랜지', '후란지': '플랜지',
    '엘보우': '엘보', 'elbow': '엘보',
    '레듀서': '레듀샤', '리듀서': '레듀샤',
    '니쁠': '니플', 'nipple': '니플',
    '쏘켓': '소켓', 'socket': '소켓',
    '유니언': '유니온', 'union': '유니온',
    '붓싱': '부싱', 'bushing': '부싱',
    '커플링': '카플링', 'coupling': '카플링',
    '겐또': '게이트', 'gate': '게이트',
    '볼벨브': '볼밸브',
    '첵크': '체크', 'check': '체크',
  };

  const getChosung = (str) => {
    const cho = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i) - 44032;
      if (code >= 0 && code <= 11171) result += cho[Math.floor(code / 588)];
    }
    return result;
  };

  const levenshteinDistance = (str1, str2) => {
    const len1 = str1.length, len2 = str2.length;
    const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
      }
    }
    return dp[len1][len2];
  };

  const getSimilarity = (s1, s2) => {
    if (!s1 || !s2) return 0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(s1.toLowerCase(), s2.toLowerCase()) / maxLen;
  };

  const applySynonyms = (text) => {
    let result = text.toLowerCase();
    Object.entries(synonyms).forEach(([key, value]) => {
      result = result.replace(new RegExp(key, 'gi'), value);
    });
    return result;
  };

  const extractNumberUnits = (text) => {
    const patterns = [/(\d+(?:\.\d+)?)\s*(파이|pai|phi|mm|cm|m|인치|inch|")/gi, /(\d+(?:\.\d+)?)\s*(A|B|호)/gi];
    const units = [];
    patterns.forEach(p => { let m; while ((m = p.exec(text)) !== null) units.push({ number: parseFloat(m[1]), unit: m[2].toLowerCase() }); });
    return units;
  };

  const calculateMatchScore = (productName, searchText) => {
    let score = 0;
    const normalizedProduct = normalizeText(productName);
    const normalizedSearch = normalizeText(searchText);
    const synonymProduct = applySynonyms(productName);
    const synonymSearch = applySynonyms(searchText);

    if (normalizedProduct === normalizedSearch) return 1000;
    if (normalizedProduct.includes(normalizedSearch)) score += 100 + normalizedSearch.length * 5;
    if (applySynonyms(normalizedProduct).includes(applySynonyms(normalizedSearch))) score += 80 + normalizedSearch.length * 4;

    const searchUnits = extractNumberUnits(searchText);
    const productUnits = extractNumberUnits(productName);
    searchUnits.forEach(su => productUnits.forEach(pu => {
      const diff = Math.abs(su.number - pu.number);
      if (diff === 0) { score += 50; if (su.unit === pu.unit || (su.unit === '파이' && pu.unit === 'mm')) score += 30; }
      else if (diff <= 1) { score += 35; if (su.unit === pu.unit) score += 20; }
    }));

    const searchParts = normalizedSearch.match(/[가-힣a-z]+|\d+/gi) || [];
    if (searchParts.length > 0) {
      let lastIndex = -1, sequentialMatches = 0;
      searchParts.forEach(part => {
        const foundIndex = normalizedProduct.indexOf(part, lastIndex + 1);
        if (foundIndex > lastIndex) { sequentialMatches++; lastIndex = foundIndex + part.length - 1; score += part.length * 3; }
      });
      if (sequentialMatches === searchParts.length) score += 40;
    }

    const searchWords = searchText.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 0);
    const productWords = productName.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 0);
    let matchedWords = 0;
    searchWords.forEach(word => {
      const normalizedWord = normalizeText(word);
      const synonymWord = applySynonyms(word);
      if (normalizedProduct.includes(normalizedWord) || synonymProduct.includes(synonymWord)) {
        matchedWords++; score += word.length * 2;
      } else if (word.length >= 2) {
        let bestSim = 0;
        productWords.forEach(pw => { if (pw.length >= 2) { const sim = getSimilarity(word, pw); if (sim > bestSim) bestSim = sim; } });
        if (bestSim >= 0.7) { matchedWords++; score += Math.floor(word.length * bestSim * 1.5); }
      }
    });
    if (matchedWords === searchWords.length && searchWords.length > 1) score += 30;

    const searchChosung = getChosung(searchText);
    const productChosung = getChosung(productName);
    if (searchChosung.length >= 2 && productChosung.includes(searchChosung)) score += 20;

    if (score > 0) {
      const matchRatio = normalizedSearch.length / normalizedProduct.length;
      if (matchRatio > 0.5) score += Math.floor(matchRatio * 20);
    }

    const overallSim = getSimilarity(normalizedSearch, normalizedProduct);
    if (overallSim >= 0.6) score += Math.floor(overallSim * 30);

    return score;
  };

  // --- Gemini AI ---
  const analyzeWithGemini = async (text) => {
    if (!geminiApiKey) throw new Error('API 키가 설정되지 않았습니다.');
    const grouped = {};
    products.forEach(p => {
      const cat = p.category || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p.name);
    });
    const productList = Object.entries(grouped).map(([cat, names]) => `[${cat}] ${names.join(', ')}`).join('\n');

    const prompt = `당신은 자동차 배기 부품 전문 주문서 분석 AI입니다.

제품 목록 (카테고리별):
${productList}

주문 텍스트:
${text}

핵심 규칙:
1. matchedProduct는 반드시 위 제품 목록에 있는 정확한 이름을 사용하세요.
2. 각 줄에서 제품명과 수량을 추출하세요.
3. 오타, 줄임말, 띄어쓰기 오류를 자동 보정하세요.
4. "하나", "두개" 등 한글 숫자도 인식하세요.
5. 매칭 불가 시 matchedProduct를 null로 설정하세요.
6. JSON 배열만 반환하세요.

응답 형식:
[{"originalText":"원본","matchedProduct":"정확한 제품명 또는 null","quantity":숫자}]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } }),
      }
    );

    if (!response.ok) {
      let errorMessage = 'API 호출 실패';
      try { const err = await response.json(); errorMessage = err.error?.message || errorMessage; } catch { errorMessage = `API 호출 실패 (HTTP ${response.status})`; }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let jsonStr = aiText;
    const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) || aiText.match(/\[[\s\S]*?\]/);
    if (jsonMatch) jsonStr = jsonMatch[1] || jsonMatch[0];
    jsonStr = jsonStr.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}').replace(/[\x00-\x1F]/g, ' ').trim();
    try { return JSON.parse(jsonStr); } catch {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) { try { return JSON.parse(arrayMatch[0].replace(/,\s*]/g, ']')); } catch { /* ignore */ } }
      throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    }
  };

  const cleanSearchText = (text) => {
    if (!text) return '';
    return text.replace(/\d+\s*(개|세트|set|ea|pcs|본|장|박스|box)\s*$/i, '').replace(/[x×*]\s*\d+\s*$/i, '').replace(/[,.\-_\/\\()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const matchWithTolerance = (searchName, productName) => {
    if (!searchName || !productName) return false;
    const cleanSearch = cleanSearchText(searchName);
    const cleanProduct = productName.trim();
    if (cleanProduct === cleanSearch || cleanProduct.toLowerCase() === cleanSearch.toLowerCase() || cleanProduct.includes(cleanSearch) || cleanSearch.includes(cleanProduct)) return true;
    const searchNums = cleanSearch.match(/\d+/g) || [];
    const productNums = cleanProduct.match(/\d+/g) || [];
    if (searchNums.length === 0 && productNums.length === 0) {
      const st = cleanSearch.replace(/\s+/g, '').toLowerCase();
      const pt = cleanProduct.replace(/\s+/g, '').toLowerCase();
      return st === pt || st.includes(pt) || pt.includes(st);
    }
    const searchTextOnly = cleanSearch.replace(/\d+/g, '').replace(/\s+/g, '').toLowerCase();
    const productTextOnly = cleanProduct.replace(/\d+/g, '').replace(/\s+/g, '').toLowerCase();
    const textMatch = searchTextOnly === productTextOnly || searchTextOnly.includes(productTextOnly) || productTextOnly.includes(searchTextOnly);
    if (!textMatch) return false;
    const minLen = Math.min(searchNums.length, productNums.length);
    if (minLen === 0) return textMatch;
    for (let i = 0; i < minLen; i++) {
      if (Math.abs(parseInt(searchNums[i]) - parseInt(productNums[i])) > 1) return false;
    }
    return true;
  };

  const analyzeText = async () => {
    if (!inputText.trim()) return;
    setIsAnalyzing(true);
    setSearchingIndex(null);
    setAiError('');

    if (useAI && geminiApiKey) {
      try {
        const aiResults = await analyzeWithGemini(inputText);
        const results = aiResults.map((item) => {
          let matchedProduct = null;
          const searchTerms = [item.matchedProduct, cleanSearchText(item.originalText), item.originalText].filter(Boolean);
          for (const searchTerm of searchTerms) {
            if (matchedProduct) break;
            matchedProduct = products.find(p => p.name === searchTerm);
            if (!matchedProduct) matchedProduct = products.find(p => p.name.toLowerCase() === searchTerm.toLowerCase());
            if (!matchedProduct) matchedProduct = products.find(p => {
              const included = p.name.includes(searchTerm) || searchTerm.includes(p.name);
              if (!included) return false;
              const sNums = searchTerm.match(/\d+/g) || [];
              const pNums = p.name.match(/\d+/g) || [];
              if (sNums.length === 0 || pNums.length === 0) return included;
              return sNums.some(sn => pNums.some(pn => Math.abs(parseInt(sn) - parseInt(pn)) <= 1));
            });
            if (!matchedProduct) matchedProduct = products.find(p => matchWithTolerance(searchTerm, p.name));
          }
          return { originalText: item.originalText, searchText: item.originalText, quantity: item.quantity || 1, matchedProduct, score: matchedProduct ? 100 : 0, selected: !!matchedProduct, aiMatched: true };
        });
        setAnalyzedItems(results);
        setIsAnalyzing(false);
        return;
      } catch (error) {
        setAiError(`AI 분석 실패: ${error.message}. 기본 분석으로 전환합니다.`);
      }
    }

    // Fallback: pattern matching
    const lines = inputText.split('\n').filter(line => line.trim());
    const results = [];
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;
      const qtyPatterns = [/(\d+)\s*개/, /(\d+)\s*세트/, /(\d+)\s*set/i, /(\d+)\s*ea/i, /(\d+)\s*pcs/i, /(\d+)\s*본/, /(\d+)\s*장/, /(\d+)\s*박스/, /(\d+)\s*box/i, /[x×*]\s*(\d+)/i, /(\d+)\s*$/];
      let quantity = 1;
      let searchText = cleanLine;
      for (const pattern of qtyPatterns) {
        const match = cleanLine.match(pattern);
        if (match) {
          const qty = parseInt(match[1]);
          if (qty > 0 && qty <= 9999 && !/파이|mm|cm|m|인치|inch|A|B/i.test(match[0])) {
            quantity = qty;
            searchText = cleanLine.replace(pattern, '').trim();
            break;
          }
        }
      }
      searchText = searchText.replace(/[,.\-_\/\\()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!searchText) return;

      let bestMatch = null, bestScore = 0;
      products.forEach(product => {
        const score = calculateMatchScore(product.name, searchText);
        if (score > bestScore) { bestScore = score; bestMatch = product; }
      });
      results.push({ originalText: cleanLine, searchText, quantity, matchedProduct: bestScore >= 15 ? bestMatch : null, score: bestScore, selected: bestScore >= 15 });
    });

    setAnalyzedItems(results);
    setIsAnalyzing(false);
  };

  const toggleSelect = (index) => {
    setAnalyzedItems(prev => prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item));
  };

  const updateQuantity = (index, qty) => {
    if (qty < 1) return;
    setAnalyzedItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item));
  };

  const removeItem = (index) => {
    setAnalyzedItems(prev => prev.filter((_, i) => i !== index));
    if (searchingIndex === index) { setSearchingIndex(null); setSearchQuery(''); }
  };

  const selectProduct = (index, product) => {
    setAnalyzedItems(prev => prev.map((item, i) => i === index ? { ...item, matchedProduct: product, selected: true, score: 100 } : item));
    setSearchingIndex(null);
    setSearchQuery('');
  };

  const getSearchResults = () => {
    if (!searchQuery.trim()) return [];
    return products.filter(p => matchesSearchQuery(p.name, searchQuery)).slice(0, 8);
  };

  const addSelectedToCart = () => {
    const selectedItems = analyzedItems.filter(item => item.selected && item.matchedProduct);
    selectedItems.forEach(item => onAddToCart(item.matchedProduct, item.quantity));
    onBack();
  };

  const saveBackup = () => {
    if (!inputText.trim()) { alert('저장할 내용이 없습니다.'); return; }
    const newBackup = { id: Date.now(), text: inputText, date: new Date().toLocaleString('ko-KR'), preview: inputText.slice(0, 50) + (inputText.length > 50 ? '...' : '') };
    const newList = [newBackup, ...backupList].slice(0, 20);
    setBackupList(newList);
    localStorage.setItem('aiOrderBackups', JSON.stringify(newList));
    alert('백업 저장 완료!');
  };

  const loadBackup = (backup) => { setInputText(backup.text); setShowBackupModal(false); };
  const deleteBackup = (id) => {
    const newList = backupList.filter(b => b.id !== id);
    setBackupList(newList);
    localStorage.setItem('aiOrderBackups', JSON.stringify(newList));
  };

  const addProductDirect = (product) => {
    const newItem = { originalText: `${product.name} ${addQuantity}개 (직접추가)`, matchedProduct: product, quantity: addQuantity, selected: true };
    setAnalyzedItems(prev => [...prev, newItem]);
    setProductSearchQuery('');
    setAddQuantity(1);
    setShowProductSearch(false);
  };

  const productAddResults = productSearchQuery.trim()
    ? products.filter(p => normalizeText(p.name).includes(normalizeText(productSearchQuery)) || p.name.toLowerCase().includes(productSearchQuery.toLowerCase())).slice(0, 10)
    : [];

  const selectedCount = analyzedItems.filter(item => item.selected && item.matchedProduct).length;
  const searchResults = getSearchResults();

  const isAiMode = useAI && geminiApiKey;

  const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors';
  const inputStyle = { backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  return (
    <div className="flex flex-col h-full">
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)', backgroundColor: isAiMode ? 'var(--success)' : 'var(--primary)' }}
        >
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 -ml-1 rounded-lg hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
            <Sparkles className="w-5 h-5 text-white" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">AI 주문 인식</h1>
                <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] rounded-full font-medium">
                  {isAiMode ? 'Gemini AI' : '패턴 매칭'}
                </span>
              </div>
              <p className="text-white/80 text-xs hidden sm:block">
                {isAiMode ? 'Google Gemini AI로 자연어 분석' : '메모를 붙여넣으면 자동으로 제품을 찾아드려요'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <span className="px-3 py-1 bg-white/20 text-white text-sm font-medium rounded-lg">
                {selectedCount}개 선택
              </span>
            )}
            <button
              onClick={() => { setTempApiKey(geminiApiKey); setShowApiSettings(true); }}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="AI 설정"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-4 pt-4" style={{ backgroundColor: 'var(--card)' }}>
          <div className="mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <label className="text-sm flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <FileText className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                메모 입력
                <span className="text-xs" style={{ color: 'var(--success)' }}>(자동저장)</span>
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => { if (inputText.trim() && confirm('메모 내용을 초기화할까요?')) { setInputText(''); localStorage.removeItem('aiOrderInputText'); } }}
                  className="px-2 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-colors text-white"
                  style={{ backgroundColor: 'var(--destructive)' }}
                >
                  <RotateCcw className="w-3 h-3" />초기화
                </button>
                <button
                  onClick={saveBackup}
                  className="px-2 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-colors text-white"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  <Save className="w-3 h-3" />백업
                </button>
                <button
                  onClick={() => setShowBackupModal(true)}
                  className="px-2 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-colors"
                  style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
                >
                  <FolderOpen className="w-3 h-3" />
                  불러오기{backupList.length > 0 && ` (${backupList.length})`}
                </button>
              </div>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`예시:\n카본 93 듀얼 1세트\n54파이 밴딩 45 6개\n2m 환봉 1개 12파이`}
              rows={5}
              className="w-full px-4 py-3 rounded-xl border text-sm resize-none font-mono focus:outline-none focus:ring-2"
              style={{ ...inputStyle, borderColor: 'var(--border)' }}
            />
          </div>

          {aiError && (
            <div className="mb-3 p-3 rounded-xl border flex items-center gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'var(--warning)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
              <p className="text-sm" style={{ color: 'var(--warning)' }}>{aiError}</p>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <button
              onClick={analyzeText}
              disabled={!inputText.trim() || isAnalyzing}
              className="flex-1 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: isAiMode ? 'var(--success)' : 'var(--primary)' }}
            >
              {isAnalyzing
                ? <><RefreshCw className="w-4 h-4 animate-spin" />{isAiMode ? 'AI 분석 중...' : '분석 중...'}</>
                : <><Sparkles className="w-4 h-4" />{isAiMode ? 'AI 분석' : '텍스트 분석'}</>
              }
            </button>
            <button
              onClick={() => setShowProductSearch(!showProductSearch)}
              className="px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all"
              style={{
                backgroundColor: showProductSearch ? 'var(--success)' : 'var(--secondary)',
                color: showProductSearch ? 'white' : 'var(--foreground)',
              }}
            >
              <Plus className="w-4 h-4" />
              제품추가
            </button>
          </div>

          {/* Direct product search */}
          {showProductSearch && (
            <div className="mb-3 p-3 rounded-xl border" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}>
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                  <input
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    placeholder="제품명 검색..."
                    className={`${inputClass} pl-9`}
                    style={inputStyle}
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-1 rounded-lg px-2" style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                  <button onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))} className="p-1 rounded hover:bg-[var(--secondary)]">
                    <Minus className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                  <span className="text-sm w-8 text-center" style={{ color: 'var(--foreground)' }}>{addQuantity}</span>
                  <button onClick={() => setAddQuantity(addQuantity + 1)} className="p-1 rounded hover:bg-[var(--secondary)]">
                    <Plus className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                  </button>
                </div>
              </div>
              {productAddResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {productAddResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addProductDirect(product)}
                      className="w-full p-2 rounded-lg text-left flex justify-between items-center transition-colors hover:bg-[var(--secondary)]"
                      style={{ backgroundColor: 'var(--background)' }}
                    >
                      <span className="text-sm truncate" style={{ color: 'var(--foreground)' }}>{product.name}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                        {formatPrice(priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {productSearchQuery && productAddResults.length === 0 && (
                <p className="text-sm text-center py-2" style={{ color: 'var(--muted-foreground)' }}>검색 결과 없음</p>
              )}
            </div>
          )}
        </div>

        {/* Results scroll area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {analyzedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pt-2">
                <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                  <Package className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  분석 결과 ({analyzedItems.length}줄)
                </h3>
              </div>

              {analyzedItems.map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: item.matchedProduct
                      ? item.selected ? 'var(--primary)' : 'var(--border)'
                      : 'var(--destructive)',
                    backgroundColor: item.matchedProduct
                      ? item.selected ? 'rgba(37,99,235,0.05)' : 'var(--card)'
                      : 'rgba(239,68,68,0.05)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    <button
                      onClick={() => item.matchedProduct && toggleSelect(index)}
                      disabled={!item.matchedProduct}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        borderColor: !item.matchedProduct ? 'var(--border)' : item.selected ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: item.selected && item.matchedProduct ? 'var(--primary)' : 'transparent',
                      }}
                    >
                      {item.selected && item.matchedProduct && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs mb-1.5 truncate italic" style={{ color: 'var(--muted-foreground)' }}>
                        "{item.originalText}"
                      </p>

                      {item.matchedProduct ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate flex-1" style={{ color: 'var(--foreground)' }}>
                              {item.matchedProduct.name}
                            </p>
                            <button
                              onClick={() => { setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                              className="px-2 py-1 text-xs rounded-lg flex-shrink-0 flex items-center gap-1 transition-all"
                              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
                            >
                              <Edit3 className="w-3 h-3" />변경
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-base font-bold" style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}>
                              {formatPrice(priceType === 'wholesale' ? item.matchedProduct.wholesale : (item.matchedProduct.retail || item.matchedProduct.wholesale))}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center rounded-lg p-0.5 border" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
                                <button onClick={() => updateQuantity(index, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--muted)]">
                                  <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                                  className="w-8 h-6 text-center text-xs font-bold bg-transparent border-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  style={{ color: 'var(--foreground)' }}
                                />
                                <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--muted)]">
                                  <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                                </button>
                              </div>
                              <button
                                onClick={() => removeItem(index)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--destructive)' }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--destructive)' }}>
                              <X className="w-4 h-4" />매칭 실패
                            </span>
                            <button
                              onClick={() => { setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                              className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 font-medium text-white transition-all"
                              style={{ backgroundColor: 'var(--primary)' }}
                            >
                              <Search className="w-3 h-3" />검색
                            </button>
                          </div>
                          <button
                            onClick={() => removeItem(index)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--destructive)' }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Product search dropdown */}
                      {searchingIndex === index && (
                        <div className="mt-3 p-3 rounded-xl border-2" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--primary)' }}>
                          <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--primary)' }} />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="제품명 검색..."
                              autoFocus
                              className={`${inputClass} pl-9`}
                              style={inputStyle}
                            />
                          </div>
                          {searchResults.length > 0 ? (
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {searchResults.map(product => (
                                <button
                                  key={product.id}
                                  onClick={() => selectProduct(index, product)}
                                  className="w-full p-2.5 text-left rounded-xl transition-all border border-transparent hover:border-[var(--primary)] hover:bg-[var(--background)]"
                                >
                                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{product.name}</p>
                                  <p className="text-xs mt-0.5 font-medium" style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}>
                                    {formatPrice(priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale))}
                                  </p>
                                </button>
                              ))}
                            </div>
                          ) : searchQuery.trim() ? (
                            <p className="text-center py-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>검색 결과 없음</p>
                          ) : (
                            <p className="text-center py-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>검색어를 입력하세요</p>
                          )}
                          <button
                            onClick={() => { setSearchingIndex(null); setSearchQuery(''); }}
                            className="w-full mt-2 py-2 text-sm rounded-xl transition-all"
                            style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
                          >
                            닫기
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        {analyzedItems.length > 0 && (
          <div className="border-t p-4 flex-shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
            <button
              onClick={addSelectedToCart}
              disabled={selectedCount === 0}
              className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: selectedCount === 0 ? 'var(--muted)' : 'var(--success)' }}
            >
              <ShoppingCart className="w-5 h-5" />
              {selectedCount}개 제품 장바구니에 담기
            </button>
          </div>
        )}

      {/* AI Settings Modal */}
      {showApiSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setShowApiSettings(false)}>
          <div className="rounded-2xl w-full max-w-md overflow-hidden border shadow-2xl animate-modal-up" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--success)' }}>
              <h3 className="text-white font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5" />분석 모드 설정
              </h3>
              <button onClick={() => setShowApiSettings(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { value: true, icon: <Sparkles className="w-5 h-5 text-white" />, label: 'Gemini AI 분석', desc: '오타/줄임말 자동 인식, 자연어 이해', activeColor: 'var(--success)' },
                { value: false, icon: <Zap className="w-5 h-5 text-white" />, label: '패턴 분석', desc: '기본 텍스트 매칭, 오프라인 사용 가능', activeColor: 'var(--primary)' },
              ].map(({ value, icon, label, desc, activeColor }) => {
                const isActive = useAI === value;
                return (
                  <button
                    key={String(value)}
                    onClick={() => { const v = value; setUseAI(v); localStorage.setItem('useGeminiAI', String(v)); setShowApiSettings(false); }}
                    className="w-full p-4 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: isActive ? activeColor : 'var(--border)', backgroundColor: isActive ? `${activeColor}15` : 'var(--secondary)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isActive ? activeColor : 'var(--muted)' }}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm" style={{ color: isActive ? activeColor : 'var(--foreground)' }}>{label}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
                      </div>
                      {isActive && <Check className="w-5 h-5" style={{ color: activeColor }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Backup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col border shadow-2xl animate-modal-up" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--primary)' }} />백업 목록
              </h3>
              <button onClick={() => setShowBackupModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--secondary)] transition-colors">
                <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {backupList.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--muted-foreground)' }}>저장된 백업이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {backupList.map((backup) => (
                    <div key={backup.id} className="p-3 rounded-xl border hover:border-[var(--primary)] transition-colors" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{backup.date}</span>
                        <button onClick={() => deleteBackup(backup.id)} className="p-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)]" style={{ color: 'var(--destructive)' }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm mb-2 font-mono truncate" style={{ color: 'var(--foreground)' }}>{backup.preview}</p>
                      <button onClick={() => loadBackup(backup)} className="w-full py-2 rounded-lg text-sm text-white transition-colors" style={{ backgroundColor: 'var(--primary)' }}>
                        불러오기
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
