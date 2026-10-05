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

/**
 * Heading that separates user annotations from fetched paper content. Notes
 * stay inside the paper markdown so sync, export, and study keep working with
 * no schema change; refresh defines and preserves this section explicitly.
 */
export const ADDED_NOTES_HEADING = '## Added notes';

const ADDED_NOTES_LINE = /^## added notes\s*$/i;

export interface PaperContent {
  /** Fetched paper content with any user notes section removed. */
  content: string;
  /** The preserved user notes section, heading included, or '' when absent. */
  notes: string;
}

/** Split a paper markdown into fetched content and the user notes section. */
export function splitPaperNotes(markdown: string): PaperContent {
  const lines = markdown.split('\n');
  const at = lines.findIndex((line) => ADDED_NOTES_LINE.test(line.trim()));
  if (at < 0) return { content: markdown, notes: '' };
  return {
    content: lines.slice(0, at).join('\n').trimEnd(),
    notes: lines.slice(at).join('\n').trim(),
  };
}

/** Append a user note under the notes heading, adding the heading when absent. */
export function appendPaperNote(markdown: string, note: string): string {
  const { content, notes } = splitPaperNotes(markdown);
  const body = note.trim();
  if (!notes) return `${content.trimEnd()}\n\n${ADDED_NOTES_HEADING}\n\n${body}\n`;
  return `${content.trimEnd()}\n\n${notes}\n\n${body}\n`;
}

/**
 * Merge a fresh fetch with the user's current notes. The fetched content wins;
 * the notes section from the current copy is preserved verbatim underneath.
 */
export function applyPaperRefresh(currentMarkdown: string, fetchedMarkdown: string): string {
  const { notes } = splitPaperNotes(currentMarkdown);
  const { content } = splitPaperNotes(fetchedMarkdown);
  if (!notes) return fetchedMarkdown;
  return `${content.trimEnd()}\n\n${notes}\n`;
}

/** A short "Journal · Year · PMID" line for cards and headers. */
export function paperSubtitle(meta: PaperFrontMatter): string {
  return [meta.journal, meta.year, meta.pmid ? `PMID ${meta.pmid}` : meta.doi ? `DOI ${meta.doi}` : '']
    .filter(Boolean)
    .join(' · ');
}
