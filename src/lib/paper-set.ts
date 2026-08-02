import type { StudySet } from '../model';
import { hashId } from './extract';
import { parseMarkdown } from './markdown';

export const PAPER_PREFIX = 'paper-';

/**
 * Review papers are ordinary study sets marked by an id prefix, so they sync,
 * export, and study exactly like note sets with no schema change.
 */
export function isPaperSet(setId: string): boolean {
  return setId.startsWith(PAPER_PREFIX);
}

export function createPaperSet(title: string, markdown: string, now: number): StudySet {
  const id = `${PAPER_PREFIX}${now.toString(36)}-${hashId(markdown).slice(0, 6)}`;
  return { id, title: title.trim() || 'Untitled paper', markdown, createdAt: now, updatedAt: now };
}

export interface PaperFrontMatter {
  title?: string;
  authors?: string;
  journal?: string;
  year?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  source?: string;
  license?: string;
  keywords?: string;
}

/** Read the YAML front matter Review writes at the top of each paper set. */
export function paperFrontMatter(markdown: string): PaperFrontMatter {
  return parseMarkdown(markdown).meta ?? {};
}

/** A short "Journal · Year · PMID" line for cards and headers. */
export function paperSubtitle(meta: PaperFrontMatter): string {
  return [meta.journal, meta.year, meta.pmid ? `PMID ${meta.pmid}` : meta.doi ? `DOI ${meta.doi}` : '']
    .filter(Boolean)
    .join(' · ');
}
