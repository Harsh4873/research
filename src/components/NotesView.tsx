import { useMemo } from 'react';
import { BookOpen, Clock, Hash, Layers } from 'lucide-react';
import type { Block, ListBlock, StudyMaterial } from '../model';
import { normalizeKey } from '../lib/extract';
import { InlineRuns } from './Inline';

export function NotesView({ material }: { material: StudyMaterial }) {
  const termKeys = useMemo(() => new Set(material.terms.map((t) => normalizeKey(t.term))), [material]);
  const { stats, outline } = material;

  return (
    <div className="notes-layout">
      {outline.length > 1 && (
        <nav className="outline" aria-label="Outline">
          <div className="outline-label">On this page</div>
          {outline.map((node) => (
            <button
              key={node.id}
              type="button"
              className="outline-link"
              data-depth={node.depth}
              onClick={() => document.getElementById(`h-${node.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {node.title}
            </button>
          ))}
        </nav>
      )}

      <div className="notes-main">
        <div className="stat-chips">
          <span className="meta-chip">
            <Clock size={14} aria-hidden /> {stats.readingMinutes} min read
          </span>
          <span className="meta-chip">
            <Hash size={14} aria-hidden /> {stats.words.toLocaleString()} words
          </span>
          <span className="meta-chip">
            <BookOpen size={14} aria-hidden /> {stats.terms} terms
          </span>
          <span className="meta-chip">
            <Layers size={14} aria-hidden /> {stats.clozes} blanks
          </span>
        </div>

        <article className="article">
          {material.doc.blocks.map((block, i) => (
            <BlockView key={i} block={block} termKeys={termKeys} />
          ))}
        </article>

        {material.terms.length > 0 && (
          <section className="glossary" aria-label="Key terms">
            <h2 className="glossary-title">Key terms</h2>
            <div className="glossary-grid">
              {material.terms.map((term) => (
                <div key={term.id} className="glossary-item">
                  <div className="glossary-term">{term.term}</div>
                  <div className="glossary-def">{term.definition}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BlockView({ block, termKeys }: { block: Block; termKeys: Set<string> }) {
  switch (block.type) {
    case 'heading': {
      const depth = Math.min(6, block.depth + 1);
      const Tag = `h${depth}` as 'h2';
      return (
        <Tag id={`h-${block.id}`}>
          <InlineRuns runs={block.inlines} termKeys={termKeys} />
        </Tag>
      );
    }
    case 'para':
      return (
        <p>
          <InlineRuns runs={block.inlines} termKeys={termKeys} />
        </p>
      );
    case 'list':
      return <ListView list={block} termKeys={termKeys} />;
    case 'table':
      return (
        <div className="table-scroll">
          <table className="doc-table">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
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
          {block.blocks.map((child, i) => (
            <BlockView key={i} block={child} termKeys={termKeys} />
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

function ListView({ list, termKeys }: { list: ListBlock; termKeys: Set<string> }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {list.items.map((item, i) => (
        <li key={i}>
          <InlineRuns runs={item.inlines} termKeys={termKeys} />
          {item.children && <ListView list={item.children} termKeys={termKeys} />}
        </li>
      ))}
    </Tag>
  );
}
