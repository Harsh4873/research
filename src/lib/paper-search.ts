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
    title: fold(front.title ?? set.title ?? ''),
    authors: fold(front.authors ?? ''),
    journal: fold(front.journal ?? ''),
    year: front.year ?? '',
    ids,
    body: fold(stripFrontMatter(set.markdown)),
  };
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function journalAbbrev(journal: string): string {
  return journal
    .split(/[\s:/,.-]+/)
    .filter((word) => word.length > 0 && !/^(the|of|and|for|in|on|a|an|&)$/i.test(word))
    .map((word) => word[0])
    .join('');
}

function normalizeQueryToken(token: string): string {
  const labelled = token.match(/^(pmid|pmcid|pmc|doi)[:#]*(.+)$/i);
  if (labelled) {
    const kind = labelled[1].toLowerCase();
    const value = labelled[2].replace(/^pmc/i, '');
    if (kind === 'pmc' || kind === 'pmcid') return `pmc${value}`;
    return value;
  }
  const pmcBare = token.match(/^pmc(\d+)$/i);
  if (pmcBare) return `pmc${pmcBare[1]}`;
  return token;
}

function tokenize(query: string): string[] {
  const raw = fold(query)
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const current = raw[i];
    const labelOnly = current.match(/^(pmid|pmcid|pmc|doi)[:#]*$/i);
    if (labelOnly && raw[i + 1]) {
      out.push(normalizeQueryToken(`${labelOnly[1]}${raw[i + 1]}`));
      i += 1;
      continue;
    }
    const token = normalizeQueryToken(current);
    if (token.length > 1) out.push(token);
  }
  return out;
}

function idsMatch(ids: string[], token: string): 'exact' | 'partial' | null {
  const bare = token.replace(/^pmc/i, '');
  for (const id of ids) {
    const idBare = id.replace(/^pmc/i, '');
    if (id === token || idBare === token || idBare === bare) return 'exact';
  }
  for (const id of ids) {
    if (id.includes(token)) return 'partial';
  }
  return null;
}

function titleWords(title: string): string[] {
  return title.split(/[^a-z0-9]+/).filter((word) => word.length > 1);
}

function surnames(authors: string): string[] {
  return authors
    .split(/[,;]/)
    .map((name) => name.trim().split(/\s+/).filter(Boolean).pop() ?? '')
    .filter((name) => name.length > 1);
}

function snippetAround(body: string, token: string): string | undefined {
  const at = body.indexOf(token);
  if (at < 0) return undefined;
  const start = Math.max(0, at - 60);
  const end = Math.min(body.length, at + token.length + 90);
  const text = body
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .replace(/^\S*\s/, start > 0 ? '' : '$&')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${end < body.length ? '…' : ''}`;
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
      const idHit = idsMatch(record.ids, token);
      if (idHit === 'exact') {
        tokenScore = 100;
        fields.add('id');
      } else if (idHit === 'partial') {
        tokenScore = 40;
        fields.add('id');
      }
      if (record.title.includes(token)) {
        tokenScore = Math.max(tokenScore, record.title.startsWith(token) ? 30 : 20);
        fields.add('title');
      } else if (titleWords(record.title).some((word) => word.startsWith(token))) {
        tokenScore = Math.max(tokenScore, 18);
        fields.add('title');
      }
      if (surnames(record.authors).includes(token) || record.authors.split(/\s+/).includes(token)) {
        tokenScore = Math.max(tokenScore, 22);
        fields.add('author');
      } else if (record.authors.includes(token)) {
        tokenScore = Math.max(tokenScore, 15);
        fields.add('author');
      }
      if (journalAbbrev(record.journal) === token) {
        tokenScore = Math.max(tokenScore, 16);
        fields.add('journal');
      } else if (record.journal.includes(token)) {
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
        snippet = snippet ?? snippetAround(record.body, token);
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
