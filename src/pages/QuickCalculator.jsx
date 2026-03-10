import { useState, useEffect, useRef } from 'react';
import { Calculator, X } from 'lucide-react';

export default function QuickCalculator({ onClose, initialValue = null }) {
  const [display, setDisplay] = useState(
    initialValue !== null && initialValue !== undefined ? String(initialValue) : '0'
  );
  const [previousValue, setPreviousValue] = useState(null);
  const [operation, setOperation] = useState(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState(
    initialValue !== null && initialValue !== undefined
      ? [`초기값: ${initialValue.toLocaleString()}원`]
      : []
  );

  useEffect(() => {
    if (initialValue !== null && initialValue !== undefined) {
      setDisplay(String(initialValue));
      setHistory([`초기값: ${initialValue.toLocaleString()}원`]);
    }
  }, [initialValue]);

  // Refs for stable keyboard handler access
  const inputDigitRef = useRef();
  const inputDotRef = useRef();
  const performOperationRef = useRef();
  const backspaceRef = useRef();
  const clearRef = useRef();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        performOperationRef.current('=');
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        inputDigitRef.current(e.key);
        return;
      }
      if (e.key === '.') { inputDotRef.current(); return; }
      if (e.key === '+') performOperationRef.current('+');
      if (e.key === '-') performOperationRef.current('-');
      if (e.key === '*') performOperationRef.current('×');
      if (e.key === '/') { e.preventDefault(); performOperationRef.current('÷'); }
      if (e.key === 'Backspace') backspaceRef.current();
      if (e.key === 'c' || e.key === 'C') clearRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const inputDigit = (digit) => {
    setDisplay((prev) => {
      if (waitingForOperand) {
        setWaitingForOperand(false);
        return digit;
      }
      return prev === '0' ? digit : prev + digit;
    });
  };

  const inputDot = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev.includes('.') ? prev : prev + '.'));
  };

  const performOperation = (nextOperation) => {
    const inputValue = parseFloat(display);
    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue || 0;
      let newValue;
      switch (operation) {
        case '+': newValue = currentValue + inputValue; break;
        case '-': newValue = currentValue - inputValue; break;
        case '×': newValue = currentValue * inputValue; break;
        case '÷': newValue = inputValue !== 0 ? currentValue / inputValue : 'Error'; break;
        default: newValue = inputValue;
      }
      if (nextOperation === '=') {
        setHistory((prev) => [
          ...prev.slice(-4),
          `${currentValue} ${operation} ${inputValue} = ${newValue}`,
        ]);
      }
      setDisplay(String(newValue));
      setPreviousValue(nextOperation === '=' ? null : newValue);
    }
    setWaitingForOperand(true);
    setOperation(nextOperation === '=' ? null : nextOperation);
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const allClear = () => {
    clear();
    setHistory([]);
  };

  const toggleSign = () => {
    setDisplay((prev) => String(parseFloat(prev) * -1));
  };

  const percentage = () => {
    setDisplay((prev) => String(parseFloat(prev) / 100));
  };

  const backspace = () => {
    setDisplay((prev) => {
      if (prev.length === 1 || (prev.length === 2 && prev[0] === '-')) return '0';
      return prev.slice(0, -1);
    });
  };

  // Update refs
  inputDigitRef.current = inputDigit;
  inputDotRef.current = inputDot;
  performOperationRef.current = performOperation;
  backspaceRef.current = backspace;
  clearRef.current = clear;

  const formatNumber = (num) => {
    const number = parseFloat(num);
    if (isNaN(number)) return num;
    if (num.includes('.') && num.endsWith('.')) return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return number.toLocaleString('ko-KR', { maximumFractionDigits: 10 });
  };

  const NumBtn = ({ label, onClick, variant = 'num', active = false, wide = false }) => {
    const base = 'rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center text-lg h-14 w-full';
    const variants = {
      num: 'hover:opacity-80',
      op: 'hover:opacity-80',
      func: 'hover:opacity-80',
      eq: 'hover:opacity-80',
    };
    const styles = {
      num: { backgroundColor: 'var(--secondary)', color: 'var(--foreground)' },
      op: { backgroundColor: 'var(--warning)', color: 'white' },
      func: { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' },
      eq: { backgroundColor: 'var(--success)', color: 'white' },
    };
    return (
      <button
        onClick={onClick}
        className={`${base} ${variants[variant]} ${wide ? 'col-span-2' : ''} ${active ? 'ring-2 ring-white' : ''}`}
        style={styles[variant]}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4 animate-modal-backdrop"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden border shadow-2xl animate-modal-up"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: 'var(--warning)', color: 'white' }}
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            <span className="font-bold text-sm">비상용 계산기</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div
            className="px-4 py-2 max-h-20 overflow-y-auto"
            style={{ backgroundColor: 'var(--secondary)' }}
          >
            {history.map((h, i) => (
              <p key={i} className="text-xs text-right" style={{ color: 'var(--muted-foreground)' }}>
                {h}
              </p>
            ))}
          </div>
        )}

        {/* Display */}
        <div className="px-4 py-5" style={{ backgroundColor: 'var(--secondary)' }}>
          <div className="text-right">
            {previousValue !== null && operation && (
              <p className="text-sm mb-1" style={{ color: 'var(--muted-foreground)' }}>
                {formatNumber(String(previousValue))} {operation}
              </p>
            )}
            <p className="text-4xl font-bold truncate" style={{ color: 'var(--foreground)' }}>
              {formatNumber(display)}
            </p>
          </div>
        </div>

        {/* Button pad */}
        <div className="p-3 grid grid-cols-4 gap-2">
          <NumBtn label="AC" onClick={allClear} variant="func" />
          <NumBtn label="±" onClick={toggleSign} variant="func" />
          <NumBtn label="%" onClick={percentage} variant="func" />
          <NumBtn label="÷" onClick={() => performOperation('÷')} variant="op" active={operation === '÷'} />

          <NumBtn label="7" onClick={() => inputDigit('7')} variant="num" />
          <NumBtn label="8" onClick={() => inputDigit('8')} variant="num" />
          <NumBtn label="9" onClick={() => inputDigit('9')} variant="num" />
          <NumBtn label="×" onClick={() => performOperation('×')} variant="op" active={operation === '×'} />

          <NumBtn label="4" onClick={() => inputDigit('4')} variant="num" />
          <NumBtn label="5" onClick={() => inputDigit('5')} variant="num" />
          <NumBtn label="6" onClick={() => inputDigit('6')} variant="num" />
          <NumBtn label="−" onClick={() => performOperation('-')} variant="op" active={operation === '-'} />

          <NumBtn label="1" onClick={() => inputDigit('1')} variant="num" />
          <NumBtn label="2" onClick={() => inputDigit('2')} variant="num" />
          <NumBtn label="3" onClick={() => inputDigit('3')} variant="num" />
          <NumBtn label="+" onClick={() => performOperation('+')} variant="op" active={operation === '+'} />

          <NumBtn label="0" onClick={() => inputDigit('0')} variant="num" />
          <NumBtn label="⌫" onClick={backspace} variant="func" />
          <NumBtn label="." onClick={inputDot} variant="num" />
          <NumBtn label="=" onClick={() => performOperation('=')} variant="eq" />
        </div>

        {/* Quick calculations */}
        <div className="px-3 pb-3 grid grid-cols-4 gap-2">
          <button
            onClick={() => setDisplay(String(Math.round(parseFloat(display) * 1.1)))}
            className="py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--primary)' }}
          >
            +10% 부가세
          </button>
          <button
            onClick={() => setDisplay(String(Math.round(parseFloat(display) / 1.1)))}
            className="py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'color-mix(in srgb, var(--purple) 15%, transparent)', color: 'var(--purple)' }}
          >
            공급가액
          </button>
          <button
            onClick={() => {
              const val = parseFloat(display);
              const supply = Math.round(val / 1.1);
              const vat = val - supply;
              setHistory((prev) => [
                ...prev.slice(-4),
                `${formatNumber(String(val))} → 공급가: ${formatNumber(String(supply))}, 부가세: ${formatNumber(String(vat))}`,
              ]);
            }}
            className="py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--success)' }}
          >
            세금계산
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(display.replace(/,/g, ''))}
            className="py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--secondary)', color: 'var(--muted-foreground)' }}
          >
            복사
          </button>
        </div>
      </div>
    </div>
  );
}
