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
  Trash2,
} from 'lucide-react';
import type { Mode, SetProgress, StudyMaterial, StudySet } from '../model';
import { masteryPercent } from '../lib/store';
import { NotesView } from './NotesView';
import { Flashcards } from './Flashcards';
import { QuizView } from './QuizView';
import { ClozeView } from './ClozeView';
import { MatchView } from './MatchView';

interface SetShellProps {
  set: StudySet;
  material: StudyMaterial;
  progress: SetProgress;
  mode: Mode;
  onNavigate: (mode: Mode) => void;
  onBack: () => void;
  onAnswer: (cardId: string, correct: boolean) => void;
  onToggleStar: (cardId: string) => void;
  onBestTime: (ms: number) => void;
  onSaveMarkdown: (markdown: string) => void;
  onAddNote: (note: string) => void;
  onDelete: () => void;
  onExport: () => void;
}

const TABS: { mode: Mode; label: string; icon: typeof BookOpen }[] = [
  { mode: 'notes', label: 'Notes', icon: BookOpen },
  { mode: 'cards', label: 'Flashcards', icon: GalleryVerticalEnd },
  { mode: 'quiz', label: 'Quiz', icon: ListChecks },
  { mode: 'blanks', label: 'Blanks', icon: PenLine },
  { mode: 'match', label: 'Match', icon: Grid2x2 },
];

export function SetShell(props: SetShellProps) {
  const { set, material, progress, mode, onNavigate, onBack } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.markdown);

  const ids = [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)];
  const mastery = masteryPercent(progress, ids);

  return (
    <div className="set-shell fade-in">
      <div className="set-header">
        <button type="button" className="btn btn-ghost btn-sm back-link" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Library
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
            <button type="button" className="icon-btn" title="Export as JSON" aria-label="Export as JSON" onClick={props.onExport}>
              <Download size={16} aria-hidden />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" title="Remove set" aria-label="Remove set" onClick={props.onDelete}>
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        </div>
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
      </div>

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

      <nav className="mode-tabs" aria-label="Study modes">
        {TABS.map(({ mode: m, label, icon: Icon }) => (
          <button key={m} type="button" className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => onNavigate(m)}>
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </nav>

      <div className="mode-panel">
        {mode === 'notes' && <NotesView material={material} markdown={set.markdown} onAddNote={props.onAddNote} />}
        {mode === 'cards' && (
          <Flashcards material={material} progress={progress} onAnswer={props.onAnswer} onToggleStar={props.onToggleStar} />
        )}
        {mode === 'quiz' && <QuizView material={material} progress={progress} onAnswer={props.onAnswer} />}
        {mode === 'blanks' && <ClozeView material={material} progress={progress} onAnswer={props.onAnswer} />}
        {mode === 'match' && (
          <MatchView material={material} progress={progress} onAnswer={props.onAnswer} onBestTime={props.onBestTime} />
        )}
      </div>
    </div>
  );
}
