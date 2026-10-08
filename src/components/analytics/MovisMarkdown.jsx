import { Fragment } from 'react';

// React text nodes keep product names and model output inert (no raw HTML injection).
function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>);
}
export default function MovisMarkdown({
  content = ''
}) {
  const lines = String(content).split(/\r?\n/),
    blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      blocks.push(<div key={i} className="movis-paragraph-gap" />);
      continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3}/.test(lines[i + 1] || '')) {
      const cells = s => s.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
      const head = cells(line),
        rows = [];
      i += 2;
      for (; i < lines.length && lines[i].includes('|'); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push(<div className="movis-table-scroll" key={i} tabIndex={0} role="region" aria-label="답변 표"><table><thead><tr>{head.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead><tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={i}>{inline(line.replace(/^#+\s/, ''))}</h3>);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      blocks.push(<div className="movis-list-item" key={i}><span>•</span><span>{inline(line.slice(2))}</span></div>);
      continue;
    }
    blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="movis-markdown">{blocks}</div>;
}
