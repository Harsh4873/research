import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import type { Block, ListBlock, ParsedDoc } from '../model';
import { findQuotePage } from '../lib/locate-quote';
import { InlineRuns } from './Inline';
import type { LocateRequest } from './PdfPane';

function listText(list: ListBlock): string {
  return list.items
    .map((item) => [item.text, item.children ? listText(item.children) : ''].filter(Boolean).join(' '))
    .join(' ');
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'para':
      return block.text;
    case 'list':
      return listText(block);
    case 'table':
      return [block.header.join(' '), ...block.rows.map((row) => row.join(' '))].join(' ');
    case 'quote':
      return block.blocks.map(blockText).join(' ');
    case 'code':
      return block.code;
    default:
      return '';
  }
}

function ArticleBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const depth = Math.min(6, block.depth + 1);
      const Tag = `h${depth}` as 'h2';
      return (
        <Tag>
          <InlineRuns runs={block.inlines} />
        </Tag>
      );
    }
    case 'para':
      return (
        <p>
          <InlineRuns runs={block.inlines} />
        </p>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineRuns runs={item.inlines} />
              {item.children && <ArticleBlock block={item.children} />}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div className="table-scroll">
          <table className="doc-table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'quote':
      return (
        <blockquote>
          {block.blocks.map((child, index) => (
            <ArticleBlock key={index} block={child} />
          ))}
        </blockquote>
      );
    case 'code':
      return (
        <pre>
          <code>{block.code}</code>
        </pre>
      );
    case 'rule':
      return <hr />;
    default:
      return null;
  }
}

export function ArticlePane({
  doc,
  locate,
  status,
  onFile,
}: {
  doc: ParsedDoc;
  locate: LocateRequest | null;
  status: 'loading' | 'checking' | 'ready' | 'missing';
  onFile: (file: File) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [miss, setMiss] = useState(false);

  useEffect(() => {
    if (!locate) return;
    const root = rootRef.current;
    if (!root) return;
    const blocks = [...root.querySelectorAll<HTMLElement>('[data-text]')];
    const texts = blocks.map((element) => element.dataset.text ?? '');
    const index = findQuotePage(texts, locate.text);
    blocks.forEach((element, blockIndex) => element.classList.toggle('source-hit', blockIndex === index));
    setMiss(index < 0);
    if (index >= 0) blocks[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [locate]);

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return;
    onFile(file);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    take(event.dataTransfer.files[0]);
  };

  return (
    <div
      className={`article-pane ${dragOver ? 'article-pane-drop' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="article-attach">
        <FileUp size={16} aria-hidden />
        <span>
          {status === 'checking' ? 'Looking for an open-access PDF… ' : 'No PDF on this device yet. '}
          <button type="button" className="link-btn" onClick={() => inputRef.current?.click()}>
            Add the PDF
          </button>{' '}
          to scroll the original. Citations still jump in this text.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {miss && (
        <p className="locate-miss" role="status">
          That line isn’t in the extracted text.
        </p>
      )}
      <article className="article" ref={rootRef}>
        {doc.blocks.map((block, index) => {
          const text = blockText(block);
          if (!text.trim()) {
            return <ArticleBlock key={index} block={block} />;
          }
          return (
            <div key={index} data-text={text}>
              <ArticleBlock block={block} />
            </div>
          );
        })}
      </article>
    </div>
  );
}
