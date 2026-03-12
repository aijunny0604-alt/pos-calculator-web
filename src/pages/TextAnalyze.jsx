import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, X, Settings, Search, Plus, Minus, Trash2, Edit3,
  ShoppingCart, FileText, Save, FolderOpen, RotateCcw, RefreshCw,
  AlertTriangle, Check, Zap, Package, ArrowLeft, ChevronDown, ChevronUp,
  Menu,
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
    // Build enriched product list with category and price
    const grouped = {};
    products.forEach(p => {
      const cat = p.category || '기타';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`${p.name} (${p.wholesale?.toLocaleString() || '?'}원)`);
    });
    const productList = Object.entries(grouped).map(([cat, names]) => `[${cat}]\n${names.join('\n')}`).join('\n\n');

    const prompt = `당신은 자동차 튜닝/배기 부품 전문 주문서 분석 AI입니다. 정확도가 최우선입니다.

## 1. 차종 약어 사전 (최우선 적용!)
| 입력 | 정식명 | 참고 |
|------|--------|------|
| 벨N, 벨로N, 벨로스타N, 벨n | 벨로스터N | 현대 벨로스터 N |
| 아N, 아반떼n, 아반n | 아반떼N | 현대 아반떼 N |
| 코나N, 코나n | 코나N | 현대 코나 N |
| 스팅어 | 스팅어 | 기아 스팅어, G70 동일 플랫폼 |
| 젠쿱 | 젠쿱 | 제네시스 쿠페 |

**규칙**: 차종+부품 조합이 제품 목록에 있으면 반드시 해당 차종 제품으로 매칭. "벨N 싱글" → 벨로스터N 관련 싱글 제품.

## 2. 제품 카테고리별 매칭 규칙

### 머플러팁 (카본/NPK/SNPK)
- 카본 머플러팁: "카본 [싱글/듀얼] [코드] [사이즈][D/S] - G"
  - SCF 시리즈: 93, 103, 116, 130mm / CFK 시리즈: 80, 93, 103mm / NCF: 80, 93mm
  - "카본 듀얼" → 카본 듀얼 SCF 계열, "카본 싱글" → 카본 싱글 SCF/CFK 계열
- NPK 머플러팁: "[싱글/듀얼] NPK [사이즈][D/S]-[S/T/B]" (80,89,100,114mm)
- SNPK 슬롯팁: "슬롯 [싱글/듀얼] SNPK [사이즈]-[S/T/B]" (89,100,127,142mm)
- 사각팁: "사각 머플러팁" 계열
- **"팁"만 있으면**: 사이즈/코드로 카본 vs NPK vs SNPK 구분. 코드 없으면 NPK가 가장 일반적.
- **스타일 미지정 시**: -S(스퀘어) 기본값으로 매칭

### 밴딩 파이프
- 스덴(스테인레스): "스덴 밴딩 [직경]-[각도]" (직경: 51,54,60,63,70,76 / 각도: 15,30,45,60,75,90)
- 알루미늄: "알루미늄 밴딩 [직경]-[각도]" (직경: 50,60,70,80 / 각도: 45,90)
- 단엘보: "스덴 단엘보 [직경]-[각도]" (직경: 50,63,76 / 각도: 45,90)
- **"밴딩" "벤딩" "밴딩파이프"** → 기본적으로 "스덴 밴딩"으로 매칭
- **"54 45도" "54파이 밴딩 45도"** → "스덴 밴딩 54-45"

### 자바라 (플렉시블 파이프)
- 형식: "자바라 SF [직경] [S/L] 길이 [mm]"
- 직경: 54, 61, 64, 70, 76mm / S타입: 80,100,120mm / L타입: 160mm
- **차종+자바라**: 제품 목록에서 해당 차종의 자바라 제품 찾기
- **"아반떼 자바라"** → "아반떼N 자바라" 관련 제품
- **"스팅어 자바라"** → 스팅어 관련 자바라 제품
- 직경/길이 미지정 시: 54 S 길이 100이 가장 일반적 (medium confidence)

### 다운파이프 (직관/촉매)
- **차종+직관/촉매**: 해당 차종의 다운파이프 제품
- "벨N 직관" → 벨로스터N 직관 다운파이프
- "스팅어 촉매 3.3" → 스팅어 3.3 촉매 다운파이프
- 스포츠 촉매: "스포츠 촉매 C100S/C200S/C300S"

### 스덴 직선 파이프
- "스덴 직선 파이프 2m [직경]파이"
- 직경: 50,54,60,63,70,76mm
- **"직선" "스텐파이프" "직관파이프"** → 스덴 직선 파이프

### 환봉
- "[직경]파이 [길이] 환봉" 형식
- **"환봉"만 있으면**: 가장 일반적인 사이즈 제시, medium confidence

### 레듀샤 (실리콘)
- "실리콘 레듀샤 SR[입구직경][출구직경]"
- "레듀샤 54-76" → "실리콘 레듀샤 SR5476"
- "레듀서 50 60" → "실리콘 레듀샤 SR5060"

### 플랜지
- "플랜지 FL [직경]" (51,54,61,63,65,70,76mm)

### 클램프
- "클램프 반도 [최소]-[최대]"

### 레조 소음기
- "레조 [챔버1] [챔버2] [코드]"

### 실리콘 호스
- 직선: "실리콘 직선 호스 SS[직경]"
- 엘보: "실리콘 엘보 [각도]SEL[직경]"
- 진공: "실리콘 진공 라인 5m SV[직경]"

## 3. 동의어/오타 변환표
| 입력(유저) | 정식(제품명) |
|-----------|-------------|
| 스텐,스테인,스덴레스,sus | 스덴 |
| 벤딩,밴딩파이프 | 밴딩 |
| 후렌지,후란지,플렌지 | 플랜지 |
| 레듀서,리듀서,리듀샤 | 레듀샤 |
| 쏘켓,소켙 | 소켓 |
| 겐또,겐도 | 게이트 |
| 싱그 → 싱글, 듀얼 → 듀얼 |
| 머플러커터 → 제품에 없음, 머플러팁으로 추측 |

## 4. 신뢰도 판정 기준 (매우 중요!)
### HIGH - 아래 조건 중 하나 이상 만족:
- 차종+부품타입이 명확하고 제품이 1~2개로 좁혀짐 (예: "아반떼N 자바라" → 확실)
- 제품 코드가 명시됨 (예: "SCF 103D", "NPK 89", "CFK 80")
- 직경+각도+재질이 모두 명시됨 (예: "스덴 밴딩 54 45도")
- 차종+직관/촉매 (예: "벨N 직관", "스팅어 촉매 3.3")
- 정확한 제품명 또는 거의 동일한 표현

### MEDIUM - 아래 조건:
- 부품 종류는 명확하나 사이즈/타입 일부 누락 (예: "카본 듀얼" → 사이즈 모름)
- 차종 없이 부품만 (예: "자바라" → 어떤 자바라?)
- 동의어로 변환 후 매칭 가능 (예: "스텐 밴딩" → "스덴 밴딩")

### LOW - 아래 조건:
- 부품 종류 자체가 모호 (예: "머플러 팁 하나" → 수백개 중 어느것?)
- 제품 목록에 없는 부품 요청
- 핵심 스펙(직경/사이즈)이 완전히 누락

## 5. 한 줄에 여러 제품
"카본듀얼이랑 싱글 각각 1개씩" → 2개 항목으로 분리
"밴딩 54 45도 3개 76 90도 2개" → 2개 항목으로 분리

## 제품 목록
${productList}

## 주문 텍스트
${text}

## 분석 규칙
1. 각 줄에서 제품과 수량을 추출. 한 줄에 여러 제품이면 분리.
2. 차종 약어를 먼저 변환 후 제품 목록에서 매칭.
3. 오타/줄임말/업계은어를 동의어표로 보정.
4. "하나"=1, "두개"=2, "세개"=3, "다섯"=5, "열개"=10, "한개만"=1 등 한글 수량 인식.
5. **matchedProduct는 반드시 위 제품 목록의 정확한 제품명(괄호 가격 제외)이어야 합니다.**
6. alternatives도 반드시 제품 목록에 있는 정확한 이름만.
7. 주문과 무관한 인사말/요청("사장님", "보내주세요", "주문합니다")은 무시.
8. **신뢰도는 위 §4 기준을 엄격히 적용하세요.**

## 응답 형식 (JSON 배열만, 다른 텍스트 없이)
[{"originalText":"원본","matchedProduct":"정확한 제품명 or null","quantity":수량,"confidence":"high|medium|low","alternatives":["정확한 제품명1","정확한 제품명2"]}]

## 예시 (9개)
입력: "카본 93 듀얼 1세트"
→ [{"originalText":"카본 93 듀얼 1세트","matchedProduct":"카본 듀얼 SCF 93D - G","quantity":1,"confidence":"high","alternatives":[]}]

입력: "벨N 카본 듀얼"
→ [{"originalText":"벨N 카본 듀얼","matchedProduct":"카본 듀얼 SCF 93D - G","quantity":1,"confidence":"medium","alternatives":["카본 듀얼 SCF 103D - G","카본 듀얼 SCF 116D - G"]}]

입력: "아N 직관 2개"
→ [{"originalText":"아N 직관 2개","matchedProduct":"아반떼N 직관 다운파이프","quantity":2,"confidence":"high","alternatives":["아반떼N 촉매 다운파이프"]}]

입력: "스팅어 자바라 3개"
→ [{"originalText":"스팅어 자바라 3개","matchedProduct":"자바라 SF 54 S 길이 100","quantity":3,"confidence":"medium","alternatives":["자바라 SF 61 S 길이 100","자바라 SF 64 S 길이 100"]}]

입력: "54 밴딩 45도 6개"
→ [{"originalText":"54 밴딩 45도 6개","matchedProduct":"스덴 밴딩 54-45","quantity":6,"confidence":"high","alternatives":[]}]

입력: "CFK 80 싱글"
→ [{"originalText":"CFK 80 싱글","matchedProduct":"카본 싱글 CFK 80S - G","quantity":1,"confidence":"high","alternatives":[]}]

입력: "레듀샤 54-76 하나"
→ [{"originalText":"레듀샤 54-76 하나","matchedProduct":"실리콘 레듀샤 SR5476","quantity":1,"confidence":"high","alternatives":[]}]

입력: "npk 89 듀얼 2개"
→ [{"originalText":"npk 89 듀얼 2개","matchedProduct":"듀얼 NPK 89D - S","quantity":2,"confidence":"high","alternatives":["듀얼 NPK 89D - T","듀얼 NPK 89D - B"]}]

입력: "머플러 팁 하나"
→ [{"originalText":"머플러 팁 하나","matchedProduct":"싱글 NPK 80S - S","quantity":1,"confidence":"low","alternatives":["듀얼 NPK 80D - S","카본 싱글 CFK 80S - G"]}]`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
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
        const findProduct = (name) => {
          if (!name) return null;
          // Strip price info if AI included it
          const clean = name.replace(/\s*\([\d,]+원?\)\s*$/, '').trim();
          // 1. Exact match
          const exact = products.find(p => p.name === clean);
          if (exact) return exact;
          // 2. Case-insensitive exact
          const ciExact = products.find(p => p.name.toLowerCase() === clean.toLowerCase());
          if (ciExact) return ciExact;
          // 3. Normalize spaces/dashes and compare
          const norm = (s) => s.replace(/[\s\-_]+/g, '').toLowerCase();
          const normClean = norm(clean);
          const normMatch = products.find(p => norm(p.name) === normClean);
          if (normMatch) return normMatch;
          // 4. Substring match with number validation
          const subMatch = products.find(p => {
            const included = p.name.includes(clean) || clean.includes(p.name);
            if (!included) return false;
            const sNums = clean.match(/\d+/g) || [];
            const pNums = p.name.match(/\d+/g) || [];
            if (sNums.length === 0 || pNums.length === 0) return included;
            return sNums.some(sn => pNums.some(pn => Math.abs(parseInt(sn) - parseInt(pn)) <= 1));
          });
          if (subMatch) return subMatch;
          // 5. Normalized substring match (ignore spaces/dashes)
          const normSubMatch = products.find(p => {
            const np = norm(p.name);
            return np.includes(normClean) || normClean.includes(np);
          });
          if (normSubMatch) return normSubMatch;
          // 6. Token-based scoring: find product with most keyword overlap
          const cleanTokens = clean.toLowerCase().replace(/[^a-z0-9가-힣]/g, ' ').split(/\s+/).filter(t => t.length > 0);
          if (cleanTokens.length >= 2) {
            let bestScore = 0, bestProduct = null;
            for (const p of products) {
              const pTokens = p.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, ' ').split(/\s+/).filter(t => t.length > 0);
              let score = 0;
              for (const ct of cleanTokens) {
                if (pTokens.some(pt => pt.includes(ct) || ct.includes(pt))) score++;
              }
              // Bonus for matching numbers exactly
              const cNums = clean.match(/\d+/g) || [];
              const pNums = p.name.match(/\d+/g) || [];
              for (const cn of cNums) {
                if (pNums.includes(cn)) score += 2;
              }
              if (score > bestScore) { bestScore = score; bestProduct = p; }
            }
            if (bestScore >= 2 && bestProduct) return bestProduct;
          }
          // 7. Fallback tolerance match
          return products.find(p => matchWithTolerance(clean, p.name)) || null;
        };

        const results = aiResults.map((item) => {
          // Try AI's primary match first, then alternatives, then original text
          const searchTerms = [item.matchedProduct, ...(item.alternatives || []), cleanSearchText(item.originalText), item.originalText].filter(Boolean);
          let matchedProduct = null;
          const alternativeProducts = [];

          for (const term of searchTerms) {
            const found = findProduct(term);
            if (found && !matchedProduct) {
              matchedProduct = found;
            } else if (found && !alternativeProducts.some(a => a.id === found.id) && found.id !== matchedProduct?.id) {
              alternativeProducts.push(found);
            }
          }

          // Also resolve alternatives even if primary matched
          if (item.alternatives && matchedProduct) {
            for (const alt of item.alternatives) {
              const found = findProduct(alt);
              if (found && found.id !== matchedProduct.id && !alternativeProducts.some(a => a.id === found.id)) {
                alternativeProducts.push(found);
              }
            }
          }

          return {
            originalText: item.originalText,
            searchText: item.originalText,
            quantity: item.quantity || 1,
            matchedProduct,
            alternatives: alternativeProducts.slice(0, 3),
            confidence: item.confidence || (matchedProduct ? 'high' : 'low'),
            score: matchedProduct ? 100 : 0,
            selected: !!matchedProduct,
            aiMatched: true,
          };
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
  const [inputCollapsed, setInputCollapsed] = useState(false);

  const inputClass = 'w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors';
  const inputStyle = { backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}>
      {/* Header - clean white style matching other pages */}
      <div
        className="sticky top-0 z-40 flex items-center h-12 px-3 border-b flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <button
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
        </button>
        <div className="ml-2 flex items-center gap-2 flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--foreground)' }}>AI 주문 인식</h1>
          <button
            onClick={() => { setTempApiKey(geminiApiKey); setShowApiSettings(true); }}
            className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: isAiMode ? 'color-mix(in srgb, var(--success) 15%, transparent)' : 'color-mix(in srgb, var(--primary) 15%, transparent)',
              color: isAiMode ? 'var(--success)' : 'var(--primary)',
            }}
          >
            {isAiMode ? 'Gemini AI' : '패턴 매칭'}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedCount > 0 && (
            <span
              className="px-2 py-0.5 text-xs font-bold rounded-full"
              style={{ backgroundColor: 'var(--primary)', color: 'white' }}
            >
              {selectedCount}
            </span>
          )}
          <button
            onClick={() => { setTempApiKey(geminiApiKey); setShowApiSettings(true); }}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)]"
            title="AI 설정"
          >
            <Settings className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>
      </div>

      {/* Input Section */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2" style={{ background: 'var(--background)' }}>
        {/* Collapsible input when results exist */}
        {analyzedItems.length > 0 && (
          <button
            onClick={() => setInputCollapsed(!inputCollapsed)}
            className="w-full flex items-center justify-between mb-2 text-sm font-medium"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              메모 입력 영역
            </span>
            {inputCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}

        {(!inputCollapsed || analyzedItems.length === 0) && (
          <>
            {/* Textarea */}
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`주문 메모를 붙여넣으세요\n\n예시:\n카본 93 듀얼 1세트\n54파이 밴딩 45 6개\n2m 환봉 1개 12파이`}
                rows={6}
                className="w-full px-4 py-3 rounded-2xl border text-sm resize-none font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                style={{
                  backgroundColor: 'var(--card)',
                  borderColor: 'var(--border)',
                  color: 'var(--foreground)',
                  fontSize: '16px',
                }}
              />
              {inputText && (
                <span className="absolute top-2 right-3 text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 10%, transparent)' }}>
                  자동저장
                </span>
              )}
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={analyzeText}
                disabled={!inputText.trim() || isAnalyzing}
                className="flex-1 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
                style={{ backgroundColor: isAiMode ? 'var(--success)' : 'var(--primary)' }}
              >
                {isAnalyzing
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />분석 중...</>
                  : <><Sparkles className="w-4 h-4" />{isAiMode ? 'AI 분석' : '텍스트 분석'}</>
                }
              </button>
              <button
                onClick={() => setShowProductSearch(!showProductSearch)}
                className="flex-shrink-0 p-3 rounded-2xl transition-all border active:scale-[0.98]"
                style={{
                  backgroundColor: showProductSearch ? 'var(--primary)' : 'var(--card)',
                  color: showProductSearch ? 'white' : 'var(--foreground)',
                  borderColor: showProductSearch ? 'var(--primary)' : 'var(--border)',
                }}
                title="직접 제품 추가"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Utility buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => { if (inputText.trim() && confirm('메모 내용을 초기화할까요?')) { setInputText(''); localStorage.removeItem('aiOrderInputText'); } }}
                className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'var(--card)' }}
              >
                <RotateCcw className="w-3 h-3" />초기화
              </button>
              <button
                onClick={saveBackup}
                className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'var(--card)' }}
              >
                <Save className="w-3 h-3" />백업
              </button>
              <button
                onClick={() => setShowBackupModal(true)}
                className="flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'var(--card)' }}
              >
                <FolderOpen className="w-3 h-3" />
                불러오기{backupList.length > 0 ? ` (${backupList.length})` : ''}
              </button>
            </div>
          </>
        )}

        {/* AI Error */}
        {aiError && (
          <div className="mt-3 p-3 rounded-xl border flex items-start gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 8%, transparent)', borderColor: 'var(--warning)' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            <p className="text-xs" style={{ color: 'var(--warning)' }}>{aiError}</p>
          </div>
        )}

        {/* Direct product search panel */}
        {showProductSearch && (
          <div className="mt-3 p-3 rounded-2xl border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground)' }}>직접 제품 추가</p>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="제품명 검색..."
                  className={`${inputClass} pl-9`}
                  style={{ ...inputStyle, fontSize: '16px' }}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-0.5 rounded-xl px-1.5 flex-shrink-0" style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                <button onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))} className="p-1.5 rounded-lg hover:bg-[var(--secondary)]">
                  <Minus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                </button>
                <span className="text-sm w-7 text-center font-bold" style={{ color: 'var(--foreground)' }}>{addQuantity}</span>
                <button onClick={() => setAddQuantity(addQuantity + 1)} className="p-1.5 rounded-lg hover:bg-[var(--secondary)]">
                  <Plus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                </button>
              </div>
            </div>
            {productAddResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {productAddResults.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addProductDirect(product)}
                    className="w-full p-2.5 rounded-xl text-left flex justify-between items-center transition-colors hover:bg-[var(--muted)]"
                    style={{ backgroundColor: 'var(--background)' }}
                  >
                    <span className="text-sm truncate mr-2" style={{ color: 'var(--foreground)' }}>{product.name}</span>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--success)' }}>
                      {formatPrice(priceType === 'wholesale' ? product.wholesale : (product.retail || product.wholesale))}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {productSearchQuery && productAddResults.length === 0 && (
              <p className="text-sm text-center py-3" style={{ color: 'var(--muted-foreground)' }}>검색 결과 없음</p>
            )}
          </div>
        )}
      </div>

      {/* Results Section */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {analyzedItems.length > 0 && (
          <>
            {/* Results header */}
            <div className="flex items-center justify-between py-3">
              <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <Package className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                분석 결과
                <span className="text-xs font-normal" style={{ color: 'var(--muted-foreground)' }}>
                  {analyzedItems.length}건
                </span>
              </h3>
              {selectedCount > 0 && (
                <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                  {selectedCount}개 선택됨
                </span>
              )}
            </div>

            {/* Result cards */}
            <div className="space-y-2">
              {analyzedItems.map((item, index) => (
                <div
                  key={index}
                  className="rounded-2xl border transition-all overflow-hidden"
                  style={{
                    borderColor: item.matchedProduct
                      ? item.selected ? 'var(--primary)' : 'var(--border)'
                      : 'var(--destructive)',
                    backgroundColor: 'var(--card)',
                  }}
                >
                  {/* Original text strip with confidence */}
                  <div
                    className="px-3 py-1.5 text-[11px] border-b flex items-center justify-between gap-2"
                    style={{
                      color: 'var(--muted-foreground)',
                      backgroundColor: item.matchedProduct
                        ? item.selected ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--secondary)'
                        : 'color-mix(in srgb, var(--destructive) 6%, transparent)',
                      borderColor: 'inherit',
                    }}
                  >
                    <span className="truncate">{item.originalText}</span>
                    {item.confidence && item.matchedProduct && (
                      <span
                        className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{
                          backgroundColor: item.confidence === 'high' ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                            : item.confidence === 'medium' ? 'color-mix(in srgb, var(--warning) 15%, transparent)'
                            : 'color-mix(in srgb, var(--destructive) 15%, transparent)',
                          color: item.confidence === 'high' ? 'var(--success)'
                            : item.confidence === 'medium' ? 'var(--warning)'
                            : 'var(--destructive)',
                        }}
                      >
                        {item.confidence === 'high' ? '확실' : item.confidence === 'medium' ? '추측' : '불확실'}
                      </span>
                    )}
                  </div>

                  <div className="p-3">
                    {item.matchedProduct ? (
                      <>
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleSelect(index)}
                          className="w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            borderColor: item.selected ? 'var(--primary)' : 'var(--border)',
                            backgroundColor: item.selected ? 'var(--primary)' : 'transparent',
                          }}
                        >
                          {item.selected && <Check className="w-3 h-3 text-white" />}
                        </button>

                        {/* Product info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
                            {item.matchedProduct.name}
                          </p>
                          <p className="text-sm font-bold mt-0.5" style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}>
                            {formatPrice(priceType === 'wholesale' ? item.matchedProduct.wholesale : (item.matchedProduct.retail || item.matchedProduct.wholesale))}
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Quantity */}
                          <div className="flex items-center rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)' }}>
                            <button onClick={() => updateQuantity(index, item.quantity - 1)} className="w-7 h-7 flex items-center justify-center rounded-l-xl hover:bg-[var(--muted)]">
                              <Minus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                              className="w-8 h-7 text-center text-xs font-bold bg-transparent border-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ color: 'var(--foreground)' }}
                            />
                            <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-7 h-7 flex items-center justify-center rounded-r-xl hover:bg-[var(--muted)]">
                              <Plus className="w-3 h-3" style={{ color: 'var(--foreground)' }} />
                            </button>
                          </div>
                          {/* Change / Delete */}
                          <button
                            onClick={() => { setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                            style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
                            title="제품 변경"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removeItem(index)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Alternatives - show when confidence is not high */}
                      {item.alternatives && item.alternatives.length > 0 && item.confidence !== 'high' && (
                        <div className="mt-2 pt-2 border-t flex items-center gap-1.5 flex-wrap" style={{ borderColor: 'var(--border)' }}>
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>다른 후보:</span>
                          {item.alternatives.map((alt, ai) => (
                            <button
                              key={ai}
                              onClick={() => selectProduct(index, alt)}
                              className="px-2 py-0.5 text-[11px] rounded-lg border transition-all hover:border-[var(--primary)]"
                              style={{ borderColor: 'var(--border)', color: 'var(--primary)', backgroundColor: 'var(--secondary)' }}
                            >
                              {alt.name}
                            </button>
                          ))}
                        </div>
                      )}
                      </>
                    ) : (
                      /* Unmatched item */
                      <>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--muted)' }}>
                          <X className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium" style={{ color: 'var(--destructive)' }}>매칭 실패</span>
                        </div>
                        <button
                          onClick={() => { setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                          className="px-3 py-1.5 text-xs rounded-xl flex items-center gap-1 font-semibold text-white transition-all active:scale-[0.97]"
                          style={{ backgroundColor: 'var(--primary)' }}
                        >
                          <Search className="w-3 h-3" />검색
                        </button>
                        <button
                          onClick={() => removeItem(index)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)', color: 'var(--destructive)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Alternatives for unmatched items */}
                      {item.alternatives && item.alternatives.length > 0 && (
                        <div className="mt-2 pt-2 border-t flex items-center gap-1.5 flex-wrap" style={{ borderColor: 'var(--border)' }}>
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>혹시:</span>
                          {item.alternatives.map((alt, ai) => (
                            <button
                              key={ai}
                              onClick={() => selectProduct(index, alt)}
                              className="px-2 py-1 text-[11px] rounded-lg border transition-all hover:border-[var(--primary)] font-medium"
                              style={{ borderColor: 'var(--primary)', color: 'var(--primary)', backgroundColor: 'color-mix(in srgb, var(--primary) 5%, transparent)' }}
                            >
                              {alt.name}
                            </button>
                          ))}
                        </div>
                      )}
                      </>
                    )}

                    {/* Inline product search */}
                    {searchingIndex === index && (
                      <div className="mt-3 p-3 rounded-xl border" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--primary)' }}>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--primary)' }} />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="제품명 검색..."
                            autoFocus
                            className={`${inputClass} pl-9`}
                            style={{ ...inputStyle, fontSize: '16px' }}
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
                                <p className="text-xs mt-0.5 font-bold" style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}>
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
                          className="w-full mt-2 py-2 text-sm font-medium rounded-xl transition-all"
                          style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
                        >
                          닫기
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {analyzedItems.length === 0 && !isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: isAiMode ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--primary) 12%, transparent)' }}
            >
              <Sparkles className="w-8 h-8" style={{ color: isAiMode ? 'var(--success)' : 'var(--primary)' }} />
            </div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--foreground)' }}>
              주문 메모를 분석해보세요
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              카톡이나 문자로 받은 주문 내용을<br />위에 붙여넣고 분석 버튼을 누르세요
            </p>
          </div>
        )}
      </div>

      {/* Footer CTA - fixed bottom */}
      {analyzedItems.length > 0 && (
        <div className="border-t px-4 py-3 flex-shrink-0 safe-bottom" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
          <button
            onClick={addSelectedToCart}
            disabled={selectedCount === 0}
            className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]"
            style={{ backgroundColor: selectedCount === 0 ? 'var(--muted-foreground)' : 'var(--success)' }}
          >
            <ShoppingCart className="w-5 h-5" />
            {selectedCount > 0 ? `${selectedCount}개 제품 장바구니에 담기` : '제품을 선택하세요'}
          </button>
        </div>
      )}

      {/* AI Settings Modal */}
      {showApiSettings && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center z-[60] animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setShowApiSettings(false)}>
          <div className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md overflow-hidden border shadow-2xl animate-modal-up" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <Settings className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
                분석 모드 설정
              </h3>
              <button onClick={() => setShowApiSettings(false)} className="p-1.5 hover:bg-[var(--muted)] rounded-lg transition-colors">
                <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
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
                    className="w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]"
                    style={{ borderColor: isActive ? activeColor : 'var(--border)', backgroundColor: isActive ? `color-mix(in srgb, ${activeColor} 8%, transparent)` : 'var(--secondary)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: isActive ? activeColor : 'var(--muted)' }}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm" style={{ color: isActive ? activeColor : 'var(--foreground)' }}>{label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
                      </div>
                      {isActive && <Check className="w-5 h-5" style={{ color: activeColor }} />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="h-6" />
          </div>
        </div>
      )}

      {/* Backup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center z-[60] animate-modal-backdrop" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setShowBackupModal(false)}>
          <div className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[75vh] flex flex-col border shadow-2xl animate-modal-up" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <FolderOpen className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                백업 목록
              </h3>
              <button onClick={() => setShowBackupModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--secondary)] transition-colors">
                <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {backupList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--muted-foreground)' }}>
                  <FolderOpen className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm">저장된 백업이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {backupList.map((backup) => (
                    <div key={backup.id} className="p-3 rounded-xl border hover:border-[var(--primary)] transition-colors" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{backup.date}</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteBackup(backup.id); }} className="p-1 rounded transition-colors hover:bg-[color-mix(in_srgb,var(--destructive)_15%,transparent)]" style={{ color: 'var(--destructive)' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-sm mb-2.5 font-mono truncate" style={{ color: 'var(--foreground)' }}>{backup.preview}</p>
                      <button onClick={() => loadBackup(backup)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors active:scale-[0.98]" style={{ backgroundColor: 'var(--primary)' }}>
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
