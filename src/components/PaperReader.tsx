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
import { ArticlePane } from './ArticlePane';
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
  pdfStatus: 'loading' | 'checking' | 'ready' | 'missing';
  onAttachPdf: (file: File) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.markdown);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const [pane, setPane] = useState<'doc' | 'tools'>('doc');
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

  const showPdf = pdfStatus === 'ready' && pdfBytes;

  return (
    <div className="paper-reader" data-pane={pane}>
      <section className="reader-doc" aria-label="Paper">
        <div className="reader-switch" role="group" aria-label="Show">
          <button type="button" className={pane === 'doc' ? 'reader-switch-on' : ''} onClick={() => setPane('doc')}>
            Paper
          </button>
          <button type="button" className={pane === 'tools' ? 'reader-switch-on' : ''} onClick={() => setPane('tools')}>
            Tools
          </button>
        </div>
        {pdfStatus === 'loading' ? (
          <p className="doc-status">Opening the paper…</p>
        ) : showPdf ? (
          <PdfPane bytes={pdfBytes} locate={locate} />
        ) : (
          <ArticlePane doc={material.doc} locate={locate} status={pdfStatus} onFile={onAttachPdf} />
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
                  setDraft(set.markdown);
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
              <a href={`https://doi.org/${front.doi}`} target="_blank" rel="noreferrer noopener">
                DOI <ExternalLink size={11} aria-hidden />
              </a>
            )}
            {front.pmid && (
              <a href={`https://pubmed.ncbi.nlm.nih.gov/${front.pmid}/`} target="_blank" rel="noreferrer noopener">
                PubMed <ExternalLink size={11} aria-hidden />
              </a>
            )}
            {front.pmcid && (
              <a href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${front.pmcid}/`} target="_blank" rel="noreferrer noopener">
                {front.pmcid} <ExternalLink size={11} aria-hidden />
              </a>
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
            <textarea className="textarea" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
            <div className="paste-form-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!draft.trim()}
                onClick={() => {
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
          <button type="button" className={pane === 'doc' ? 'reader-switch-on' : ''} onClick={() => setPane('doc')}>
            Paper
          </button>
          <button type="button" className={pane === 'tools' ? 'reader-switch-on' : ''} onClick={() => setPane('tools')}>
            Tools
          </button>
        </div>

        <nav className="reader-tabs" aria-label="Paper tools">
          {TABS.map(({ mode: tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              className={`reader-tab ${active === tab ? 'reader-tab-active' : ''}`}
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
