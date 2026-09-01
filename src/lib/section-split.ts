/**
 * Split mashed paper text onto its real headings.
 *
 * PDFs and pasted full text often glue "Abstract We found…" onto one line.
 * The owner's Simplfy app already solved this for dropped papers; Research
 * uses the same split so Skim can see sections as soon as they appear.
 */

import { bareHeading, isNonStudySection } from './extract';

export const PAPER_SECTION_NAMES = [
  'materials and methods',
  'methods and materials',
  'results and discussion',
  'supplementary information',
  'supplementary material',
  'supporting information',
  'experimental procedures',
  'author contributions',
  'competing interests',
  'conflict of interest',
  'data availability',
  'code availability',
  'related works',
  'related work',
  'acknowledgements',
  'acknowledgments',
  'bibliography',
  'introduction',
  'limitations',
  'future work',
  'conclusions',
  'conclusion',
  'references',
  'background',
  'appendix',
  'abstract',
  'summary',
  'methods',
  'materials',
  'results',
  'discussion',
  'funding',
] as const;

/** Headings that still glue onto body text even without a sentence break. */
const BARE_INLINE_NAMES = [
  'abstract',
  'introduction',
  'references',
  'bibliography',
  'acknowledgments',
  'acknowledgements',
  'conclusion',
  'conclusions',
] as const;

export type SectionRole =
  | 'abstract'
  | 'intro'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'conclusion'
  | 'other'
  | 'apparatus';

function ciToken(name: string): string {
  return name
    .split(' ')
    .map((word) =>
      word
        .split('')
        .map((ch) => (/[a-z]/i.test(ch) ? `[${ch.toUpperCase()}${ch.toLowerCase()}]` : ch))
        .join(''),
    )
    .join('\\s+');
}

const SECTION_CI = PAPER_SECTION_NAMES.map(ciToken).join('|');
const BARE_INLINE_CI = BARE_INLINE_NAMES.map(ciToken).join('|');

export function prettySectionName(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim().replace(/[:.]+$/, '');
  const numbered = clean.match(/^(\d{1,2}(?:\.\d{1,2}){0,2})[.)]?\s+(.*)$/);
  const body = numbered ? numbered[2] : clean;
  const pretty =
    body === body.toUpperCase()
      ? body
          .toLowerCase()
          .replace(/\b([a-z])/g, (m) => m.toUpperCase())
          .replace(/\bAnd\b/g, 'and')
          .replace(/\bOf\b/g, 'of')
      : body;
  return numbered ? `${numbered[1]} ${pretty}` : pretty;
}

/**
 * Insert line breaks around recognised IMRAD headings that were glued into
 * surrounding prose. Safe on already-sectioned markdown: a heading that already
 * sits on its own line is left alone.
 */
export function explodeInlineSections(text: string): string {
  const numbered = String.raw`\d{1,2}(?:\.\d{1,2}){0,2}[.)]?\s+(?:${SECTION_CI})`;
  const re = new RegExp(
    String.raw`(^|\n|(?<=[.!?])\s+)((?:${numbered})|(?:${SECTION_CI}))(?=\s+[A-Z(0-9])|(?<=[a-z])\s+(${BARE_INLINE_CI})(?=\s+[A-Z(0-9])`,
    'gu',
  );
  return text.replace(re, (full, pre: string | undefined, heading: string | undefined, bare: string | undefined) => {
    const label = (heading || bare || '').replace(/\s+/g, ' ').trim();
    if (!label) return full;
    if (pre !== undefined && heading) {
      const pad = /(?:^|\n)$/.test(pre) ? pre : `${pre.replace(/\s+$/, '')}\n\n`;
      return `${pad}${prettySectionName(label)}\n\n`;
    }
    return `\n\n${prettySectionName(label)}\n\n`;
  });
}

/** Split exploded text into non-empty lines. */
export function explodeToLines(text: string): string[] {
  return explodeInlineSections(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function classifySectionRole(title: string): SectionRole {
  const bare = bareHeading(title);
  if (isNonStudySection(bare)) return 'apparatus';
  if (/^(?:abstract|summary|synopsis)$/i.test(bare)) return 'abstract';
  if (/^(?:introduction|background|related works?)$/i.test(bare)) return 'intro';
  if (/method|material|experimental/i.test(bare)) return 'methods';
  if (/^results?\b/i.test(bare) && !/discussion/i.test(bare)) return 'results';
  if (/discussion/i.test(bare)) return 'discussion';
  if (/conclusion|implications|take[- ]?home/i.test(bare)) return 'conclusion';
  if (/limitation/i.test(bare)) return 'discussion';
  return 'other';
}

/** Publishing apparatus and back matter that do not belong on Skim. */
export function skipFromSkim(title: string): boolean {
  const role = classifySectionRole(title);
  if (role === 'apparatus') return true;
  const bare = bareHeading(title);
  return /^(?:contents?|glossary|index|abbreviations|supplementary|supporting|appendix)\b/i.test(bare);
}
