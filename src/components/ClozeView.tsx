import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Eye, Lightbulb, RotateCcw } from 'lucide-react';
import type { ClozeCard, SetProgress, StudyMaterial } from '../model';
import { BLANK } from '../lib/extract';
import { checkAnswer } from '../lib/answer';
import { mulberry32, shuffle } from '../lib/questions';
import { EmptyModeNote } from './Flashcards';

interface ClozeViewProps {
  material: StudyMaterial;
  progress: SetProgress;
  onAnswer: (cardId: string, correct: boolean) => void;
}

type Status = 'idle' | 'close' | 'correct' | 'revealed';

export function ClozeView({ material, progress, onAnswer }: ClozeViewProps) {
  const [roundKey, setRoundKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [hint, setHint] = useState(false);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Weak cards first, then the rest — order frozen per round.
  const deck: ClozeCard[] = useMemo(() => {
    const rng = mulberry32(roundKey + 1);
    const weak = material.clozes.filter((c) => (progress.cards[c.id]?.box ?? 0) < 3);
    const strong = material.clozes.filter((c) => (progress.cards[c.id]?.box ?? 0) >= 3);
    return [...shuffle(weak, rng), ...shuffle(strong, rng)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, roundKey]);

  if (material.clozes.length === 0) {
    return (
      <EmptyModeNote text="No fill-in-the-blank sentences were found. Bold the key phrases in your prose (like **this**) and Recall will blank them out." />
    );
  }

  const card = deck[index];
  const done = index >= deck.length;

  const restart = () => {
    setRoundKey((k) => k + 1);
    setIndex(0);
    setInput('');
    setStatus('idle');
    setHint(false);
    setTally({ got: 0, missed: 0 });
  };

  if (done) {
    const total = tally.got + tally.missed;
    return (
      <div className="round-summary fade-in">
        <h2>Blanks complete</h2>
        <p className="round-score">
          {tally.got} of {total} filled correctly
        </p>
        <div className="round-actions">
          <button type="button" className="btn btn-primary" onClick={restart}>
            <RotateCcw size={16} aria-hidden /> Go again
          </button>
        </div>
      </div>
    );
  }

  const advance = () => {
    setIndex(index + 1);
    setInput('');
    setStatus('idle');
    setHint(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = () => {
    if (status === 'correct' || status === 'revealed') {
      advance();
      return;
    }
    if (!input.trim()) return;
    const result = checkAnswer(input, card.answer);
    if (result.correct) {
      onAnswer(card.id, true);
      setTally((t) => ({ ...t, got: t.got + 1 }));
      setStatus('correct');
    } else if (result.close && status !== 'close') {
      setStatus('close'); // one free retry when the guess was near
    } else {
      onAnswer(card.id, false);
      setTally((t) => ({ ...t, missed: t.missed + 1 }));
      setStatus('revealed');
    }
  };

  const reveal = () => {
    if (status === 'correct' || status === 'revealed') return;
    onAnswer(card.id, false);
    setTally((t) => ({ ...t, missed: t.missed + 1 }));
    setStatus('revealed');
  };

  const promptParts = card.prompt.split(BLANK);
  const settled = status === 'correct' || status === 'revealed';

  return (
    <div className="cloze fade-in" key={`${roundKey}:${index}`}>
      <div className="progress-track" aria-hidden>
        <div className="progress-fill" style={{ width: `${(index / deck.length) * 100}%` }} />
      </div>
      <div className="quiz-meta">
        <span className="card-counter">
          {index + 1} / {deck.length}
        </span>
        <span className="meta-chip">{card.section}</span>
      </div>

      <p className="cloze-prompt">
        {promptParts.map((part, i) => (
          <span key={i}>
            {part}
            {i < promptParts.length - 1 && (
              <span className={`cloze-blank ${settled ? 'cloze-blank-filled' : ''}`}>
                {settled ? card.answer : ' '.repeat(Math.min(14, Math.max(6, card.answer.length)))}
              </span>
            )}
          </span>
        ))}
      </p>

      {hint && !settled && (
        <p className="hint-line">
          Starts with “{card.answer[0]}” — {card.answer.length} letters
          {card.answer.includes(' ') ? `, ${card.answer.split(/\s+/).length} words` : ''}.
        </p>
      )}

      <form
        className="cloze-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type the missing words…"
          disabled={settled}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
        {settled ? (
          <button type="button" className="btn btn-primary" onClick={advance} autoFocus>
            Next <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
            Check
          </button>
        )}
      </form>

      <div className="cloze-feedback" aria-live="polite">
        {status === 'correct' && <span className="feedback-correct">Correct!</span>}
        {status === 'close' && <span className="feedback-close">So close — check the spelling and try once more.</span>}
        {status === 'revealed' && (
          <span className="feedback-wrong">
            The answer was “{card.answer}”.
          </span>
        )}
      </div>

      {!settled && (
        <div className="cloze-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHint(true)} disabled={hint}>
            <Lightbulb size={14} aria-hidden /> Hint
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reveal}>
            <Eye size={14} aria-hidden /> Reveal
          </button>
        </div>
      )}
    </div>
  );
}
