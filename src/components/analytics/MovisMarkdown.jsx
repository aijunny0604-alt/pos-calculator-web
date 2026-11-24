import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import ViewportModal from '@/components/ui/ViewportModal';
import './movis-result-preview.css';

const PREVIEW_LIMIT = 3;
const LIST_MARKER = /^([-*+]|\d+[.)])\s+/;

// React text nodes keep model output inert.
function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function parseBlocks(content) {
  const lines = String(content).split(/\r?\n/);
  const blocks = [];
  const cells = line => {
    const values = [''];
    for (const part of line.trim().split(/(\\\||\|)/)) {
      if (part === '|') values.push('');
      else values[values.length - 1] += part === '\\|' ? '|' : part;
    }
    if (values.length > 1 && values[0] === '') values.shift();
    if (values.length > 1 && values.at(-1) === '') values.pop();
    return values.map(cell => cell.trim());
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index++].trim();
    if (!line) {
      blocks.push({ type: 'gap' });
    } else if (line.includes('|') && /^\s*\|?\s*:?-{3}/.test(lines[index] || '')) {
      const rows = [];
      index++;
      while (lines[index]?.includes('|')) rows.push(cells(lines[index++]));
      blocks.push({ type: 'table', headings: cells(line), rows });
    } else if (LIST_MARKER.test(line)) {
      const ordered = /^\d/.test(line);
      const rows = [];
      let item = line;
      const sameList = text => LIST_MARKER.test(text) && /^\d/.test(text) === ordered;
      while (sameList(item)) {
        const [prefix, marker] = item.match(LIST_MARKER);
        const text = [item.slice(prefix.length)];
        while (/^\s{2,}\S/.test(lines[index] || '') && !LIST_MARKER.test(lines[index].trim())) {
          text.push(lines[index++].trim());
        }
        rows.push({ marker, text: text.join(' ') });
        let next = index;
        while (next < lines.length && !lines[next].trim()) next++;
        item = lines[next]?.trim() || '';
        if (sameList(item)) index = next + 1;
      }
      blocks.push({ type: 'list', ordered, rows });
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push({ type: 'heading', text: line.replace(/^#+\s/, '') });
    } else {
      blocks.push({ type: 'paragraph', text: line });
    }
  }
  return blocks;
}

function ResultContent({ block, preview }) {
  const rows = preview ? block.rows.slice(0, PREVIEW_LIMIT) : block.rows;

  if (block.type === 'table') {
    return <table>
      <thead><tr>{block.headings.map((heading, index) => <th scope="col" key={index}><span>{inline(heading)}</span></th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>
        {row.map((cell, column) => <td key={column}><span>{inline(cell)}</span></td>)}
      </tr>)}</tbody>
    </table>;
  }

  const List = block.ordered ? 'ol' : 'ul';
  return <List className="movis-result-list" role="list">
    {rows.map(({ marker, text }, index) => <li className="movis-list-item" key={index}>
      <span aria-hidden={!block.ordered}>{block.ordered ? marker : '•'}</span><span>{inline(text)}</span>
    </li>)}
  </List>;
}

function ResultDialog({ block, onClose, trigger }) {
  const titleId = useId();
  const close = useRef(null);
  const body = useRef(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger]);

  const handleKeyDown = event => {
    if (event.key === 'Escape' && !event.isComposing && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === close.current ? body : close).current?.focus();
    }
  };

  const label = block.type === 'table' ? '표' : '목록';
  return <ViewportModal className="move-dialog-backdrop movis-result-backdrop fixed inset-0 z-[110] flex items-center justify-center"
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="move-dialog movis-result-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <header className="movis-result-dialog-header">
        <div><h2 id={titleId}>{label} 전체 보기</h2><p>총 {block.rows.length}개 항목</p></div>
        <button ref={close} type="button" onClick={onClose} aria-label="닫기"><X size={20} /></button>
      </header>
      <div ref={body} className="movis-markdown movis-result-dialog-body overflow-y-auto" tabIndex={0} role="region" aria-label={`${label} 내용`}>
        <ResultContent block={block} />
      </div>
    </section>
  </ViewportModal>;
}

export default function MovisMarkdown({ content = '', expandable = false, compact = expandable }) {
  const [open, setOpen] = useState(null);
  useEffect(() => { if (!expandable) setOpen(null); }, [expandable]);

  return <div className="movis-markdown">
    {parseBlocks(content).map((block, index) => {
      if (block.type === 'gap') return <div key={index} className="movis-paragraph-gap" />;
      if (block.type === 'heading') return <h3 key={index}>{inline(block.text)}</h3>;
      if (block.type === 'paragraph') return <p key={index}>{inline(block.text)}</p>;

      const label = block.type === 'table' ? '표' : '목록';
      const canOpen = expandable && block.rows.length > 0;
      const clipped = compact && block.rows.length > PREVIEW_LIMIT;
      return <div key={index} className={`movis-result-preview ${compact ? 'is-compact' : ''} ${canOpen ? 'is-expandable' : ''}`}>
        <div className={block.type === 'table' ? 'movis-table-scroll' : undefined}
          role={block.type === 'table' ? 'region' : undefined} aria-label={block.type === 'table' ? '답변 표' : undefined}
          tabIndex={block.type === 'table' ? 0 : undefined}
          onClick={canOpen ? event => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
            setOpen({ block, trigger: event.currentTarget.nextElementSibling });
          } : undefined}>
          <ResultContent block={block} preview={compact} />
        </div>
        {canOpen && <button className="movis-result-expand" type="button" aria-haspopup="dialog"
          onClick={event => setOpen({ block, trigger: event.currentTarget })}>
          <span><Maximize2 size={15} />{label} 전체 보기</span>
          {clipped && <small>총 {block.rows.length}개</small>}
        </button>}
      </div>;
    })}
    {expandable && open && <ResultDialog block={open.block} trigger={open.trigger} onClose={() => setOpen(null)} />}
  </div>;
}
