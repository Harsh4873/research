import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Clock,
  Copy,
  Hash,
  Layers,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  Square,
  Volume2,
} from 'lucide-react';
import type { Block, ListBlock, StudyMaterial } from '../model';
import { normalizeKey } from '../lib/extract';
import { useSpeechInput } from '../lib/speech';
import { speakableSegments, useReadAloud } from '../lib/readaloud';
import { copyText } from '../lib/clipboard';
import { InlineRuns } from './Inline';

const READING_RATES = [0.75, 1, 1.25, 1.5];

interface NotesViewProps {
  material: StudyMaterial;
  markdown: string;
  onAddNote: (note: string) => void;
}

export function NotesView({ material, markdown, onAddNote }: NotesViewProps) {
  const termKeys = useMemo(() => new Set(material.terms.map((t) => normalizeKey(t.term))), [material]);
  const { stats, outline } = material;

  const segments = useMemo(() => speakableSegments(material.doc.blocks), [material]);
  const reader = useReadAloud(segments);
  const activeHeading = useScrollSpy(outline.map((o) => o.id));

  // Follow along: keep the sentence being read comfortably in view.
  useEffect(() => {
    if (reader.status !== 'playing' || reader.activeBlock < 0) return;
    const el = document.getElementById(`b-${reader.activeBlock}`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [reader.activeBlock, reader.status]);

  return (
    <div className="notes-layout">
      {outline.length > 1 && (
        <nav className="outline" aria-label="Outline">
          <div className="outline-label">On this page</div>
          {outline.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`outline-link ${activeHeading === node.id ? 'outline-link-active' : ''}`}
              data-depth={node.depth}
              onClick={() => document.getElementById(`h-${node.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {node.title}
            </button>
          ))}
        </nav>
      )}

      <div className="notes-main">
        <NoteComposer onAdd={onAddNote} />

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

        <ReadingToolbar reader={reader} markdown={markdown} hasSegments={segments.length > 0} />

        <article className={`article ${reader.status !== 'idle' ? 'is-reading' : ''}`}>
          {material.doc.blocks.map((block, i) => (
            <BlockView key={i} block={block} index={i} activeBlock={reader.activeBlock} termKeys={termKeys} />
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

function ReadingToolbar({
  reader,
  markdown,
  hasSegments,
}: {
  reader: ReturnType<typeof useReadAloud>;
  markdown: string;
  hasSegments: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const active = reader.status !== 'idle';

  const copy = async () => {
    const ok = await copyText(markdown);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={`reading-bar ${active ? 'reading-bar-active' : ''}`}>
      <div className="reading-controls">
        {reader.supported && hasSegments ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={reader.toggle}>
            {reader.status === 'playing' ? (
              <>
                <Pause size={15} aria-hidden /> Pause
              </>
            ) : (
              <>
                {reader.status === 'paused' ? <Play size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
                {reader.status === 'paused' ? 'Resume' : 'Listen'}
              </>
            )}
          </button>
        ) : (
          <span className="reading-hint">
            <Volume2 size={14} aria-hidden /> Read-aloud isn’t available in this browser.
          </span>
        )}

        {active && (
          <>
            <button type="button" className="icon-btn icon-btn-sm" onClick={reader.stop} aria-label="Stop reading" title="Stop">
              <Square size={14} aria-hidden />
            </button>
            <div className="rate-group" role="group" aria-label="Reading speed">
              {READING_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`rate-chip ${reader.rate === r ? 'rate-chip-active' : ''}`}
                  onClick={() => reader.setRate(r)}
                >
                  {r}×
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button type="button" className={`btn btn-sm ${copied ? 'btn-success' : ''}`} onClick={copy}>
        {copied ? (
          <>
            <Check size={15} aria-hidden /> Copied
          </>
        ) : (
          <>
            <Copy size={15} aria-hidden /> Copy markdown
          </>
        )}
      </button>

      {active && (
        <div className="reading-progress" aria-hidden>
          <div className="reading-progress-fill" style={{ width: `${Math.round(reader.progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Highlight the outline entry for the heading nearest the top of the viewport. */
function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');

  useEffect(() => {
    if (ids.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace(/^h-/, '');
          if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top);
          else visible.delete(id);
        }
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActive(top);
        }
      },
      { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(`h-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

function NoteComposer({ onAdd }: { onAdd: (note: string) => void }) {
  const [body, setBody] = useState('');
  const speech = useSpeechInput(body, setBody);

  const submit = () => {
    if (!body.trim()) return;
    speech.stop();
    onAdd(body.trim());
    setBody('');
  };

  return (
    <section className={`note-composer ${speech.listening ? 'is-listening' : ''}`} aria-label="Add a note">
      <div className="note-composer-heading">
        <div>
          <strong>Add to these notes</strong>
          <span>Type an idea, question, or summary—or dictate it.</span>
        </div>
        {speech.supported && (
          <button
            type="button"
            className={`btn btn-sm ${speech.listening ? 'btn-danger' : 'btn-ghost'}`}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
          >
            {speech.listening ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
            {speech.listening ? 'Stop dictation' : 'Dictate'}
          </button>
        )}
      </div>
      <textarea
        className="textarea"
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        readOnly={speech.listening}
        placeholder="Capture a connection, question, or explanation…"
        aria-label="New note"
      />
      <div className="note-composer-footer">
        <span className="speech-status" aria-live="polite">
          {speech.listening ? <><i /> Listening… speak naturally.</> : speech.error ?? (speech.supported ? 'Voice is handled by your browser’s speech service and is not stored by Research.' : 'Dictation is not supported in this browser.')}
        </span>
        <button type="button" className="btn btn-primary btn-sm" disabled={!body.trim()} onClick={submit}>
          <Plus size={15} aria-hidden /> Add note
        </button>
      </div>
    </section>
  );
}

function BlockView({
  block,
  index,
  activeBlock,
  termKeys,
}: {
  block: Block;
  index: number;
  activeBlock: number;
  termKeys: Set<string>;
}) {
  const speaking = index >= 0 && index === activeBlock;
  const anchorId = index >= 0 ? `b-${index}` : undefined;
  const speakingClass = speaking ? 'speaking' : undefined;
  switch (block.type) {
    case 'heading': {
      const depth = Math.min(6, block.depth + 1);
      const Tag = `h${depth}` as 'h2';
      return (
        <Tag id={`h-${block.id}`}>
          <span id={anchorId} className={speakingClass}>
            <InlineRuns runs={block.inlines} termKeys={termKeys} />
          </span>
        </Tag>
      );
    }
    case 'para':
      return (
        <p id={anchorId} className={speakingClass}>
          <InlineRuns runs={block.inlines} termKeys={termKeys} />
        </p>
      );
    case 'list':
      return (
        <div id={anchorId} className={speakingClass}>
          <ListView list={block} termKeys={termKeys} />
        </div>
      );
    case 'table':
      return (
        <div id={anchorId} className={`table-scroll ${speaking ? 'speaking' : ''}`}>
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
        <blockquote id={anchorId} className={speakingClass}>
          {block.blocks.map((child, i) => (
            <BlockView key={i} block={child} index={-2} activeBlock={activeBlock} termKeys={termKeys} />
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
