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

/**
 * A stable identity for a fetched paper. Reference lists cite the same work by
 * PMID, DOI, and PMCID at once, so bulk imports must collapse them.
 */
export function paperIdentity(meta: { pmid?: string; pmcid?: string; doi?: string; title?: string }): string {
  if (meta.pmid) return `pmid:${meta.pmid}`;
  if (meta.pmcid) return `pmcid:${meta.pmcid.toUpperCase()}`;
  if (meta.doi) return `doi:${meta.doi.toLowerCase()}`;
  return `title:${(meta.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

/** Keep the first copy of each distinct paper, preferring richer full text. */
export function dedupePapers<T extends { meta: { pmid?: string; pmcid?: string; doi?: string; title?: string }; fullText?: boolean }>(
  items: T[],
): T[] {
  const byIdentity = new Map<string, T>();
  for (const item of items) {
    const key = paperIdentity(item.meta);
    const existing = byIdentity.get(key);
    if (!existing || (item.fullText === true && existing.fullText !== true)) byIdentity.set(key, item);
  }
  return [...byIdentity.values()];
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
