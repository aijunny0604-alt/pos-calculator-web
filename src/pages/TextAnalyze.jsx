import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, X, Settings, Search, Plus, Minus, Trash2, Edit3,
  ShoppingCart, FileText, Save, FolderOpen, RotateCcw, RefreshCw,
  AlertTriangle, Check, Zap, Package, ArrowLeft, ChevronDown, ChevronUp,
  Menu, Maximize2, Minimize2,
} from 'lucide-react';
import { matchesSearchQuery, normalizeText } from '@/lib/utils';

export default function TextAnalyze({
  products = [],
  onAddToCart,
  formatPrice,
  priceType = 'wholesale',
  initialText = '',
  onBack,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  aiLearningData = [],
  onSaveLearning,
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

  const getGeminiKeys = () => {
    const keys = [];
    // 내장 키 (프로젝트별 분리, 한도 독립 — 최신 키 우선)
    try { keys.push(atob('QUl6YVN5REpkWGxXMUx5MUVFOTJGZ2NUMmloemszcjV0Z040MGdz')); } catch {} // 프로젝트D
    try { keys.push(atob('QUl6YVN5RFpaT2wxZmF0WC1OcDQyQjliLTRBSHZiSEtONzZKOEQ0')); } catch {} // 프로젝트C
    try { keys.push(atob('QUl6YVN5Q3NaRzM4OER6RFJBbS1Nem9wUFo4VU11RHBiYW5ETlB3')); } catch {} // 프로젝트B
    try { keys.push(atob('QUl6YVN5QkZtcDhZYzB4VDBkQzA3ODRNNnc2c01JQm9aSVlIOFBj')); } catch {} // 프로젝트A
    const stored = localStorage.getItem('geminiApiKey');
    if (stored && !keys.includes(stored)) keys.push(stored);
    return keys;
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
      if (e.key === 'Escape') (onClose || onBack)?.()
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack, onClose]);

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
    '직관레조': 'CH', '직관 레조': 'CH', '공갈레조': 'CH', '뻥레조': 'CH',
    '가변소음기': 'TVB', '가변': 'TVB', '진공가변': 'TVB',
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

#### 제품명 체계 (매우 중요!)
- **D = 듀얼(Dual)**: 좌우 한 쌍이 1개 단위. 제품명에 D가 붙음
- **S = 싱글(Single)**: 한 쪽만 1개 단위. 제품명에 S가 붙음
- 예: "듀얼 NPK 89D-T" → 듀얼팁 1개(좌우 포함), "싱글 NPK 89S-T" → 싱글팁 1개(한쪽)

#### ★ 좌우(좌,우) 수량 규칙 — 최우선 적용!
머플러팁에서 "좌우", "좌,우", "좌 우", "양쪽", "한쌍", "L/R", "LR", "한세트" 등의 표현이 나오면 **좌측 1개 + 우측 1개 = 2개**라는 뜻입니다:
- **싱글팁 + 좌우 = 수량 ×2** (좌 1개 + 우 1개)
  - "싱글 NPK 89 좌우 1세트" → 싱글 NPK 89S-S, quantity: **2**
  - "카본 싱글 103 좌우" → 카본 싱글 SCF 103S-G, quantity: **2**
- **듀얼팁 + 좌우 = 수량 ×2** (좌 1개 + 우 1개)
  - "듀얼 NPK 89 좌우 1세트" → 듀얼 NPK 89D-S, quantity: **2**
  - "NPK 89D-T 좌,우" → 듀얼 NPK 89D-T, quantity: **2**
- **좌우 N세트 = 수량 N×2**
  - "싱글 NPK 89 좌우 2세트" → 싱글 NPK 89S-S, quantity: **4**
  - "듀얼 NPK 100 좌우 3세트" → 듀얼 NPK 100D-S, quantity: **6**
- **좌우 없이 "N세트" 또는 "N개" = 그대로 수량 N**
  - "듀얼 NPK 89 2개" → 듀얼 NPK 89D-S, quantity: **2**
  - "카본 싱글 103 1개" → 카본 싱글 SCF 103S-G, quantity: **1**

#### 카테고리별 제품명 형식
- 카본 머플러팁: "카본 [싱글/듀얼] [코드] [사이즈][S/D]-G"
  - SCF 시리즈: 93, 103, 116, 130mm / CFK 시리즈: 80, 93, 103, 116mm / NCF: 130mm
  - "카본 듀얼" → 카본 듀얼 SCF 계열, "카본 싱글" → 카본 싱글 SCF/CFK 계열
- NPK 머플러팁: "[싱글/듀얼] NPK [사이즈][S/D]-[S/T/B]" (80,89,100,114mm)
  - 스타일: S=스퀘어(기본), T=턴다운, B=번트
  - 사이즈 뒤 문자: S=싱글, D=듀얼 (예: 89**D**=듀얼89mm, 89**S**=싱글89mm)
- SNPK 슬롯팁: "슬롯 [싱글/듀얼] SNPK [사이즈][S/D]-[S/T/B]" (89,100,114,127,142mm)
- 사각팁: "사각팁 DSQ[1/2]-[S/T/B/R/G]" / AMG 커버팁
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

### ★ 가변 소음기 (TVB/MVB) — 세트 수량 규칙 매우 중요!
- 제품 종류: TVB(진공식), MVB(전자식). 용접O/용접X 구분.
- **제품명 형식**: "용접된 TVB [내경] [h/Y] [좌, 우 1세트 / L / R]"
  - 내경: 54, 64, 77mm
  - h = 곡관형, Y = Y자형
  - "좌, 우 1세트" = 좌+우 한 세트 제품 (가격이 세트 가격)
  - L = 좌측만, R = 우측만

#### ★★ "가변소음기 2개" = 1세트 규칙 (최우선!)
- **"[내경][h/Y] 2개"** → h/Y + 2개는 좌+우 = **1세트** 제품으로 매칭!
  - "63h 2개" → "용접된 TVB 64 h 좌, 우 1세트" quantity: **1**
  - "54y 2개" → "용접된 TVB 54 Y 좌,우 1세트" quantity: **1**
  - "54h 2개" → "용접된 TVB 54 h 좌, 우 1세트" quantity: **1**
  - "64Y 2개" → "용접된 TVB 64 Y 좌, 우 1세트" quantity: **1**
- **"[내경][h/Y] 4개"** → 2세트
  - "63h 4개" → "용접된 TVB 64 h 좌, 우 1세트" quantity: **2**
- **"[내경][h/Y] 1개"** → 좌 또는 우 1개 (L 또는 R)
  - "63h 1개" → "용접된 TVB 64 h L" quantity: **1** (alternatives에 R도 포함)
- **별명**: "가변소음기", "가변", "TVB", "진공가변" → TVB 가변 소음기
- **내경 매핑**: 63→64로 매칭 (제품에 63이 없고 64가 있음)
- **"가변소음기"만 단독** → medium confidence, TVB 54 h 세트를 기본 제시

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

### 레조 소음기 (레조네이터)
- 일반 레조: "레조 [외경] [길이] [내경]" 형식. 예: "레조 100 200 64" = 외경100 길이200 내경64
  - 외경 종류: 100, 114, 150
- CH 공갈 레조 (=뻥레조=직관레조): "CH [길이] [내경]" 형식. 외경은 항상 100 고정 (표기 생략)
  - 예: "CH 200 64" = 외경100(생략) 길이200 내경64
- **레조 vs CH 구분**: 숫자 3개 → 일반 레조, "CH"+숫자 2개 → CH 공갈 레조
- **★ "직관 레조" / "직관레조"** → 반드시 **CH 뻥레조** 제품으로 매칭! (일반 레조 아님)
  - "직관 레조 100 250 63 2개" → "CH 250 64" 2개 (100은 외경이므로 무시, 63→64 가장 가까운 사이즈)
  - "직관 레조 54" → "CH 200 54" (길이 미지정시 200 기본)
  - "직관 레조 200 54 1개" → "CH 200 54" 1개
- **"일반 레조"** / 단순히 **"레조"** → 진짜 일반 레조 제품 (레조 100 250 64 등)
- **별명**: "공갈레조", "뻥레조", "공갈", "직관레조", "직관 레조" → CH 공갈 레조
- **"레조네이터"** = "레조"의 정식 명칭
- **숫자 2개만** (예: "레조 200 64") → 외경 100 기본 적용 → "레조 100 200 64"

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
| 공갈레조,뻥레조,공갈,직관레조,직관 레조 | CH 공갈 레조 |
| 가변소음기,가변,진공가변 | TVB 가변 소음기 |
| 레조네이터 | 레조 |
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
5. **★ 머플러팁 좌우 수량**: "좌우/좌,우/좌 우/양쪽/한쌍/L/R" 표현이 있으면 수량을 ×2 해야 합니다. "좌우 N세트"=N×2개, "좌우"만 있으면=2개. 좌우 표현이 없는 "N개/N세트"는 그대로 N개.
6. **matchedProduct는 반드시 위 제품 목록의 정확한 제품명(괄호 가격 제외)이어야 합니다.**
7. alternatives도 반드시 제품 목록에 있는 정확한 이름만.
8. 주문과 무관한 인사말/요청("사장님", "보내주세요", "주문합니다")은 무시.
9. **신뢰도는 위 §4 기준을 엄격히 적용하세요.**

## 응답 형식 (JSON 배열만, 다른 텍스트 없이)
[{"originalText":"원본","matchedProduct":"정확한 제품명 or null","quantity":수량,"confidence":"high|medium|low","alternatives":["정확한 제품명1","정확한 제품명2"]}]

## 예시 (15개 — 좌우 수량 포함)

### 기본 매칭
입력: "카본 93 듀얼 1세트"
→ [{"originalText":"카본 93 듀얼 1세트","matchedProduct":"카본 듀얼 SCF 93D-G","quantity":1,"confidence":"high","alternatives":[]}]

입력: "벨N 카본 듀얼"
→ [{"originalText":"벨N 카본 듀얼","matchedProduct":"카본 듀얼 SCF 93D-G","quantity":1,"confidence":"medium","alternatives":["카본 듀얼 SCF 103D-G","카본 듀얼 SCF 116D-G"]}]

입력: "아N 직관 2개"
→ [{"originalText":"아N 직관 2개","matchedProduct":"아반떼N 직관 다운파이프","quantity":2,"confidence":"high","alternatives":["아반떼N 촉매 다운파이프"]}]

입력: "스팅어 자바라 3개"
→ [{"originalText":"스팅어 자바라 3개","matchedProduct":"자바라 SF 54 S 길이 100","quantity":3,"confidence":"medium","alternatives":["자바라 SF 61 S 길이 100","자바라 SF 64 S 길이 100"]}]

입력: "54 밴딩 45도 6개"
→ [{"originalText":"54 밴딩 45도 6개","matchedProduct":"스덴 밴딩 54-45","quantity":6,"confidence":"high","alternatives":[]}]

입력: "CFK 80 싱글"
→ [{"originalText":"CFK 80 싱글","matchedProduct":"카본 싱글 CFK 80S-G","quantity":1,"confidence":"high","alternatives":[]}]

입력: "레듀샤 54-76 하나"
→ [{"originalText":"레듀샤 54-76 하나","matchedProduct":"실리콘 레듀샤 SR5476","quantity":1,"confidence":"high","alternatives":[]}]

입력: "npk 89 듀얼 2개"
→ [{"originalText":"npk 89 듀얼 2개","matchedProduct":"듀얼 NPK 89D-S","quantity":2,"confidence":"high","alternatives":["듀얼 NPK 89D-T","듀얼 NPK 89D-B"]}]

입력: "머플러 팁 하나"
→ [{"originalText":"머플러 팁 하나","matchedProduct":"싱글 NPK 80S-S","quantity":1,"confidence":"low","alternatives":["듀얼 NPK 80D-S","카본 싱글 CFK 80S-G"]}]

### ★ 좌우 수량 예시 (핵심!)
입력: "듀얼 NPK 89 턴다운 좌,우 1세트"
→ [{"originalText":"듀얼 NPK 89 턴다운 좌,우 1세트","matchedProduct":"듀얼 NPK 89D-T","quantity":2,"confidence":"high","alternatives":[]}]

입력: "싱글 NPK 100 좌우"
→ [{"originalText":"싱글 NPK 100 좌우","matchedProduct":"싱글 NPK 100S-S","quantity":2,"confidence":"high","alternatives":["싱글 NPK 100S-T","싱글 NPK 100S-B"]}]

입력: "카본 싱글 SCF 103 좌 우 2세트"
→ [{"originalText":"카본 싱글 SCF 103 좌 우 2세트","matchedProduct":"카본 싱글 SCF 103S-G","quantity":4,"confidence":"high","alternatives":[]}]

입력: "SNPK 89 듀얼 좌우 1세트"
→ [{"originalText":"SNPK 89 듀얼 좌우 1세트","matchedProduct":"슬롯 듀얼 SNPK 89D-S","quantity":2,"confidence":"high","alternatives":["슬롯 듀얼 SNPK 89D-T","슬롯 듀얼 SNPK 89D-B"]}]

입력: "NPK 114 싱글 턴다운 양쪽"
→ [{"originalText":"NPK 114 싱글 턴다운 양쪽","matchedProduct":"싱글 NPK 114S-T","quantity":2,"confidence":"high","alternatives":[]}]

입력: "듀얼 NPK 89 3개"
→ [{"originalText":"듀얼 NPK 89 3개","matchedProduct":"듀얼 NPK 89D-S","quantity":3,"confidence":"high","alternatives":["듀얼 NPK 89D-T","듀얼 NPK 89D-B"]}]

### ★ 가변소음기 세트 예시
입력: "63 가변소음기 h 2개"
→ [{"originalText":"63 가변소음기 h 2개","matchedProduct":"용접된 TVB 64 h 좌, 우 1세트","quantity":1,"confidence":"high","alternatives":[]}]

입력: "54 가변소음기 y 2개"
→ [{"originalText":"54 가변소음기 y 2개","matchedProduct":"용접된 TVB 54 Y 좌,우 1세트","quantity":1,"confidence":"high","alternatives":[]}]

입력: "64h 가변 4개"
→ [{"originalText":"64h 가변 4개","matchedProduct":"용접된 TVB 64 h 좌, 우 1세트","quantity":2,"confidence":"high","alternatives":[]}]

### ★ 직관 레조 = CH 뻥레조 예시
입력: "직관 레조 100 250 63 2개"
→ [{"originalText":"직관 레조 100 250 63 2개","matchedProduct":"CH 250 64","quantity":2,"confidence":"high","alternatives":["CH 200 64"]}]

입력: "직관레조 200 54 1개"
→ [{"originalText":"직관레조 200 54 1개","matchedProduct":"CH 200 54","quantity":1,"confidence":"high","alternatives":[]}]

입력: "일반 레조 100 250 54 1개"
→ [{"originalText":"일반 레조 100 250 54 1개","matchedProduct":"레조 100 250 54","quantity":1,"confidence":"high","alternatives":[]}]`

    + (aiLearningData.length > 0 ? `

## 학습된 교정 사례 (최우선 적용!)
아래는 사용자가 직접 교정한 실제 매칭 데이터입니다. 동일하거나 유사한 입력이 들어오면 반드시 이 매핑을 따르세요.
이 교정 사례는 위의 모든 규칙보다 우선합니다.

${aiLearningData.slice(0, 50).map(l =>
  `- "${l.original_text}" → "${l.product_name}" (수량: ${l.quantity}${l.reason ? `, 사유: ${l.reason}` : ''})`
).join('\n')}

**규칙**: 입력 텍스트가 위 교정 사례와 동일하거나 매우 유사하면, 해당 제품으로 매칭하고 confidence를 "high"로 설정하세요.` : '');

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const keys = getGeminiKeys();
    let response = null;
    for (const key of keys) {
      for (const model of models) {
        for (let retry = 0; retry < 3; retry++) {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
              }),
            }
          );
          if (response.ok) break;
          if (response.status === 503) { await new Promise(r => setTimeout(r, 2000)); continue; }
          break;
        }
        if (response?.ok) break;
      }
      if (response?.ok) break;
    }

    if (!response?.ok) {
      let errorMessage = 'AI 일일 사용량 초과 — 잠시 후 다시 시도하세요';
      try {
        const err = await response.json();
        const code = err.error?.code;
        if (code === 429) errorMessage = 'AI 일일 사용량 초과 — 잠시 후(1~2분) 다시 시도하세요';
        else if (code === 403) errorMessage = 'AI 접근 권한 없음 — API 키를 확인하세요';
        else if (code === 500 || code === 503) errorMessage = 'AI 서버 일시 장애 — 잠시 후 다시 시도하세요';
        else errorMessage = err.error?.message?.split('.')[0] || errorMessage;
      } catch { errorMessage = `AI 서버 오류 (${response?.status || '연결 실패'})`; }
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

        // 학습 데이터 기반 매칭 함수
        const findFromLearning = (text) => {
          if (!aiLearningData || aiLearningData.length === 0) return null;
          const normalized = normalizeText(text);
          if (!normalized) return null;
          // 정확히 일치하는 학습 데이터 찾기
          const exactMatch = aiLearningData.find(l => l.normalized_text === normalized);
          if (exactMatch) {
            const product = products.find(p => p.id === exactMatch.product_id);
            if (product) return { product, learningId: exactMatch.id, hitCount: exactMatch.hit_count };
          }
          // 포함 매칭 (학습 텍스트가 검색 텍스트에 포함되거나 반대)
          const partialMatch = aiLearningData.find(l => {
            const ln = l.normalized_text;
            return (normalized.includes(ln) || ln.includes(normalized)) && Math.abs(ln.length - normalized.length) <= 3;
          });
          if (partialMatch) {
            const product = products.find(p => p.id === partialMatch.product_id);
            if (product) return { product, learningId: partialMatch.id, hitCount: partialMatch.hit_count };
          }
          return null;
        };

        const findProduct = (name) => {
          if (!name) return null;
          // Strip price info if AI included it
          const clean = name.replace(/\s*\([\d,]+원?\)\s*$/, '').trim();
          // 0. 학습 데이터 우선 매칭
          const learned = findFromLearning(clean);
          if (learned) return learned.product;
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

      // 학습 데이터 우선 매칭 (패턴 매칭 모드)
      const learnedFallback = aiLearningData?.length > 0 ? (() => {
        const normalized = normalizeText(searchText);
        if (!normalized) return null;
        const exact = aiLearningData.find(l => l.normalized_text === normalized);
        if (exact) return products.find(p => p.id === exact.product_id) || null;
        const partial = aiLearningData.find(l => {
          const ln = l.normalized_text;
          return (normalized.includes(ln) || ln.includes(normalized)) && Math.abs(ln.length - normalized.length) <= 3;
        });
        return partial ? products.find(p => p.id === partial.product_id) || null : null;
      })() : null;

      if (learnedFallback) {
        results.push({ originalText: cleanLine, searchText, quantity, matchedProduct: learnedFallback, score: 200, selected: true, learnedMatch: true });
        return;
      }

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

  const [correctionReason, setCorrectionReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(null); // index

  const selectProduct = (index, product) => {
    setAnalyzedItems(prev => prev.map((item, i) => i === index ? { ...item, matchedProduct: product, selected: true, score: 100, userCorrected: true } : item));
    setSearchingIndex(null);
    setSearchQuery('');
    setCorrectionReason('');
    setShowReasonInput(index);
  };

  const saveReason = (index) => {
    if (correctionReason.trim()) {
      setAnalyzedItems(prev => prev.map((item, i) => i === index ? { ...item, correctionReason: correctionReason.trim() } : item));
    }
    setShowReasonInput(null);
    setCorrectionReason('');
  };

  const getSearchResults = () => {
    if (!searchQuery.trim()) return [];
    return products.filter(p => matchesSearchQuery(p.name, searchQuery)).slice(0, 8);
  };

  const addSelectedToCart = () => {
    const selectedItems = analyzedItems
      .filter(item => item.selected && item.matchedProduct)
      .map(item => ({
        ...item.matchedProduct,
        quantity: item.quantity,
        price: priceType === 'wholesale'
          ? item.matchedProduct.wholesale
          : (item.matchedProduct.retail || item.matchedProduct.wholesale)
      }));
    if (selectedItems.length > 0) {
      onAddToCart(selectedItems);
      // 학습 데이터 저장 — 사용자가 수정한 항목만
      if (onSaveLearning) {
        const learningItems = analyzedItems
          .filter(item => item.selected && item.matchedProduct && item.userCorrected)
          .map(item => ({
            originalText: item.originalText || item.searchText,
            normalizedText: normalizeText(item.originalText || item.searchText),
            productId: item.matchedProduct.id,
            productName: item.matchedProduct.name,
            quantity: item.quantity,
            reason: item.correctionReason || '',
          }));
        if (learningItems.length > 0) {
          onSaveLearning(learningItems);
        }
      }
    }
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
    ? products.filter(p => matchesSearchQuery(p.name, productSearchQuery)).slice(0, 10)
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
        {!onClose && (
          <button
            className="md:hidden p-1.5 -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          >
            <Menu className="w-5 h-5" style={{ color: 'var(--foreground)' }} />
          </button>
        )}
        <button
          onClick={onClose || onBack}
          className={`p-1.5 ${!onClose ? 'hidden md:flex' : ''} -ml-1 rounded-lg transition-colors hover:bg-[var(--muted)]`}
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
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--muted)] active:scale-90"
            title="AI 설정"
          >
            <Settings className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg transition-all hover:bg-[var(--muted)] active:scale-90"
              title={isFullscreen ? '축소' : '확대'}
            >
              {isFullscreen
                ? <Minimize2 className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
                : <Maximize2 className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
              }
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-all hover:bg-red-100 hover:text-red-500 active:scale-90"
              title="닫기"
            >
              <X className="w-4.5 h-4.5" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          )}
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
                <button onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))} className="p-2.5 rounded-lg hover:bg-[var(--secondary)]">
                  <Minus className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                </button>
                <span className="text-sm w-7 text-center font-bold" style={{ color: 'var(--foreground)' }}>{addQuantity}</span>
                <button onClick={() => setAddQuantity(addQuantity + 1)} className="p-2.5 rounded-lg hover:bg-[var(--secondary)]">
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
                    <span className="text-sm break-words mr-2 flex-1 min-w-0" style={{ color: 'var(--foreground)' }}>{product.name}</span>
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
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
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

            {/* Result cards - clean minimal design */}
            <div className="space-y-1.5">
              {analyzedItems.map((item, index) => (
                <div
                  key={index}
                  className="rounded-xl overflow-hidden transition-all cursor-pointer active:scale-[0.99]"
                  onClick={() => item.matchedProduct && toggleSelect(index)}
                  style={{
                    backgroundColor: 'var(--card)',
                    boxShadow: item.matchedProduct && item.selected
                      ? '0 0 0 1.5px var(--primary), 0 1px 3px rgba(0,0,0,0.06)'
                      : !item.matchedProduct
                        ? '0 0 0 1.5px var(--destructive), 0 1px 3px rgba(0,0,0,0.06)'
                        : '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Top row: original text + confidence badge */}
                  <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
                    <span className="text-[11px] break-words flex-1 min-w-0" style={{ color: 'var(--muted-foreground)' }}>{item.originalText}</span>
                    {item.confidence && item.matchedProduct && (
                      <span
                        className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: item.confidence === 'high' ? 'var(--success)'
                            : item.confidence === 'medium' ? 'var(--warning)'
                            : 'var(--destructive)',
                        }}
                        title={item.confidence === 'high' ? '확실' : item.confidence === 'medium' ? '추측' : '불확실'}
                      />
                    )}
                  </div>

                  <div className="px-3 pb-2.5">
                    {item.matchedProduct ? (
                      <>
                      <div className="space-y-1.5">
                        {/* Top: checkbox + product name (full width) */}
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSelect(index); }}
                            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all mt-0.5"
                            style={{
                              backgroundColor: item.selected ? 'var(--primary)' : 'var(--secondary)',
                            }}
                          >
                            {item.selected && <Check className="w-3 h-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[13px] break-words leading-snug" style={{ color: 'var(--foreground)' }}>
                              {item.matchedProduct.name}
                            </p>
                          </div>
                        </div>
                        {/* Bottom: price + quantity + actions */}
                        <div className="flex items-center gap-2 ml-[30px]">
                          <p className="text-xs font-bold flex-1" style={{ color: priceType === 'wholesale' ? 'var(--primary)' : 'var(--destructive)' }}>
                            {formatPrice(priceType === 'wholesale' ? item.matchedProduct.wholesale : (item.matchedProduct.retail || item.matchedProduct.wholesale))}
                          </p>
                          <div className="flex items-center gap-0 flex-shrink-0 rounded-lg" style={{ backgroundColor: 'var(--secondary)' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => updateQuantity(index, item.quantity - 1)} className="w-7 h-7 flex items-center justify-center rounded-l-lg hover:bg-[var(--muted)]">
                              <Minus className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                              className="w-7 h-7 text-center text-xs font-bold bg-transparent border-none focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              style={{ color: 'var(--foreground)' }}
                            />
                            <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-7 h-7 flex items-center justify-center rounded-r-lg hover:bg-[var(--muted)]">
                              <Plus className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
                            </button>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                            className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-[var(--secondary)] flex-shrink-0"
                            style={{ color: 'var(--muted-foreground)' }}
                            title="제품 변경"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeItem(index); }}
                            className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-[var(--secondary)] flex-shrink-0"
                            style={{ color: 'var(--muted-foreground)' }}
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Alternatives - minimal chips, no border-t */}
                      {item.alternatives && item.alternatives.length > 0 && item.confidence !== 'high' && (
                        <div className="mt-1.5 ml-7.5 flex items-center gap-1 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>후보:</span>
                          {item.alternatives.map((alt, ai) => (
                            <button
                              key={ai}
                              onClick={(e) => { e.stopPropagation(); selectProduct(index, alt); }}
                              className="px-1.5 py-0.5 text-[10px] rounded-md transition-all hover:bg-[var(--primary)] hover:text-white"
                              style={{ color: 'var(--primary)', backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
                            >
                              {alt.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* 수정 사유 입력 — 제품 수동 교정 직후 표시 */}
                      {showReasonInput === index && (
                        <div className="mt-2 ml-7.5 flex items-center gap-1.5">
                          <input
                            value={correctionReason}
                            onChange={e => setCorrectionReason(e.target.value)}
                            placeholder="수정 사유 (선택)"
                            className="flex-1 px-2 py-1 text-[11px] bg-[var(--background)] border border-blue-500/50 rounded text-[var(--foreground)] placeholder:text-[var(--foreground)]/30"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveReason(index); if (e.key === 'Escape') setShowReasonInput(null); }}
                          />
                          <button onClick={() => saveReason(index)} className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded">저장</button>
                          <button onClick={() => setShowReasonInput(null)} className="px-2 py-1 text-[10px] bg-[var(--secondary)] text-[var(--foreground)] rounded">건너뛰기</button>
                        </div>
                      )}
                      {item.correctionReason && showReasonInput !== index && (
                        <div className="mt-1 ml-7.5 text-[10px] text-blue-400">💡 사유: {item.correctionReason}</div>
                      )}
                      </>
                    ) : (
                      /* Unmatched item - clean */
                      <>
                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}>
                          <X className="w-3 h-3" style={{ color: 'var(--destructive)' }} />
                        </div>
                        <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--destructive)' }}>매칭 실패</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSearchingIndex(searchingIndex === index ? null : index); setSearchQuery(item.searchText); }}
                          className="px-2.5 py-1 text-[11px] rounded-lg font-semibold text-white transition-all active:scale-[0.97]"
                          style={{ backgroundColor: 'var(--primary)' }}
                        >
                          검색
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeItem(index); }}
                          className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-[var(--secondary)] flex-shrink-0"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Alternatives for unmatched - minimal */}
                      {item.alternatives && item.alternatives.length > 0 && (
                        <div className="mt-1.5 ml-7.5 flex items-center gap-1 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>혹시:</span>
                          {item.alternatives.map((alt, ai) => (
                            <button
                              key={ai}
                              onClick={(e) => { e.stopPropagation(); selectProduct(index, alt); }}
                              className="px-1.5 py-0.5 text-[10px] rounded-md transition-all font-medium hover:bg-[var(--primary)] hover:text-white"
                              style={{ color: 'var(--primary)', backgroundColor: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
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
                      <div className="mt-3 p-3 rounded-xl border" onClick={e => e.stopPropagation()} style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--primary)' }}>
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
                                <p className="text-sm font-medium break-words leading-snug" style={{ color: 'var(--foreground)' }}>{product.name}</p>
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
          <div className="rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md overflow-hidden border shadow-2xl animate-modal-up flex flex-col" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', maxHeight: 'calc(100vh - 2rem)' }} onClick={(e) => e.stopPropagation()}>
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
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 modal-scroll-area"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              onTouchMove={(e) => e.stopPropagation()}
            >
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
