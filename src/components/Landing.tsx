import { ArrowRight, FileText, FlaskConical, GalleryVerticalEnd, Grid2x2, ListChecks, Microscope, PenLine, Sigma, Table2, Upload } from 'lucide-react';
import type { AppData } from '../model';
import { isPaperSet } from '../lib/paper-set';

interface LandingProps {
  data: AppData;
  onRecall: () => void;
  onReview: () => void;
}

export function Landing({ data, onRecall, onReview }: LandingProps) {
  const papers = data.sets.filter((set) => isPaperSet(set.id)).length;
  const notes = data.sets.length - papers;

  return (
    <div className="landing fade-in">
      <section className="landing-hero">
        <h1 className="landing-title">What are you studying today?</h1>
        <p className="landing-sub">
          Two ways in: bring your own notes, or pull a paper straight from PubMed. Either way you end up with the
          same study kit — flashcards, quizzes, fill-in-the-blanks, and a matching game.
        </p>
      </section>

      <div className="landing-grid">
        <button type="button" className="landing-card landing-card-recall" onClick={onRecall}>
          <span className="landing-card-icon">
            <FileText size={26} aria-hidden />
          </span>
          <span className="landing-card-body">
            <span className="landing-card-title">Recall</span>
            <span className="landing-card-desc">
              Paste or upload your own markdown notes and turn them into a study set.
            </span>
            <span className="landing-features">
              <span className="landing-feature"><GalleryVerticalEnd size={14} aria-hidden /> Flashcards</span>
              <span className="landing-feature"><ListChecks size={14} aria-hidden /> Quiz</span>
              <span className="landing-feature"><PenLine size={14} aria-hidden /> Blanks</span>
              <span className="landing-feature"><Grid2x2 size={14} aria-hidden /> Match</span>
            </span>
          </span>
          <span className="landing-card-foot">
            <span className="meta-chip">{notes} note {notes === 1 ? 'set' : 'sets'}</span>
            <span className="landing-go">
              Open <ArrowRight size={15} aria-hidden />
            </span>
          </span>
        </button>

        <button type="button" className="landing-card landing-card-review" onClick={onReview}>
          <span className="landing-card-icon">
            <Microscope size={26} aria-hidden />
          </span>
          <span className="landing-card-body">
            <span className="landing-card-title">Review</span>
            <span className="landing-card-desc">
              Give it a PMID, DOI, or a PDF. It pulls the paper apart into clean markdown, then studies exactly
              like Recall.
            </span>
            <span className="landing-features">
              <span className="landing-feature"><FlaskConical size={14} aria-hidden /> Sections</span>
              <span className="landing-feature"><Table2 size={14} aria-hidden /> Tables</span>
              <span className="landing-feature"><Sigma size={14} aria-hidden /> Equations</span>
              <span className="landing-feature"><Upload size={14} aria-hidden /> Supplements</span>
            </span>
          </span>
          <span className="landing-card-foot">
            <span className="meta-chip">{papers} {papers === 1 ? 'paper' : 'papers'}</span>
            <span className="landing-go">
              Open <ArrowRight size={15} aria-hidden />
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
