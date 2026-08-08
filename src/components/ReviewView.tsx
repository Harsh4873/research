import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  Copy,
  Download,
  FileDown,
  Library,
  Loader2,
  Microscope,
  Search,
  Sigma,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppData, StudyMaterial, StudySet } from '../model';
import { masteryPercent } from '../lib/store';
import { isPaperSet, paperFrontMatter, paperSubtitle } from '../lib/paper-set';
import { findExistingPaper, searchPapers } from '../lib/paper-search';
import { BIBLIOGRAPHY, bibliographyText } from '../content/bibliography';
import { parsePaperIds } from '../lib/paper-id';
import { isReferenceFile } from '../lib/reference-file';
import { copyText } from '../lib/clipboard';
import type { PaperConversion } from '../lib/jats';

export interface PaperDraft extends PaperConversion {
  fullText: boolean;
  note: string;
}

export interface BulkOutcome {
  drafts: PaperDraft[];
  failures: Array<{ label: string; message: string }>;
}

interface ReviewViewProps {
  data: AppData;
  materialFor: (set: StudySet) => StudyMaterial;
  onLookup: (query: string, onStatus: (status: string) => void) => Promise<PaperDraft>;
  onLookupMany: (text: string, onStatus: (status: string) => void) => Promise<BulkOutcome>;
  onImportPdf: (file: File, onStatus: (status: string) => void) => Promise<PaperDraft>;
  onReadReferenceFile: (file: File) => Promise<string>;
  onSave: (draft: PaperDraft) => void;
  onSaveMany: (drafts: PaperDraft[]) => void;
  onOpen: (set: StudySet) => void;
  onDelete: (set: StudySet) => void;
  onExport: (set: StudySet) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; status: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; draft: PaperDraft }
  | { kind: 'bulk'; outcome: BulkOutcome }
  | { kind: 'have'; set: StudySet };

const EXAMPLES = [
  { label: 'PMID 23193287', value: '23193287' },
  { label: 'PMC3531190', value: 'PMC3531190' },
  { label: 'A DOI', value: '10.1093/nar/gks1195' },
];

