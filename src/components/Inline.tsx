import type { ReactNode } from 'react';
import type { Inline } from '../model';
import { normalizeKey } from '../lib/extract';

interface InlineRunsProps {
  runs: Inline[];
  /** Normalized keys of known terms; matching bold runs get highlighted. */
  termKeys?: Set<string>;
}

/** DOIs, PubMed ids, and bare URLs written as plain text become links. */
const AUTO_LINK_RE = /(https?:\/\/[^\s<>()[\]]+|\b10\.\d{4,9}\/[^\s<>()[\],;]+|\bPMCID?\s*[:#]?\s*PMC\d+|\bPMC\d+\b|\bPMID\s*[:#]?\s*\d{1,9}\b)/gi;

function hrefFor(token: string): string | null {
  const text = token.trim().replace(/[.,;]+$/, '');
  if (/^https?:\/\//i.test(text)) return text;
  if (/^10\.\d{4,9}\//.test(text)) return `https://doi.org/${text}`;
  const pmc = text.match(/PMC(\d+)/i);
  if (pmc) return `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${pmc[1]}/`;
  const pmid = text.match(/PMID\s*[:#]?\s*(\d{1,9})/i);
  if (pmid) return `https://pubmed.ncbi.nlm.nih.gov/${pmid[1]}/`;
  return null;
}

export function autoLink(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(AUTO_LINK_RE.source, 'gi');

  while ((match = re.exec(text))) {
    const href = hrefFor(match[0]);
    if (!href) continue;
    if (match.index > last) out.push(text.slice(last, match.index));
    // Trailing punctuation belongs to the sentence, not the link.
    const trailing = match[0].match(/[.,;]+$/)?.[0] ?? '';
    const label = trailing ? match[0].slice(0, -trailing.length) : match[0];
    out.push(
      <a key={`${keyPrefix}-${match.index}`} href={href} target="_blank" rel="noreferrer noopener">
        {label}
      </a>,
    );
    if (trailing) out.push(trailing);
    last = match.index + match[0].length;
  }
  if (out.length === 0) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
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
            return <em key={i}>{autoLink(run.text, `i${i}`)}</em>;
          case 'code':
            return <code key={i}>{run.text}</code>;
          case 'link':
            return (
              <a key={i} href={run.href} target="_blank" rel="noreferrer noopener">
                {run.text}
              </a>
            );
          default:
            return <span key={i}>{autoLink(run.text, `t${i}`)}</span>;
        }
      })}
    </>
  );
}
