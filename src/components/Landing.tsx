import { ArrowRight, BookOpen, GalleryVerticalEnd, Grid2x2, ListChecks, PenLine, Sigma, Table2, Upload } from 'lucide-react';
import type { AppData } from '../model';
import { isPaperSet } from '../lib/paper-set';

interface LandingProps {
  data: AppData;
  onFlashcards: () => void;
  onPapers: () => void;
}

export function Landing({ data, onFlashcards, onPapers }: LandingProps) {
  const papers = data.sets.filter((set) => isPaperSet(set.id)).length;
  const notes = data.sets.length - papers;

  return (
    <div className="landing fade-in">
      <section className="landing-hero">
        <h1 className="landing-title">Flashcards or papers</h1>
        <p className="landing-sub">Paste notes, or drop a PDF. Same study kit.</p>
      </section>

      <div className="landing-grid">
        <button type="button" className="landing-card landing-card-recall" onClick={onFlashcards}>
          <span className="landing-card-icon">
            <GalleryVerticalEnd size={40} aria-hidden />
          </span>
          <span className="landing-card-body">
            <span className="landing-card-title">Flashcards</span>
            <span className="landing-card-desc">
              Paste or upload notes. Cards, a quiz, blanks, and a matching game.
            </span>
            <span className="landing-features">
              <span className="landing-feature"><GalleryVerticalEnd size={15} aria-hidden /> Cards</span>
              <span className="landing-feature"><ListChecks size={15} aria-hidden /> Quiz</span>
              <span className="landing-feature"><PenLine size={15} aria-hidden /> Blanks</span>
              <span className="landing-feature"><Grid2x2 size={15} aria-hidden /> Match</span>
            </span>
          </span>
          <span className="landing-card-foot">
            <span className="meta-chip">{notes} {notes === 1 ? 'set' : 'sets'}</span>
            <span className="landing-go">
              Open <ArrowRight size={16} aria-hidden />
            </span>
          </span>
        </button>

        <button type="button" className="landing-card landing-card-review" onClick={onPapers}>
          <span className="landing-card-icon">
            <BookOpen size={40} aria-hidden />
          </span>
          <span className="landing-card-body">
            <span className="landing-card-title">Papers</span>
            <span className="landing-card-desc">
              Drop a PDF, or paste a PMID or DOI. Then study it the same way.
            </span>
            <span className="landing-features">
              <span className="landing-feature"><Table2 size={15} aria-hidden /> Tables</span>
              <span className="landing-feature"><Sigma size={15} aria-hidden /> Equations</span>
              <span className="landing-feature"><Upload size={15} aria-hidden /> PDF</span>
            </span>
          </span>
          <span className="landing-card-foot">
            <span className="meta-chip">{papers} {papers === 1 ? 'paper' : 'papers'}</span>
            <span className="landing-go">
              Open <ArrowRight size={16} aria-hidden />
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