export function ReviewView(props: ReviewViewProps) {
  const { data, materialFor } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const papers = data.sets.filter((set) => isPaperSet(set.id));
  const busy = phase.kind === 'working';
  const pendingCount = query.trim() ? parsePaperIds(query).length : 0;
  const matches = useMemo(() => searchPapers(data.sets, filter), [data.sets, filter]);

  // Which of the manuscript's references are already here, so the collection
  // offers only what is missing and disappears once it is all saved.
  const savedDois = useMemo(() => {
    const dois = new Set<string>();
    for (const set of papers) {
      const doi = paperFrontMatter(set.markdown).doi;
      if (doi) dois.add(doi.toLowerCase());
    }
    return dois;
  }, [papers]);
  const missingFromBibliography = BIBLIOGRAPHY.filter((entry) => !savedDois.has(entry.doi.toLowerCase())).length;

  const run = async (task: (onStatus: (status: string) => void) => Promise<Phase>) => {
    setPhase({ kind: 'working', status: 'Starting…' });
    setCopied(false);
    try {
      setPhase(await task((status) => setPhase({ kind: 'working', status })));
    } catch (error) {
      const err = error as { message?: string; hint?: string };
      setPhase({
        kind: 'error',
        message: [err?.message || 'That import failed.', err?.hint].filter(Boolean).join(' '),
      });
    }
  };

  const runOne = (query: string) =>
    run(async (onStatus) => ({ kind: 'ready', draft: await props.onLookup(query, onStatus) }));

  const runMany = (text: string) =>
    run(async (onStatus) => ({ kind: 'bulk', outcome: await props.onLookupMany(text, onStatus) }));

  /** One identifier opens a preview; a list is fetched in bulk. */
  const importText = (text: string) => {
    const ids = parsePaperIds(text);
    // Looking up something already saved should open it, not fetch it again.
    if (ids.length === 1) {
      const existing = findExistingPaper(data.sets, ids[0]);
      if (existing) {
        setPhase({ kind: 'have', set: existing });
        return;
      }
    }
    if (ids.length === 0) {
      setPhase({
        kind: 'error',
        message:
          'No PMID, PMCID, or DOI found in that. Try 23193287, PMC3531190, or 10.1093/nar/gks1195 — or paste a whole reference list.',
      });
      return;
    }
    if (ids.length === 1) void runOne(text.trim());
    else void runMany(text);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim() || busy) return;
    importText(query);
  };

  const handleFile = (file: File) => {
    if (busy) return;
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      void run(async (onStatus) => ({ kind: 'ready', draft: await props.onImportPdf(file, onStatus) }));
      return;
    }
    if (isReferenceFile(file.name)) {
      void (async () => {
        setPhase({ kind: 'working', status: `Reading ${file.name}…` });
        try {
          importText(await props.onReadReferenceFile(file));
        } catch (error) {
          setPhase({ kind: 'error', message: (error as Error)?.message ?? `Could not read ${file.name}.` });
        }
      })();
      return;
    }
    setPhase({ kind: 'error', message: `“${file.name}” is not a PDF or a reference list.` });
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
            <textarea
              className="input review-input"
              rows={query.includes('\n') || query.length > 90 ? 4 : 1}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !query.includes('\n')) {
                  event.preventDefault();
                  submit(event);
                }
              }}
              placeholder="PMID, PMCID, DOI, a PubMed link — or paste a whole list…"
              aria-label="Paper identifiers"
              disabled={busy}
              spellCheck={false}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !query.trim()}>
            {busy ? <Loader2 size={16} aria-hidden className="spin" /> : <BookOpenCheck size={16} aria-hidden />}
            {pendingCount > 1 ? `Fetch ${pendingCount} papers` : 'Fetch paper'}
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
                void runOne(example.value);
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
            <strong>Drop a PDF, or a reference list.</strong>
            <span>
              A PDF is read on this device; a <code>.docx</code>, <code>.txt</code>, or <code>.csv</code> list is
              scanned for every PMID, PMCID, and DOI in it.{' '}
              <button type="button" className="link-btn" disabled={busy} onClick={() => fileInput.current?.click()}>
                choose a file
              </button>
            </span>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf,.docx,.txt,.md,.csv,.tsv,.nbib,.ris"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {missingFromBibliography > 0 && (
          <div className="review-collection">
            <div>
              <strong>The manuscript bibliography</strong>
              <span>
                {BIBLIOGRAPHY.length} references cited by the diabetes selection manuscript and its supplementary
                material.{' '}
                {missingFromBibliography < BIBLIOGRAPHY.length
                  ? `${BIBLIOGRAPHY.length - missingFromBibliography} are already saved.`
                  : 'None are saved yet.'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => runMany(bibliographyText(BIBLIOGRAPHY.filter((entry) => !savedDois.has(entry.doi.toLowerCase()))))}
            >
              <Library size={15} aria-hidden /> Load {missingFromBibliography}
            </button>
          </div>
        )}

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

        {phase.kind === 'have' && (
          <div className="review-result fade-in">
            <div className="review-result-head">
              <div>
                <h2 className="review-result-title">{phase.set.title}</h2>
                <p className="review-result-meta">{paperSubtitle(paperFrontMatter(phase.set.markdown))}</p>
              </div>
              <span className="review-badge review-badge-have">Already saved</span>
            </div>
            <p className="review-note">This paper is already in your library, so there was nothing to fetch.</p>
            <div className="review-result-actions">
              <button type="button" className="btn btn-primary" onClick={() => props.onOpen(phase.set)}>
                Open it <ArrowRight size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setPhase({ kind: 'idle' });
                  setQuery('');
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'bulk' && (
          <div className="review-result fade-in">
            <div className="review-result-head">
              <div>
                <h2 className="review-result-title">
                  {phase.outcome.drafts.length} paper{phase.outcome.drafts.length === 1 ? '' : 's'} ready
                </h2>
                <p className="review-result-meta">
                  {phase.outcome.drafts.filter((d) => d.fullText).length} with full text ·{' '}
                  {phase.outcome.drafts.filter((d) => !d.fullText).length} abstract only
                  {phase.outcome.failures.length > 0 ? ` · ${phase.outcome.failures.length} not found` : ''}
                </p>
              </div>
            </div>

            <ul className="bulk-list">
              {phase.outcome.drafts.map((item, index) => (
                <li key={index} className="bulk-item">
                  <span className={`bulk-dot ${item.fullText ? 'bulk-dot-full' : 'bulk-dot-partial'}`} aria-hidden />
                  <span className="bulk-title">{item.meta.title}</span>
                  <span className="bulk-meta">
                    {[item.meta.year, item.meta.pmid ? `PMID ${item.meta.pmid}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
              {phase.outcome.failures.map((failure, index) => (
                <li key={`f${index}`} className="bulk-item bulk-item-failed">
                  <span className="bulk-dot bulk-dot-failed" aria-hidden />
                  <span className="bulk-title">{failure.label}</span>
                  <span className="bulk-meta">{failure.message}</span>
                </li>
              ))}
            </ul>

            {phase.outcome.failures.length > 0 && phase.outcome.drafts.length > 0 && (
              <p className="review-note">
                Reference lists cite the same paper by PMID, DOI, and PMCID at once. Duplicates were merged, and an
                identifier that did not resolve on its own may still be covered by its paper above.
              </p>
            )}

            <div className="review-result-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={phase.outcome.drafts.length === 0}
                onClick={() => {
                  props.onSaveMany(phase.outcome.drafts);
                  setPhase({ kind: 'idle' });
                  setQuery('');
                }}
              >
                Add {phase.outcome.drafts.length} paper{phase.outcome.drafts.length === 1 ? '' : 's'} to Review{' '}
                <ArrowRight size={16} aria-hidden />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase({ kind: 'idle' })}>
                Discard
              </button>
            </div>
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
          <div className="library-head">
            <h2 className="section-title">Your papers</h2>
            <div className="review-search-field library-filter">
              <Search size={16} aria-hidden />
              <input
                className="input"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search your papers — title, author, journal, PMID, DOI, or any word in the text…"
                aria-label="Search your papers"
                spellCheck={false}
              />
              {filter && (
                <button type="button" className="find-clear" onClick={() => setFilter('')} aria-label="Clear search">
                  <X size={15} aria-hidden />
                </button>
              )}
            </div>
            {filter.trim() && (
              <p className="find-count">
                {matches.length} of {papers.length} {papers.length === 1 ? 'paper' : 'papers'}
              </p>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="mode-empty">
              <p>Nothing in your library matches “{filter.trim()}”.</p>
              {parsePaperIds(filter).length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setQuery(filter);
                    importText(filter);
                  }}
                >
                  Fetch it instead <ArrowRight size={15} aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <div className="sets-grid">
              {matches.map(({ set, front, fields, snippet }) => {
                const material = materialFor(set);
                const progress = data.progress[set.id] ?? { cards: {} };
                const ids = [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)];
                const mastery = masteryPercent(progress, ids);
                const subtitle = paperSubtitle(front);
                return (
                  <div key={set.id} className="set-card">
                    <button type="button" className="set-card-main" onClick={() => props.onOpen(set)}>
                      <div className="set-card-title">{set.title}</div>
                      {subtitle && <div className="set-card-sub">{subtitle}</div>}
                      {front.authors && <div className="set-card-authors">{front.authors}</div>}
                      {fields.length > 0 && (
                        <div className="match-fields">
                          {fields.map((field) => (
                            <span key={field} className="match-chip">
                              matched {field}
                            </span>
                          ))}
                        </div>
                      )}
                      {snippet && <p className="match-snippet">{snippet}</p>}
                      <div className="set-card-meta">
                        <span className="meta-chip">{material.stats.readingMinutes} min</span>
                        {material.stats.terms > 0 && <span className="meta-chip">{material.stats.terms} terms</span>}
                      </div>
                      {mastery > 0 && (
                        <div className="mastery-row">
                          <div className="mastery-bar">
                            <div className="mastery-fill" style={{ width: `${mastery}%` }} />
                          </div>
                          <span className="mastery-num">{mastery}%</span>
                        </div>
                      )}
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
          )}
        </section>
      )}
    </div>
  );
}
