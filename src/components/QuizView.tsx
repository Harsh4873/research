import { useMemo, useState } from 'react';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import type { SetProgress, StudyMaterial } from '../model';
import { buildQuiz, type QuizQuestion } from '../lib/questions';
import { weakCardIds } from '../lib/store';
import { EmptyModeNote } from './Flashcards';

interface QuizViewProps {
  material: StudyMaterial;
  progress: SetProgress;
  onAnswer: (cardId: string, correct: boolean) => void;
}

type Phase = 'setup' | 'run' | 'end';

interface Answered {
  question: QuizQuestion;
  picked: number;
}

export function QuizView({ material, progress, onAnswer }: QuizViewProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [length, setLength] = useState(10);
  const [weakOnly, setWeakOnly] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);

  const allIds = useMemo(
    () => [...material.terms.map((t) => t.id), ...material.clozes.map((c) => c.id)],
    [material],
  );

  if (material.terms.length < 4) {
    return (
      <EmptyModeNote text="Quizzes need at least four term cards to build multiple-choice options. Add more “**Term**: definition” lines to your notes." />
    );
  }

  const start = (ids?: Set<string>) => {
    const cardIds = ids ?? (weakOnly ? weakCardIds(progress, allIds) : undefined);
    const built = buildQuiz(material.terms, material.clozes, {
      count: length,
      seed: (Date.now() % 2147483647) || 1,
      cardIds: cardIds && cardIds.size > 0 ? cardIds : undefined,
    });
    setQuestions(built);
    setIndex(0);
    setPicked(null);
    setAnswered([]);
    setPhase(built.length > 0 ? 'run' : 'setup');
  };

  if (phase === 'setup') {
    const weakCount = weakCardIds(progress, allIds).size;
    return (
      <div className="quiz-setup fade-in">
        <h2>Quiz yourself</h2>
        <p className="quiz-sub">Multiple choice, built from your notes — term ↔ definition plus fill-the-blank rounds.</p>
        <div className="setup-row">
          <span className="field-label">Questions</span>
          <div className="toolbar-group" role="group" aria-label="Quiz length">
            {[5, 10, 20, 0].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip ${length === n ? 'chip-active' : ''}`}
                onClick={() => setLength(n)}
              >
                {n === 0 ? 'All' : n}
              </button>
            ))}
          </div>
        </div>
        <label className="setup-row check-row">
          <input type="checkbox" checked={weakOnly} onChange={(e) => setWeakOnly(e.target.checked)} />
          <span>
            Focus weak cards only{weakCount > 0 ? ` (${weakCount})` : ''}
          </span>
        </label>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => start()}>
          Start quiz
        </button>
      </div>
    );
  }

  if (phase === 'end') {
    const right = answered.filter((a) => a.picked === a.question.answerIndex);
    const missed = answered.filter((a) => a.picked !== a.question.answerIndex);
    const pct = answered.length > 0 ? Math.round((right.length / answered.length) * 100) : 0;
    return (
      <div className="quiz-end fade-in">
        <h2>Score: {pct}%</h2>
        <p className="round-score">
          {right.length} of {answered.length} correct
        </p>
        {missed.length > 0 && (
          <div className="missed-list">
            <h3>Worth another look</h3>
            {missed.map((a, i) => (
              <div key={i} className="missed-item">
                <div className="missed-q">{a.question.prompt}</div>
                <div className="missed-a">
                  <Check size={14} aria-hidden /> {a.question.options[a.question.answerIndex]}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="round-actions">
          <button type="button" className="btn btn-primary" onClick={() => start()}>
            <RotateCcw size={16} aria-hidden /> New quiz
          </button>
          {missed.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => start(new Set(missed.map((a) => a.question.cardId)))}
            >
              Retry missed only
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setPhase('setup')}>
            Settings
          </button>
        </div>
      </div>
    );
  }

  const question = questions[index];
  const kindLabel =
    question.kind === 'def-to-term'
      ? 'Which term matches this definition?'
      : question.kind === 'term-to-def'
        ? 'What does this term mean?'
        : 'Fill in the blank';

  const pick = (optionIndex: number) => {
    if (picked !== null) return;
    setPicked(optionIndex);
    onAnswer(question.cardId, optionIndex === question.answerIndex);
    setAnswered((list) => [...list, { question, picked: optionIndex }]);
  };

  const next = () => {
    if (index + 1 >= questions.length) setPhase('end');
    else {
      setIndex(index + 1);
      setPicked(null);
    }
  };

  return (
    <div className="quiz-run fade-in" key={index}>
      <div className="progress-track" aria-hidden>
        <div className="progress-fill" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>
      <div className="quiz-meta">
        <span className="card-counter">
          {index + 1} / {questions.length}
        </span>
        <span className="meta-chip">{question.section}</span>
      </div>

      <div className="quiz-question">
        <div className="question-kind">{kindLabel}</div>
        <div className={`question-prompt ${question.kind === 'cloze' ? 'question-cloze' : ''}`}>{question.prompt}</div>
      </div>

      <div className="options-list" role="listbox" aria-label="Answer options">
        {question.options.map((option, i) => {
          let cls = 'option';
          if (picked !== null) {
            if (i === question.answerIndex) cls += ' option-correct';
            else if (i === picked) cls += ' option-wrong';
            else cls += ' option-muted';
          }
          return (
            <button key={i} type="button" className={cls} onClick={() => pick(i)} disabled={picked !== null && i !== picked && i !== question.answerIndex}>
              <span className="option-letter">{String.fromCharCode(65 + i)}</span>
              <span className="option-text">{option}</span>
              {picked !== null && i === question.answerIndex && <Check size={16} aria-hidden />}
              {picked !== null && i === picked && i !== question.answerIndex && <X size={16} aria-hidden />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="quiz-next-row fade-in">
          <span className={picked === question.answerIndex ? 'feedback-correct' : 'feedback-wrong'}>
            {picked === question.answerIndex ? 'Correct!' : 'Not quite.'}
          </span>
          <button type="button" className="btn btn-primary" onClick={next} autoFocus>
            {index + 1 >= questions.length ? 'See results' : 'Next'} <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
