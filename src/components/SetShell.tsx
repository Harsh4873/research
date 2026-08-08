import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  GalleryVerticalEnd,
  Grid2x2,
  ListChecks,
  PenLine,
  Pencil,
  ExternalLink,
  Quote,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react';
import type { Mode, SetProgress, StudyMaterial, StudySet } from '../model';
import { masteryPercent } from '../lib/store';
import { isPaperSet, paperFrontMatter, paperSubtitle } from '../lib/paper-set';
import { NotesView } from './NotesView';
import { Flashcards } from './Flashcards';
import { QuizView } from './QuizView';
import { ClozeView } from './ClozeView';
import { MatchView } from './MatchView';
import { ClaimsView, DataView, FindView, SkimView } from './PaperViews';

interface SetShellProps {
  set: StudySet;
  material: StudyMaterial;
  progress: SetProgress;
  mode: Mode;
  onNavigate: (mode: Mode) => void;
  onBack: () => void;
  /** Where the back link returns to — the Recall library or the Review list. */
  backLabel?: string;
  onAnswer: (cardId: string, correct: boolean) => void;
  onToggleStar: (cardId: string) => void;
  onBestTime: (ms: number) => void;
  onSaveMarkdown: (markdown: string) => void;
  onAddNote: (note: string) => void;
  onDelete: () => void;
  onExport: () => void;
  /** Re-fetch a paper from its identifier; returns what changed, for the notice. */
  onRefresh?: (set: StudySet) => Promise<string>;
}

const STUDY_TABS: { mode: Mode; label: string; icon: typeof BookOpen }[] = [
  { mode: 'notes', label: 'Notes', icon: BookOpen },
  { mode: 'cards', label: 'Flashcards', icon: GalleryVerticalEnd },
  { mode: 'quiz', label: 'Quiz', icon: ListChecks },
  { mode: 'blanks', label: 'Blanks', icon: PenLine },
  { mode: 'match', label: 'Match', icon: Grid2x2 },
];

const PAPER_TABS: { mode: Mode; label: string; icon: typeof BookOpen }[] = [
  { mode: 'notes', label: 'Notes', icon: BookOpen },
  { mode: 'data', label: 'Data', icon: Table2 },
  { mode: 'claims', label: 'Claims', icon: Quote },
  { mode: 'find', label: 'Find', icon: Search },
  { mode: 'skim', label: 'Skim', icon: Zap },
];

