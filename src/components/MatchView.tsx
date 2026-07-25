import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Timer, Trophy } from 'lucide-react';
import type { SetProgress, StudyMaterial } from '../model';
import { buildMatchRound, mulberry32, shuffle } from '../lib/questions';
import { EmptyModeNote } from './Flashcards';

interface MatchViewProps {
  material: StudyMaterial;
  progress: SetProgress;
  onAnswer: (cardId: string, correct: boolean) => void;
  onBestTime: (ms: number) => void;
}

interface Tile {
  key: string;
  pairId: string;
  text: string;
  isTerm: boolean;
}

const ROUND_SIZE = 6;

export function MatchView({ material, progress, onAnswer, onBestTime }: MatchViewProps) {
  const [seed, setSeed] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<Set<string>>(new Set());
  const missedPairs = useRef<Set<string>>(new Set());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const recorded = useRef(false);

  const tiles: Tile[] = useMemo(() => {
    const pairs = buildMatchRound(material.terms, ROUND_SIZE, seed);
    const all: Tile[] = pairs.flatMap((p) => [
      { key: `${p.id}:t`, pairId: p.id, text: p.term, isTerm: true },
      { key: `${p.id}:d`, pairId: p.id, text: truncate(p.definition, 110), isTerm: false },
    ]);
    return shuffle(all, mulberry32(seed * 7 + 1));
  }, [material, seed]);

  const pairCount = tiles.length / 2;
  const complete = pairCount > 0 && matched.size === tiles.length;

  useEffect(() => {
    if (startedAt === null || complete) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [startedAt, complete]);

  useEffect(() => {
    if (!complete || startedAt === null || recorded.current) return;
    recorded.current = true;
    const ms = Date.now() - startedAt;
    setFinalMs(ms);
    // Pairs never missed count as correct answers; fumbled pairs as wrong.
    for (const tile of tiles) {
      if (tile.isTerm) onAnswer(tile.pairId, !missedPairs.current.has(tile.pairId));
    }
    if (!progress.bestMatchMs || ms < progress.bestMatchMs) onBestTime(ms);
  }, [complete, startedAt, tiles, onAnswer, onBestTime, progress.bestMatchMs]);

  if (material.terms.length < 3) {
    return <EmptyModeNote text="Match needs at least three term cards. Add more “**Term**: definition” lines to your notes." />;
  }

  const restart = () => {
    setSeed((Date.now() % 2147483647) || 1);
    setSelected(null);
    setMatched(new Set());
    setWrongFlash(new Set());
    missedPairs.current = new Set();
    setStartedAt(null);
    setElapsed(0);
    setFinalMs(null);
    recorded.current = false;
  };

  const clickTile = (tile: Tile) => {
    if (matched.has(tile.key) || complete) return;
    if (startedAt === null) setStartedAt(Date.now());
    if (selected === null) {
      setSelected(tile.key);
      return;
    }
    if (selected === tile.key) {
      setSelected(null);
      return;
    }
    const first = tiles.find((t) => t.key === selected)!;
    if (first.pairId === tile.pairId && first.isTerm !== tile.isTerm) {
      const next = new Set(matched);
      next.add(first.key).add(tile.key);
      setMatched(next);
      setSelected(null);
    } else {
      missedPairs.current.add(first.pairId).add(tile.pairId);
      const flash = new Set([first.key, tile.key]);
      setWrongFlash(flash);
      setSelected(null);
      setTimeout(() => setWrongFlash(new Set()), 450);
    }
  };

  const best = progress.bestMatchMs;

  return (
    <div className="match fade-in">
      <div className="match-hud">
        <span className="meta-chip">
          <Timer size={14} aria-hidden /> {formatMs(finalMs ?? elapsed)}
        </span>
        {best && (
          <span className="meta-chip">
            <Trophy size={14} aria-hidden /> Best {formatMs(best)}
          </span>
        )}
        <span className="card-counter">
          {matched.size / 2} / {pairCount} pairs
        </span>
      </div>

      {complete ? (
        <div className="round-summary fade-in">
          <h2>{finalMs !== null && best !== undefined && finalMs <= best ? 'New best time!' : 'All matched!'}</h2>
          <p className="round-score">{formatMs(finalMs ?? 0)}</p>
          <div className="round-actions">
            <button type="button" className="btn btn-primary" onClick={restart}>
              <RotateCcw size={16} aria-hidden /> Play again
            </button>
          </div>
        </div>
      ) : (
        <div className="match-grid">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className={[
                'match-tile',
                tile.isTerm ? 'tile-term' : 'tile-def',
                selected === tile.key ? 'tile-selected' : '',
                matched.has(tile.key) ? 'tile-matched' : '',
                wrongFlash.has(tile.key) ? 'tile-wrong' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => clickTile(tile)}
              disabled={matched.has(tile.key)}
            >
              {tile.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
