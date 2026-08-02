import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  Copy,
  Download,
  FileDown,
  Loader2,
  Microscope,
  Search,
  Sigma,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { AppData, StudyMaterial, StudySet } from '../model';
import { masteryPercent } from '../lib/store';
import { isPaperSet, paperFrontMatter, paperSubtitle } from '../lib/paper-set';
import { parsePaperId } from '../lib/paper-id';
import { copyText } from '../lib/clipboard';
import type { PaperConversion } from '../lib/jats';

export interface PaperDraft extends PaperConversion {
  fullText: boolean;
  note: string;
}

interface ReviewViewProps {
  data: AppData;
  materialFor: (set: StudySet) => StudyMaterial;
  onLookup: (query: string, onStatus: (status: string) => void) => Promise<PaperDraft>;
  onImportPdf: (file: File, onStatus: (status: string) => void) => Promise<PaperDraft>;
  onSave: (draft: PaperDraft) => void;
  onOpen: (set: StudySet) => void;
  onDelete: (set: StudySet) => void;
  onExport: (set: StudySet) => void;
}

type Phase = { kind: 'idle' } | { kind: 'working'; status: string } | { kind: 'error'; message: string } | { kind: 'ready'; draft: PaperDraft };

const EXAMPLES = [
  { label: 'PMID 23193287', value: '23193287' },
  { label: 'PMC3531190', value: 'PMC3531190' },
  { label: 'A DOI', value: '10.1093/nar/gks1195' },
];

