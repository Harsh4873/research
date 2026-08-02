import type { StudySet } from '../model';
import { paperFrontMatter, paperIdentity, isPaperSet, type PaperFrontMatter } from './paper-set';
import type { PaperId } from './paper-id';
import { normalizePmcid } from './paper-id';

export interface PaperRecord {
  set: StudySet;
  front: PaperFrontMatter;
  title: string;
  authors: string;
  journal: string;
  year: string;
  ids: string[];
  /** Lower-cased body text, without the front matter. */
  body: string;
}

export type MatchField = 'title' | 'author' | 'journal' | 'year' | 'id' | 'text';

export interface PaperMatch {
  set: StudySet;
  front: PaperFrontMatter;
  score: number;
  fields: MatchField[];
  /** A short excerpt when the match was in the body text. */
  snippet?: string;
}

function stripFrontMatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  return end < 0 ? markdown : markdown.slice(end + 4);
}

export function paperRecord(set: StudySet): PaperRecord {
  const front = paperFrontMatter(set.markdown);
  const ids = [front.pmid, front.pmcid, front.doi].filter(Boolean).map((value) => String(value).toLowerCase());
  return {
    set,
    front,
    title: (front.title ?? set.title ?? '').toLowerCase(),
    authors: (front.authors ?? '').toLowerCase(),
    journal: (front.journal ?? '').toLowerCase(),
    year: front.year ?? '',
    ids,
    body: stripFrontMatter(set.markdown).toLowerCase(),
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function snippetAround(body: string, original: string, token: string): string | undefined {
  const at = body.indexOf(token);
  if (at < 0) return undefined;
  const source = stripFrontMatter(original);
  const start = Math.max(0, at - 60);
  const end = Math.min(source.length, at + token.length + 90);
  const text = source
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .replace(/^\S*\s/, start > 0 ? '' : '$&')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${end < source.length ? '…' : ''}`;
}

/**
 * Search the saved papers. Every token must match somewhere, so extra words
 * narrow rather than widen; where a token matched decides the ranking.
 */
export function searchPapers(sets: StudySet[], query: string): PaperMatch[] {
  const papers = sets.filter((set) => isPaperSet(set.id));
  const tokens = tokenize(query);
  const records = papers.map(paperRecord);

  if (tokens.length === 0) {
    return records.map((record) => ({ set: record.set, front: record.front, score: 0, fields: [] }));
  }

  const matches: PaperMatch[] = [];
  for (const record of records) {
    let score = 0;
    const fields = new Set<MatchField>();
    let snippet: string | undefined;
    let everyTokenMatched = true;

    for (const token of tokens) {
      let tokenScore = 0;
      if (record.ids.some((id) => id === token)) {
        tokenScore = 100; // an exact identifier is unambiguous
        fields.add('id');
      } else if (record.ids.some((id) => id.includes(token))) {
        tokenScore = 40;
        fields.add('id');
      }
      if (record.title.includes(token)) {
        tokenScore = Math.max(tokenScore, record.title.startsWith(token) ? 30 : 20);
        fields.add('title');
      }
      if (record.authors.includes(token)) {
        tokenScore = Math.max(tokenScore, 15);
        fields.add('author');
      }
      if (record.journal.includes(token)) {
        tokenScore = Math.max(tokenScore, 10);
        fields.add('journal');
      }
      if (record.year === token) {
        tokenScore = Math.max(tokenScore, 8);
        fields.add('year');
      }
      if (tokenScore === 0 && record.body.includes(token)) {
        tokenScore = 3;
        fields.add('text');
        snippet = snippet ?? snippetAround(record.body, record.set.markdown, token);
      }
      if (tokenScore === 0) {
        everyTokenMatched = false;
        break;
      }
      score += tokenScore;
    }

    if (!everyTokenMatched) continue;
    matches.push({ set: record.set, front: record.front, score, fields: [...fields], snippet });
  }

  return matches.sort((a, b) => b.score - a.score || a.set.title.localeCompare(b.set.title));
}

/** The saved paper an identifier already refers to, if there is one. */
export function findExistingPaper(sets: StudySet[], id: PaperId): StudySet | undefined {
  const wanted =
    id.kind === 'pmid'
      ? `pmid:${id.value}`
      : id.kind === 'pmcid'
        ? `pmcid:${normalizePmcid(id.value).toUpperCase()}`
        : `doi:${id.value.toLowerCase()}`;

  return sets
    .filter((set) => isPaperSet(set.id))
    .find((set) => {
      const front = paperFrontMatter(set.markdown);
      if (paperIdentity(front) === wanted) return true;
      // A paper stored by PMID is still the paper this DOI points at.
      if (id.kind === 'pmid' && front.pmid === id.value) return true;
      if (id.kind === 'pmcid' && front.pmcid && normalizePmcid(front.pmcid) === normalizePmcid(id.value)) return true;
      if (id.kind === 'doi' && front.doi && front.doi.toLowerCase() === id.value.toLowerCase()) return true;
      return false;
    });
}
