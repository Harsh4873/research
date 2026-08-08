import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Hash,
  Image,
  Quote,
  Search,
  Sigma,
  Table2,
  X,
} from 'lucide-react';
import type { ParsedDoc, TableBlock } from '../model';
import {
  buildPaperViews,
  collectNumbers,
  searchPaper,
  type ClaimItem,
  type SearchHit,
} from '../lib/paper-view';
import { copyText } from '../lib/clipboard';
import { PaperImage } from './Inline';

function jumpToNotes(setId: string, headingId?: string) {
  window.location.hash = `/set/${setId}/notes`;
  if (!headingId) return;
  window.setTimeout(() => {
    document.getElementById(`h-${headingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

function DocTable({ block }: { block: TableBlock }) {
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
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${done ? 'btn-success' : 'btn-ghost'}`}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {done ? 'Copied' : label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Data — tables, equations, figures, supplements, availability
 * ------------------------------------------------------------------ */

export function DataView({ doc, pmcid, setId }: { doc: ParsedDoc; pmcid?: string; setId: string }) {
  const views = useMemo(() => buildPaperViews(doc, pmcid), [doc, pmcid]);
  const { tables, equations, figures, supplements, availability } = views;
  const empty =
    tables.length === 0 && equations.length === 0 && figures.length === 0 && supplements.length === 0 && availability.length === 0;

  if (empty) {
    return (
      <div className="mode-empty">
        <p>This paper has no machine-readable tables, equations, figures, or supplementary files.</p>
      </div>
    );
  }

  return (
    <div className="paper-pane fade-in">
      <nav className="pane-jump" aria-label="Jump to">
        {supplements.length > 0 && <a href="#d-supp">{supplements.length} supplementary</a>}
        {tables.length > 0 && <a href="#d-tables">{tables.length} tables</a>}
        {figures.length > 0 && <a href="#d-figures">{figures.length} figures</a>}
        {equations.length > 0 && <a href="#d-equations">{equations.length} equations</a>}
        {availability.length > 0 && <a href="#d-availability">availability</a>}
      </nav>

      {supplements.length > 0 && (
        <section id="d-supp" className="pane-section">
          <h2 className="pane-title">
            <FileSpreadsheet size={18} aria-hidden /> Supplementary files
          </h2>
          <div className="supp-grid">
            {supplements.map((item, i) => (
              <div key={i} className="supp-card">
                <div className="supp-head">
                  <span className="supp-name">{item.name}</span>
                  {item.href ? (
                    <a className="btn btn-sm" href={item.href} target="_blank" rel="noreferrer noopener">
                      Open <ExternalLink size={13} aria-hidden />
                    </a>
                  ) : (
                    item.file && <span className="meta-chip">{item.file}</span>
                  )}
                </div>
                {item.description && <p className="supp-desc">{item.description}</p>}
                {item.href && item.file && <span className="supp-file">{item.file}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {tables.length > 0 && (
        <section id="d-tables" className="pane-section">
          <h2 className="pane-title">
            <Table2 size={18} aria-hidden /> Tables
          </h2>
          {tables.map((table, i) => (
            <figure key={i} className="data-figure">
              <figcaption>
                <strong>{table.label}</strong>
                {table.caption ? ` ${table.caption}` : ''}
                <span className="data-section">{table.section}</span>
              </figcaption>
              {table.block ? (
                <DocTable block={table.block} />
              ) : (
                <p className="figure-fallback-block">
                  {table.note || 'This table is not in the machine-readable full text.'}
                  {table.link ? (
                    <>
                      {' '}
                      <a href={table.link} target="_blank" rel="noreferrer noopener">
                        Read it in the article <ExternalLink size={12} aria-hidden />
                      </a>
                    </>
                  ) : null}
                </p>
              )}
              <div className="data-actions">
                {table.block ? (
                  <CopyButton
                    label="Copy as TSV"
                    text={[table.block.header, ...table.block.rows].map((row) => row.join('\t')).join('\n')}
                  />
                ) : null}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpToNotes(setId)}>
                  In context <ArrowUpRight size={13} aria-hidden />
                </button>
              </div>
            </figure>
          ))}
        </section>
      )}

      {figures.length > 0 && (
        <section id="d-figures" className="pane-section">
          <h2 className="pane-title">
            <Image size={18} aria-hidden /> Figures
          </h2>
          <div className="figure-grid">
            {figures.map((figure, i) => (
              <div key={i} className="figure-card">
                <div className="figure-label">{figure.label}</div>
                {figure.image ? <PaperImage src={figure.image} alt={figure.label} /> : null}
                <p className="figure-caption">{figure.caption || 'No caption was published with this figure.'}</p>
                <div className="figure-card-foot">
                  <span className="data-section">{figure.section}</span>
                  {!figure.image && (figure.link || pmcid) ? (
                    <a
                      href={figure.link ?? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {pmcid && figures.every((figure) => !figure.image) && (
            <p className="pane-note">
              This article's artwork is not published with its machine-readable text.{' '}
              <a href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`} target="_blank" rel="noreferrer noopener">
                View the figures in the article <ExternalLink size={12} aria-hidden />
              </a>
            </p>
          )}
        </section>
      )}

      {equations.length > 0 && (
        <section id="d-equations" className="pane-section">
          <h2 className="pane-title">
            <Sigma size={18} aria-hidden /> Equations
          </h2>
          {equations.map((equation, i) => (
            <figure key={i} className="data-figure">
              <figcaption>
                <strong>{equation.label}</strong>
                <span className="data-section">{equation.section}</span>
              </figcaption>
              <pre className="equation-block">
                <code>{equation.code}</code>
              </pre>
              <div className="data-actions">
                <CopyButton text={equation.code} />
              </div>
            </figure>
          ))}
        </section>
      )}

      {availability.length > 0 && (
        <section id="d-availability" className="pane-section">
          <h2 className="pane-title">
            <Database size={18} aria-hidden /> Data availability
          </h2>
          {availability.map((item, i) => (
            <div key={i} className="availability-card">
              <div className="availability-title">{item.title}</div>
              <p>{item.text}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Claims — what the paper says it found
 * ------------------------------------------------------------------ */

const CLAIM_FILTERS: Array<{ key: 'all' | ClaimItem['kind']; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'finding', label: 'Findings' },
  { key: 'conclusion', label: 'Conclusions' },
  { key: 'quantified', label: 'Quantified' },
];

function highlight(text: string, ranges: Array<[number, number]>) {
  if (ranges.length === 0) return text;
  const parts: Array<string | JSX.Element> = [];
  let last = 0;
  ranges.forEach(([start, end], i) => {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark key={i} className="hit-mark">
        {text.slice(start, end)}
      </mark>,
    );
    last = end;
  });
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ClaimsView({ doc, pmcid, setId }: { doc: ParsedDoc; pmcid?: string; setId: string }) {
  const views = useMemo(() => buildPaperViews(doc, pmcid), [doc, pmcid]);
  const [filter, setFilter] = useState<'all' | ClaimItem['kind']>('all');
  const claims = views.claims.filter((claim) => filter === 'all' || claim.kind === filter);

  if (views.claims.length === 0) {
    return (
      <div className="mode-empty">
        <p>
          No explicit claims were found. This paper may be a review or a resource description rather than a study
          reporting findings — the Skim tab is the faster way through it.
        </p>
      </div>
    );
  }

  return (
    <div className="paper-pane fade-in">
      <div className="mode-toolbar">
        <div className="toolbar-group" role="group" aria-label="Claim type">
          {CLAIM_FILTERS.map((option) => {
            const count =
              option.key === 'all' ? views.claims.length : views.claims.filter((c) => c.kind === option.key).length;
            if (count === 0 && option.key !== 'all') return null;
            return (
              <button
                key={option.key}
                type="button"
                className={`chip ${filter === option.key ? 'chip-active' : ''}`}
                onClick={() => setFilter(option.key)}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>
        <CopyButton label="Copy all" text={claims.map((c) => `• ${c.text}`).join('\n')} />
      </div>

      <ol className="claim-list">
        {claims.map((claim, i) => {
          const at = claim.text.toLowerCase().indexOf(claim.trigger.toLowerCase());
          const ranges: Array<[number, number]> = at >= 0 ? [[at, at + claim.trigger.length]] : [];
          return (
            <li key={i} className={`claim-card claim-${claim.kind}`}>
              <p className="claim-text">{highlight(claim.text, ranges)}</p>
              <div className="claim-foot">
                <span className={`claim-kind claim-kind-${claim.kind}`}>{claim.kind}</span>
                <button type="button" className="claim-section" onClick={() => jumpToNotes(setId)}>
                  {claim.section} <ArrowUpRight size={12} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Find — search text and numbers
 * ------------------------------------------------------------------ */

export function FindView({ doc, setId }: { doc: ParsedDoc; setId: string }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'text' | 'numbers'>('text');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hits: SearchHit[] = useMemo(() => (mode === 'text' ? searchPaper(doc, query) : []), [doc, query, mode]);
  const numbers = useMemo(() => (mode === 'numbers' ? collectNumbers(doc) : []), [doc, mode]);
  const filteredNumbers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return numbers;
    return numbers.filter((n) => n.value.toLowerCase().includes(needle) || n.text.toLowerCase().includes(needle));
  }, [numbers, query]);

  const total = mode === 'text' ? hits.reduce((sum, hit) => sum + hit.ranges.length, 0) : filteredNumbers.length;

  return (
    <div className="paper-pane fade-in">
      <div className="find-bar">
        <div className="review-search-field">
          <Search size={17} aria-hidden />
          <input
            ref={inputRef}
            className="input review-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === 'text' ? 'Find any word, phrase, or value…' : 'Filter the numbers…'}
            aria-label="Search this paper"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="find-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
        <div className="toolbar-group" role="group" aria-label="Search mode">
          <button
            type="button"
            className={`chip ${mode === 'text' ? 'chip-active' : ''}`}
            onClick={() => setMode('text')}
          >
            Text
          </button>
          <button
            type="button"
            className={`chip ${mode === 'numbers' ? 'chip-active' : ''}`}
            onClick={() => setMode('numbers')}
          >
            <Hash size={13} aria-hidden /> Numbers
          </button>
        </div>
      </div>

      <p className="find-count">
        {mode === 'text' && query.trim().length < 2
          ? 'Type at least two characters.'
          : `${total} ${mode === 'text' ? (total === 1 ? 'match' : 'matches') : total === 1 ? 'value' : 'values'}${
              mode === 'text' ? ` in ${hits.length} ${hits.length === 1 ? 'block' : 'blocks'}` : ''
            }`}
      </p>

      {mode === 'text' ? (
        <ol className="hit-list">
          {hits.map((hit, i) => (
            <li key={i} className="hit-card">
              <div className="hit-section">{hit.section}</div>
              <p className="hit-text">{highlight(hit.text, hit.ranges)}</p>
              <button type="button" className="claim-section" onClick={() => jumpToNotes(setId)}>
                Open in Notes <ArrowUpRight size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="hit-list">
          {filteredNumbers.map((item, i) => (
            <li key={i} className="hit-card">
              <div className="number-row">
                <span className="number-value">{item.value}</span>
                <span className="hit-section">{item.section}</span>
              </div>
              <p className="hit-text">{item.text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Skim — read the paper fast
 * ------------------------------------------------------------------ */

export function SkimView({ doc, pmcid, setId }: { doc: ParsedDoc; pmcid?: string; setId: string }) {
  const views = useMemo(() => buildPaperViews(doc, pmcid), [doc, pmcid]);
  const sections = views.skim.filter((section) => section.gist || section.numbers.length > 0);

  if (sections.length === 0) {
    return (
      <div className="mode-empty">
        <p>This paper is too short to skim — read it on the Notes tab.</p>
      </div>
    );
  }

  const topClaims = views.claims.slice(0, 5);

  return (
    <div className="paper-pane fade-in">
      {topClaims.length > 0 && (
        <section className="pane-section">
          <h2 className="pane-title">
            <Quote size={18} aria-hidden /> The short version
          </h2>
          <ul className="skim-claims">
            {topClaims.map((claim, i) => (
              <li key={i}>{claim.text}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="pane-section">
        <h2 className="pane-title">Section by section</h2>
        <div className="skim-list">
          {sections.map((section, i) => (
            <button key={i} type="button" className="skim-card" onClick={() => jumpToNotes(setId, section.id)}>
              <div className="skim-head">
                <span className="skim-title" data-depth={section.depth}>
                  {section.title}
                </span>
                <span className="skim-words">{section.words} words</span>
              </div>
              {section.gist && <p className="skim-gist">{section.gist}</p>}
              {section.numbers.length > 0 && (
                <div className="skim-numbers">
                  {section.numbers.map((value, j) => (
                    <span key={j} className="number-chip">
                      {value}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
