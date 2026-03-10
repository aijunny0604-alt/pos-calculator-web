import { useState, useCallback, useEffect } from 'react';

export default function useKeyboardNav(items = [], onSelect, isVisible) {
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Reset when items change or dropdown closes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [isVisible]);

  const handleKeyDown = useCallback((e) => {
    if (!isVisible || !items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      onSelect(items[highlightIndex]);
      setHighlightIndex(-1);
    }
  }, [isVisible, items, highlightIndex, onSelect]);

  return { highlightIndex, handleKeyDown, setHighlightIndex };
}
