import { useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileUp,
  Pencil,
  Quote,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react';
import type { Mode, StudyMaterial, StudySet } from '../model';
import { paperFrontMatter, paperSubtitle } from '../lib/paper-set';
import { NotesView } from './NotesView';
import { ClaimsView, DataView, FindView, SkimView } from './PaperViews';
import { ArticlePane, type PdfLoadStatus } from './ArticlePane';
import { NewTabLink } from './Inline';
import { PdfPane, type LocateRequest } from './PdfPane';

const TABS: { mode: Mode; label: string; icon: typeof BookOpen }[] = [
  { mode: 'skim', label: 'Skim', icon: Zap },
  { mode: 'notes', label: 'Notes', icon: BookOpen },
  { mode: 'data', label: 'Data', icon: Table2 },
  { mode: 'claims', label: 'Claims', icon: Quote },
  { mode: 'find', label: 'Find', icon: Search },
];

export function PaperReader({
  set,
  material,
  mode,
  onNavigate,
  onBack,
  backLabel,
  onSaveMarkdown,
  onAddNote,
  onDelete,
  onExport,
  onRefresh,
  pdfBytes,
  pdfStatus,
  onAttachPdf,
  onRetryPdf,
}: {
  set: StudySet;
  material: StudyMaterial;
  mode: Mode;
  onNavigate: (mode: Mode) => void;
  onBack: () => void;
  backLabel: string;
  onSaveMarkdown: (markdown: string) => void;
  onAddNote: (note: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onRefresh?: (set: StudySet) => Promise<string>;
  pdfBytes: ArrayBuffer | null;
  pdfStatus: PdfLoadStatus;
  onAttachPdf: (file: File) => void;
  onRetryPdf?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.markdown);
  const [editorBase, setEditorBase] = useState(set.markdown);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const [pane, setPane] = useState<'doc' | 'tools'>('doc');
  const [format, setFormat] = useState<'text' | 'pdf'>('text');
  const fileRef = useRef<HTMLInputElement>(null);

  const front = paperFrontMatter(set.markdown);
  const subtitle = paperSubtitle(front);
  const active = TABS.some((tab) => tab.mode === mode) ? mode : 'skim';
  const abstractOnly = /PubMed abstract/i.test(front.source ?? '');
  const refreshTitle = abstractOnly
    ? 'Re-fetch this paper. The full text may be available now'
    : 'Re-fetch this paper from its source';

  const jump = (text: string) => {
    setLocate({ text, id: Date.now() });
    setPane('doc');
  };

  const chooseFormat = (next: 'text' | 'pdf') => {
    setFormat(next);
  };

  const showPdf = format === 'pdf' && pdfStatus === 'ready' && pdfBytes;
  const editorStale = editing && set.markdown !== editorBase;

  return (
    <div className="paper-reader" data-pane={pane}>
      <section className="reader-doc" aria-label="Paper">
        <div className="reader-doc-bar">
          <button type="button" className="btn btn-ghost btn-sm reader-doc-back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden /> {backLabel}
          </button>
          <div className="reader-format" role="group" aria-label="Paper format">
            <button type="button" className={format === 'text' ? 'reader-switch-on' : ''} aria-pressed={format === 'text'} onClick={() => chooseFormat('text')}>
              Text
            </button>
            <button type="button" className={format === 'pdf' ? 'reader-switch-on' : ''} aria-pressed={format === 'pdf'} onClick={() => chooseFormat('pdf')}>
              PDF
            </button>
          </div>
        </div>
        <div className="reader-switch" role="group" aria-label="Show">
          <button type="button" className={pane === 'doc' ? 'reader-switch-on' : ''} aria-pressed={pane === 'doc'} onClick={() => setPane('doc')}>
            Paper
          </button>
          <button type="button" className={pane === 'tools' ? 'reader-switch-on' : ''} aria-pressed={pane === 'tools'} onClick={() => setPane('tools')}>
            Tools
          </button>
        </div>
        {showPdf ? (
          <PdfPane bytes={pdfBytes} locate={locate} />
        ) : format === 'pdf' ? (
          <div className="doc-status">
            <p>
              {pdfStatus === 'error'
                ? 'The PDF could not be downloaded.'
                : pdfStatus === 'missing'
                  ? 'No PDF on this device.'
                  : 'Opening the PDF…'}
            </p>
            <p>
              <button type="button" className="link-btn" onClick={() => chooseFormat('text')}>
                Read the text
              </button>
              {pdfStatus === 'error' && onRetryPdf ? (
                <>
                  {' '}
                  <button type="button" className="link-btn" onClick={onRetryPdf}>
                    Try again
                  </button>
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <ArticlePane
            doc={material.doc}
            locate={locate}
            status={pdfStatus}
            onFile={onAttachPdf}
            onRetry={onRetryPdf}
          />
        )}
      </section>

      <aside className="reader-side" aria-label="Paper tools">
        <div className="reader-side-head">
          <div className="reader-side-row">
            <button type="button" className="btn btn-ghost btn-sm back-link" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden /> {backLabel}
            </button>
            <div className="set-actions">
              <button
                type="button"
                className="icon-btn"
                title="Add or replace the PDF"
                aria-label="Add or replace the PDF"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Edit source markdown"
                aria-label="Edit source markdown"
                onClick={() => {
                  if (!editing) {
                    setDraft(set.markdown);
                    setEditorBase(set.markdown);
                  }
                  setEditing((value) => !value);
                }}
              >
                <Pencil size={16} aria-hidden />
              </button>
              {onRefresh && (front.pmcid || front.pmid || front.doi) ? (
                <button
                  type="button"
                  className="icon-btn"
                  title={refreshTitle}
                  aria-label={refreshTitle}
                  disabled={refreshing}
                  onClick={async () => {
                    setRefreshing(true);
                    try {
                      setRefreshNote(await onRefresh(set));
                    } finally {
                      setRefreshing(false);
                    }
                  }}
                >
                  <RefreshCw size={16} aria-hidden className={refreshing ? 'spin' : undefined} />
                </button>
              ) : null}
              <button type="button" className="icon-btn" title="Export as JSON" aria-label="Export as JSON" onClick={onExport}>
                <Download size={16} aria-hidden />
              </button>
              <button type="button" className="icon-btn icon-btn-danger" title="Remove paper" aria-label="Remove paper" onClick={onDelete}>
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          </div>
          <h1 className="reader-title">{set.title}</h1>
          <div className="reader-meta">
            {subtitle && <span>{subtitle}</span>}
            {front.doi && (
              <NewTabLink href={`https://doi.org/${front.doi}`}>
                DOI <ExternalLink size={11} aria-hidden />
              </NewTabLink>
            )}
            {front.pmid && (
              <NewTabLink href={`https://pubmed.ncbi.nlm.nih.gov/${front.pmid}/`}>
                PubMed <ExternalLink size={11} aria-hidden />
              </NewTabLink>
            )}
            {front.pmcid && (
              <NewTabLink href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${front.pmcid}/`}>
                {front.pmcid} <ExternalLink size={11} aria-hidden />
              </NewTabLink>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onAttachPdf(file);
              event.target.value = '';
            }}
          />
        </div>

        {refreshNote && (
          <div className="refresh-note" role="status">
            {refreshNote}
            <button type="button" className="link-btn" onClick={() => setRefreshNote(null)}>
              Dismiss
            </button>
          </div>
        )}

        {editing && (
          <div className="source-editor">
            {editorStale && (
              <p id="editor-stale" className="editor-stale" role="status">
                The saved paper changed while this editor was open. Reload the editor before saving.
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setDraft(set.markdown);
                    setEditorBase(set.markdown);
                  }}
                >
                  Reload editor
                </button>
              </p>
            )}
            <textarea className="textarea" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
            <div className="paste-form-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!draft.trim() || editorStale}
                aria-describedby={editorStale ? 'editor-stale' : undefined}
                onClick={() => {
                  if (set.markdown !== editorBase) return;
                  onSaveMarkdown(draft);
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="reader-switch reader-switch-side" role="group" aria-label="Show">
          <button type="button" className={pane === 'doc' ? 'reader-switch-on' : ''} aria-pressed={pane === 'doc'} onClick={() => setPane('doc')}>
            Paper
          </button>
          <button type="button" className={pane === 'tools' ? 'reader-switch-on' : ''} aria-pressed={pane === 'tools'} onClick={() => setPane('tools')}>
            Tools
          </button>
        </div>

        <nav className="reader-tabs" aria-label="Paper tools">
          {TABS.map(({ mode: tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              className={`reader-tab ${active === tab ? 'reader-tab-active' : ''}`}
              aria-pressed={active === tab}
              onClick={() => {
                onNavigate(tab);
                setPane('tools');
              }}
            >
              <Icon size={14} aria-hidden /> {label}
            </button>
          ))}
        </nav>

        <div className="reader-body">
          {active === 'notes' && <NotesView material={material} markdown={set.markdown} onAddNote={onAddNote} />}
          {active === 'data' && <DataView doc={material.doc} pmcid={front.pmcid} setId={set.id} onLocate={jump} />}
          {active === 'claims' && <ClaimsView doc={material.doc} pmcid={front.pmcid} setId={set.id} onLocate={jump} />}
          {active === 'find' && <FindView doc={material.doc} setId={set.id} onLocate={jump} />}
          {active === 'skim' && <SkimView doc={material.doc} pmcid={front.pmcid} setId={set.id} onLocate={jump} />}
        </div>
      </aside>
    </div>
  );
}
