import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw, Shuffle, Star, X } from 'lucide-react';
import type { SetProgress, StudyMaterial, TermCard } from '../model';
import { mulberry32, shuffle } from '../lib/questions';

type Filter = 'all' | 'weak' | 'starred';

interface FlashcardsProps {
  material: StudyMaterial;
  progress: SetProgress;
  onAnswer: (cardId: string, correct: boolean) => void;
  onToggleStar: (cardId: string) => void;
}

export function Flashcards({ material, progress, onAnswer, onToggleStar }: FlashcardsProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [termFirst, setTermFirst] = useState(true);
  const [seed, setSeed] = useState(0);
  const [roundKey, setRoundKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const [done, setDone] = useState(false);

  // The deck is frozen for the round: progress changes mid-round must not reorder it.
  const deck: TermCard[] = useMemo(() => {
    const source = material.terms.filter((card) => {
      if (filter === 'weak') return (progress.cards[card.id]?.box ?? 0) < 3;
      if (filter === 'starred') return progress.cards[card.id]?.starred === true;
      return true;
    });
    return seed === 0 ? source : shuffle(source, mulberry32(seed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, filter, seed, roundKey]);

  const restart = (nextFilter?: Filter) => {
    if (nextFilter) setFilter(nextFilter);
    setRoundKey((k) => k + 1);
    setIndex(0);
    setFlipped(false);
    setTally({ got: 0, missed: 0 });
    setDone(false);
  };

  const card = deck[index];

  const advance = () => {
    setFlipped(false);
    if (index + 1 >= deck.length) setDone(true);
    else setIndex(index + 1);
  };

  const grade = (correct: boolean) => {
    if (!card) return;
    onAnswer(card.id, correct);
    setTally((t) => ({ got: t.got + (correct ? 1 : 0), missed: t.missed + (correct ? 0 : 1) }));
    advance();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (done || !card) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        advance();
      } else if (e.key === 'ArrowLeft' && index > 0) {
        setFlipped(false);
        setIndex(index - 1);
      } else if (e.key === '1' && flipped) {
        grade(false);
      } else if (e.key === '2' && flipped) {
        grade(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (material.terms.length === 0) {
    return <EmptyModeNote text="No term cards were found in this set. Add lines like “**Term**: definition” to your notes." />;
  }

  if (deck.length === 0) {
    return (
      <div className="mode-empty">
        <p>{filter === 'weak' ? 'Nothing left to review — every card is mastered.' : 'No starred cards yet. Star cards while you study.'}</p>
        <button type="button" className="btn" onClick={() => restart('all')}>
          Study all cards
        </button>
      </div>
    );
  }

  if (done) {
    const total = tally.got + tally.missed;
    return (
      <div className="round-summary fade-in">
        <h2>Round complete</h2>
        <p className="round-score">
          {tally.got} of {total} right{total > 0 && tally.missed === 0 ? ' — perfect!' : ''}
        </p>
        <div className="round-actions">
          <button type="button" className="btn btn-primary" onClick={() => restart()}>
            <RotateCcw size={16} aria-hidden /> Study again
          </button>
          <button type="button" className="btn" onClick={() => restart('weak')}>
            Review weak cards
          </button>
        </div>
      </div>
    );
  }

  const starred = card ? progress.cards[card.id]?.starred === true : false;

  return (
    <div className="flashcards fade-in">
      <div className="mode-toolbar">
        <div className="toolbar-group" role="group" aria-label="Card filter">
          {(['all', 'weak', 'starred'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'chip-active' : ''}`}
              onClick={() => restart(f)}
            >
              {f === 'all' ? `All (${material.terms.length})` : f === 'weak' ? 'Weak' : 'Starred'}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <button type="button" className="chip" onClick={() => { setTermFirst((v) => !v); setFlipped(false); }}>
            Front: {termFirst ? 'term' : 'definition'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              setSeed((Date.now() % 2147483647) || 1);
              restart();
            }}
          >
            <Shuffle size={14} aria-hidden /> Shuffle
          </button>
        </div>
      </div>

      <div className="progress-track" aria-hidden>
        <div className="progress-fill" style={{ width: `${(index / deck.length) * 100}%` }} />
      </div>
      <div className="card-counter">
        {index + 1} / {deck.length}
      </div>

      {card && (
        <button type="button" className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
          <span className="flashcard-inner">
            <span className="flashcard-face flashcard-front">
              <span className="face-label">{termFirst ? 'Term' : 'Definition'}</span>
              <span className="face-text">{termFirst ? card.term : card.definition}</span>
              <span className="face-hint">Tap or press space to flip</span>
            </span>
            <span className="flashcard-face flashcard-back">
              <span className="face-label">{termFirst ? 'Definition' : 'Term'}</span>
              <span className="face-text">{termFirst ? card.definition : card.term}</span>
              <span className="face-section">{card.section}</span>
            </span>
          </span>
        </button>
      )}

      <div className="card-controls">
        <button
          type="button"
          className="icon-btn"
          disabled={index === 0}
          onClick={() => {
            setFlipped(false);
            setIndex(index - 1);
          }}
          aria-label="Previous card"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>

        {flipped ? (
          <div className="grade-row">
            <button type="button" className="btn btn-danger" onClick={() => grade(false)}>
              <X size={16} aria-hidden /> Still learning
            </button>
            <button type="button" className="btn btn-success" onClick={() => grade(true)}>
              <Check size={16} aria-hidden /> Got it
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`icon-btn ${starred ? 'icon-btn-active' : ''}`}
            onClick={() => card && onToggleStar(card.id)}
            aria-label={starred ? 'Unstar card' : 'Star card'}
          >
            <Star size={18} aria-hidden fill={starred ? 'currentColor' : 'none'} />
          </button>
        )}

        <button type="button" className="icon-btn" onClick={advance} aria-label="Next card">
          <ArrowRight size={18} aria-hidden />
        </button>
      </div>

      <p className="kbd-hint">
        <span className="kbd">space</span> flip · <span className="kbd">←</span>
        <span className="kbd">→</span> move · <span className="kbd">1</span> missed · <span className="kbd">2</span> got it
      </p>
    </div>
  );
}

export function EmptyModeNote({ text }: { text: string }) {
  return (
    <div className="mode-empty">
      <p>{text}</p>
    </div>
  );
}
