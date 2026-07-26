import type { Inline } from '../model';
import { normalizeKey } from '../lib/extract';

interface InlineRunsProps {
  runs: Inline[];
  /** Normalized keys of known terms; matching bold runs get highlighted. */
  termKeys?: Set<string>;
}

export function InlineRuns({ runs, termKeys }: InlineRunsProps) {
  return (
    <>
      {runs.map((run, i) => {
        switch (run.kind) {
          case 'bold': {
            const known = termKeys?.has(normalizeKey(run.text));
            return (
              <strong key={i} className={known ? 'term-mark' : undefined}>
                {run.text}
              </strong>
            );
          }
          case 'italic':
            return <em key={i}>{run.text}</em>;
          case 'code':
            return <code key={i}>{run.text}</code>;
          case 'link':
            return (
              <a key={i} href={run.href} target="_blank" rel="noreferrer noopener">
                {run.text}
              </a>
            );
          default:
            return <span key={i}>{run.text}</span>;
        }
      })}
    </>
  );
}