export function ReviewView(props: ReviewViewProps) {
  const { data, materialFor } = props;
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const papers = data.sets.filter((set) => isPaperSet(set.id));
  const busy = phase.kind === 'working';

  const run = async (task: (onStatus: (status: string) => void) => Promise<PaperDraft>) => {
    setPhase({ kind: 'working', status: 'Starting…' });
    setCopied(false);
    try {
      const draft = await task((status) => setPhase({ kind: 'working', status }));
      setPhase({ kind: 'ready', draft });
    } catch (error) {
      const err = error as { message?: string; hint?: string };
      setPhase({
        kind: 'error',
        message: [err?.message || 'That import failed.', err?.hint].filter(Boolean).join(' '),
      });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    const id = parsePaperId(trimmed);
    if (!id) {
      setPhase({
        kind: 'error',
        message: 'That does not look like a PMID, PMCID, or DOI. Try 23193287, PMC3531190, or 10.1093/nar/gks1195.',
      });
      return;
    }
    void run((onStatus) => props.onLookup(trimmed, onStatus));
  };

  const handleFile = (file: File) => {
    if (busy) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setPhase({ kind: 'error', message: `“${file.name}” is not a PDF.` });
      return;
    }
    void run((onStatus) => props.onImportPdf(file, onStatus));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const draft = phase.kind === 'ready' ? phase.draft : null;

  const downloadMarkdown = () => {
    if (!draft) return;
    const blob = new Blob([draft.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.meta.title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'paper'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="review fade-in">
      <section className="review-hero">
        <h1 className="review-title">
          <Microscope size={26} aria-hidden /> Review
        </h1>
        <p className="review-sub">
          Paste a PMID, PMCID, or DOI — or drop a PDF. Review pulls the paper into clean markdown with its sections,
          tables, equations, figure captions, and supplementary files, then hands it to the same study engine Recall
          uses.
        </p>
      </section>

      <section className="review-import" aria-label="Import a paper">
        <form className="review-search" onSubmit={submit}>
          <div className="review-search-field">
            <Search size={17} aria-hidden />
            <input
              className="input review-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PMID, PMCID, DOI, or a PubMed link…"
              aria-label="Paper identifier"
              disabled={busy}
              spellCheck={false}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !query.trim()}>
            {busy ? <Loader2 size={16} aria-hidden className="spin" /> : <BookOpenCheck size={16} aria-hidden />}
            Fetch paper
          </button>
        </form>

        <div className="review-examples">
          <span>Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.value}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => {
                setQuery(example.value);
                void run((onStatus) => props.onLookup(example.value, onStatus));
              }}
            >
              {example.label}
            </button>
          ))}
        </div>

        <div
          className={`review-drop ${dragOver ? 'import-dragover' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <Upload size={18} aria-hidden />
          <div>
            <strong>Not open access? Drop the PDF here.</strong>
            <span>
              The PDF is read on this device — nothing is uploaded.{' '}
              <button type="button" className="link-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
                choose a file
              </button>
            </span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {phase.kind === 'working' && (
          <div className="review-status fade-in" role="status">
            <Loader2 size={16} aria-hidden className="spin" /> {phase.status}
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="review-error fade-in" role="alert">
            <AlertTriangle size={16} aria-hidden /> {phase.message}
          </div>
        )}

        {draft && (
          <div className="review-result fade-in">
            <div className="review-result-head">
              <div>
                <h2 className="review-result-title">{draft.meta.title}</h2>
                <p className="review-result-meta">
                  {[draft.meta.journal, draft.meta.year, draft.meta.authors.slice(0, 3).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span className={`review-badge ${draft.fullText ? 'review-badge-full' : 'review-badge-partial'}`}>
                {draft.fullText ? 'Full text' : 'Abstract only'}
              </span>
            </div>

            <p className="review-note">{draft.note}</p>

            <div className="stat-chips">
              <span className="meta-chip">{draft.counts.sections} sections</span>
              <span className="meta-chip">
                <Table2 size={13} aria-hidden /> {draft.counts.tables} tables
              </span>
              <span className="meta-chip">{draft.counts.figures} figures</span>
              <span className="meta-chip">
                <Sigma size={13} aria-hidden /> {draft.counts.equations} equations
              </span>
              <span className="meta-chip">{draft.counts.supplements} supplements</span>
              {draft.counts.references > 0 && <span className="meta-chip">{draft.counts.references} references</span>}
            </div>

            <details className="review-preview">
              <summary>Preview the markdown</summary>
              <pre>{draft.markdown.slice(0, 4000)}{draft.markdown.length > 4000 ? '\n…' : ''}</pre>
            </details>

            <div className="review-result-actions">
              <button type="button" className="btn btn-primary" onClick={() => props.onSave(draft)}>
                Study this paper <ArrowRight size={16} aria-hidden />
              </button>
              <button
                type="button"
                className={`btn btn-sm ${copied ? 'btn-success' : ''}`}
                onClick={async () => {
                  if (await copyText(draft.markdown)) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  }
                }}
              >
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                {copied ? 'Copied' : 'Copy markdown'}
              </button>
              <button type="button" className="btn btn-sm" onClick={downloadMarkdown}>
                <FileDown size={15} aria-hidden /> Download .md
              </button>
            </div>
          </div>
        )}
      </section>

      {papers.length > 0 && (
        <section className="sets-section" aria-label="Your papers">
          <h2 className="section-title">Your papers</h2>
          <div className="sets-grid">
            {papers.map((set) => {
              const material = materialFor(set);
              const progress = data.progress[set.id] ?? { cards: {} };
              const ids = [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)];
              const mastery = masteryPercent(progress, ids);
              const front = paperFrontMatter(set.markdown);
              const subtitle = paperSubtitle(front);
              return (
                <div key={set.id} className="set-card">
                  <button type="button" className="set-card-main" onClick={() => props.onOpen(set)}>
                    <div className="set-card-title">{set.title}</div>
                    {subtitle && <div className="set-card-sub">{subtitle}</div>}
                    <div className="set-card-meta">
                      <span className="meta-chip">{material.stats.terms} terms</span>
                      <span className="meta-chip">{material.stats.clozes} blanks</span>
                      <span className="meta-chip">{material.stats.readingMinutes} min</span>
                    </div>
                    <div className="mastery-row">
                      <div className="mastery-bar">
                        <div className="mastery-fill" style={{ width: `${mastery}%` }} />
                      </div>
                      <span className="mastery-num">{mastery}%</span>
                    </div>
                  </button>
                  <div className="set-card-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => props.onExport(set)}
                      aria-label={`Export ${set.title}`}
                      title="Export as JSON"
                    >
                      <Download size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => props.onDelete(set)}
                      aria-label={`Remove ${set.title}`}
                      title="Remove paper"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