export function SetShell(props: SetShellProps) {
  const { set, material, progress, mode, onNavigate, onBack, backLabel = 'Library' } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.markdown);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const ids = [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)];
  const mastery = masteryPercent(progress, ids);

  // Papers are for reading; note sets are for studying.
  const isPaper = isPaperSet(set.id);
  const tabs = isPaper ? PAPER_TABS : STUDY_TABS;
  const front = isPaper ? paperFrontMatter(set.markdown) : {};
  const subtitle = isPaper ? paperSubtitle(front) : '';
  const doi = front.doi;
  // Only the abstract is here when the source line says so; re-fetching can now
  // reach author manuscripts that Europe PMC alone did not serve.
  const abstractOnly = /PubMed abstract/i.test(front.source ?? '');
  const refreshTitle = abstractOnly
    ? 'Re-fetch this paper — the full text may be available now'
    : 'Re-fetch this paper from its source';

  return (
    <div className="set-shell fade-in">
      <div className="set-header">
        <button type="button" className="btn btn-ghost btn-sm back-link" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> {backLabel}
        </button>
        <div className="set-header-row">
          <h1 className="set-title">{set.title}</h1>
          <div className="set-actions">
            <button
              type="button"
              className="icon-btn"
              title="Edit source markdown"
              aria-label="Edit source markdown"
              onClick={() => {
                setDraft(set.markdown);
                setEditing((v) => !v);
              }}
            >
              <Pencil size={16} aria-hidden />
            </button>
            {isPaper && props.onRefresh && (front.pmcid || front.pmid || front.doi) ? (
              <button
                type="button"
                className="icon-btn"
                title={refreshTitle}
                aria-label={refreshTitle}
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    setRefreshNote(await props.onRefresh!(set));
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw size={16} aria-hidden className={refreshing ? 'spin' : undefined} />
              </button>
            ) : null}
            <button type="button" className="icon-btn" title="Export as JSON" aria-label="Export as JSON" onClick={props.onExport}>
              <Download size={16} aria-hidden />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove set" aria-label="Remove set" onClick={props.onDelete}>
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        </div>
        {isPaper ? (
          <div className="stat-chips">
            {subtitle && <span className="paper-subtitle">{subtitle}</span>}
            {doi && (
              <a className="meta-chip meta-chip-link" href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer noopener">
                doi.org/{doi} <ExternalLink size={12} aria-hidden />
              </a>
            )}
            {front.pmid && (
              <a
                className="meta-chip meta-chip-link"
                href={`https://pubmed.ncbi.nlm.nih.gov/${front.pmid}/`}
                target="_blank"
                rel="noreferrer noopener"
              >
                PubMed <ExternalLink size={12} aria-hidden />
              </a>
            )}
            {front.pmcid && (
              <a
                className="meta-chip meta-chip-link"
                href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${front.pmcid}/`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {front.pmcid} <ExternalLink size={12} aria-hidden />
              </a>
            )}
            <span className="meta-chip">{material.stats.readingMinutes} min read</span>
          </div>
        ) : (
          <div className="stat-chips">
            <span className="meta-chip">{material.stats.terms} terms</span>
            <span className="meta-chip">{material.stats.clozes} blanks</span>
            <div className="mastery-row header-mastery">
              <div className="mastery-bar">
                <div className="mastery-fill" style={{ width: `${mastery}%` }} />
              </div>
              <span className="mastery-num">{mastery}% mastered</span>
            </div>
          </div>
        )}
      </div>

      {refreshNote && (
        <div className="refresh-note fade-in" role="status">
          {refreshNote}
          <button type="button" className="link-btn" onClick={() => setRefreshNote(null)}>
            Dismiss
          </button>
        </div>
      )}

      {editing && (
        <div className="source-editor fade-in">
          <textarea className="textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
          <div className="paste-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draft.trim()}
              onClick={() => {
                props.onSaveMarkdown(draft);
                setEditing(false);
              }}
            >
              Save changes
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="mode-tabs" aria-label={isPaper ? 'Paper views' : 'Study modes'}>
        {tabs.map(({ mode: m, label, icon: Icon }) => (
          <button key={m} type="button" className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => onNavigate(m)}>
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </nav>

      <div className="mode-panel">
        {mode === 'notes' && <NotesView material={material} markdown={set.markdown} onAddNote={props.onAddNote} />}
        {isPaper ? (
          <>
            {mode === 'data' && <DataView doc={material.doc} pmcid={front.pmcid} setId={set.id} />}
            {mode === 'claims' && <ClaimsView doc={material.doc} pmcid={front.pmcid} setId={set.id} />}
            {mode === 'find' && <FindView doc={material.doc} setId={set.id} />}
            {mode === 'skim' && <SkimView doc={material.doc} pmcid={front.pmcid} setId={set.id} />}
          </>
        ) : (
          <>
            {mode === 'cards' && (
              <Flashcards material={material} progress={progress} onAnswer={props.onAnswer} onToggleStar={props.onToggleStar} />
            )}
            {mode === 'quiz' && <QuizView material={material} progress={progress} onAnswer={props.onAnswer} />}
            {mode === 'blanks' && <ClozeView material={material} progress={progress} onAnswer={props.onAnswer} />}
            {mode === 'match' && (
              <MatchView material={material} progress={progress} onAnswer={props.onAnswer} onBestTime={props.onBestTime} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
