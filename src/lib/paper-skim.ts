/**
 * Deterministic paper skim: pick the conclusive sentences in each section,
 * then assemble a four-slot brief (asked / did / found / caveat).
 *
 * No model. Every rule is a regex or a score, so dropped PDFs and JATS
 * imports get the same Skim, and the tests pin the traps (first-sentence
 * "this paper is organized", affiliation lines, reference lists).
 */

import { classifySectionRole, skipFromSkim, type SectionRole } from './section-split';

export type { SectionRole };

export interface SkimSection {
  id: string;
  title: string;
  depth: number;
  role: SectionRole;
  gist: string;
  bullets: string[];
  numbers: string[];
  words: number;
  /** Aim/question sentence, when the section stated one. */
  aim: string;
  /** Finding sentence, when the section stated one. */
  finding: string;
  /** Limitation or hedge the reader should not miss. */
  caveat: string;
}

export interface PaperBrief {
  /** One conclusive sentence for the whole paper. */
  verdict: string;
  asked: string;
  did: string;
  found: string;
  caveat: string;
}

/**
 * Numbers a reader actually looks for: p-values, effect sizes, percentages,
 * counts with units, ratios, and large or decimal figures. Bare one- and
 * two-digit numbers are skipped — in a paper they are almost always noise.
 */
export const NUMBER_RE = new RegExp(
  [
    String.raw`\b[pP]\s*[<>=≤≥]\s*0?\.\d+`,
    String.raw`\b(?:aOR|aHR|OR|HR|RR|CI)\s*[=:]?\s*\d+(?:\.\d+)?`,
    String.raw`\b\d+(?:[.,]\d+)?\s*(?:%|‰)`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:-fold|fold|×)\b`,
    String.raw`\b[nN]\s*=\s*\d[\d,]*`,
    String.raw`\b\d+\/\d+\b`,
    String.raw`\b\d+(?:\.\d+)?\s*(?:mg|kg|µg|μg|ml|mL|µl|μl|nm|mm|cm|km|bp|kb|Mb|Gb|°C|hours?|hr|min|days?|weeks?|months?|years?)\b`,
    String.raw`\b\d{1,3}(?:[  ,]\d{3})+\b`,
    String.raw`\b\d+\.\d+\b`,
    String.raw`\b\d{3,}\b`,
  ].join('|'),
  'g',
);

const AIM_RE =
  /\b(?:we (?:aim(?:ed)? to|sought to|asked whether|investigated whether|examined whether|tested (?:whether|the hypothesis)|hypothesi[sz]ed that|set out to)|the (?:aim|purpose|objective|goal) of this (?:study|work|paper|analysis)|this (?:study|work|paper) (?:aimed to|was designed to|investigates|examines|asks whether))\b/i;
const FINDING_RE =
  /\b(?:we (?:found|discovered|observed|identified|detected|show|showed|demonstrate[d]?|report|reveal(?:ed)?|establish(?:ed)?)|our (?:results?|data|findings?) (?:show|showed|suggest|indicate|demonstrate|reveal|support|confirm)|(?:results?|findings?|data) (?:show|showed|suggest|indicate|demonstrate|reveal) that|was (?:significantly|strongly|markedly)|(?:significantly|markedly) (?:higher|lower|greater|increased|decreased|reduced|associated)|taken together|in (?:summary|conclusion)|these (?:results?|findings?) (?:support|suggest|indicate))\b/i;
const DESIGN_RE =
  /\b(?:randomi[sz]ed|placebo|cohort|case[- ]control|cross[- ]sectional|enrolled|participants?|patients?|mice|strains?|chemostat|assay|n\s*=|compared with|versus|vs\.?)\b/i;
const CAVEAT_RE =
  /\b(?:limitations?|however|nevertheless|caution|should be interpreted|remains? unclear|further (?:work|study|research) (?:is|are|will)|future (?:work|studies)|we cannot|did not (?:reach|detect|observe)|underpowered)\b/i;
const ORGANIZATION_RE =
  /\b(?:this (?:paper|article|review|chapter) (?:is organized|describes|reviews|outlines)|the remainder of this|are organized as follows|we (?:begin by|first review)|the paper proceeds)\b/i;
const AFFILIATION_RE =
  /\b(?:corresponding author|copyright|all rights reserved|received:|accepted:|published online|e-?mail:|orcid|department of|university of|equal contribution)\b/i;
const STRUCTURED_LABEL_RE = /^(?:background|objective|objectives|purpose|methods?|results?|conclusions?|findings?|interpretation)\s*[:—–-]\s+/i;
const HEDGE_RE = /\b(?:may|might|could|would|remains? unclear|further (?:work|study|research)|future (?:work|studies))\b/i;

/** Identifiers are full of digits that are not measurements. */
function stripIdentifiers(text: string): string {
  return text
    .replace(/\b10\.\d{4,9}\/\S+/g, ' ')
    .replace(/\b(?:PMID|PMCID|PMC|DOI|ISBN|ISSN|accession(?: number)?)\s*:?\s*\S+/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

export function findNumbers(text: string): string[] {
  const found = stripIdentifiers(text).match(NUMBER_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const value = raw.trim();
    if (/^\d{4}$/.test(value) && Number(value) > 1500 && Number(value) < 2100) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(text: string, maximum = 420): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maximum) return clean;
  const clipped = clean.slice(0, maximum + 1);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '));
  const wordEnd = clipped.lastIndexOf(' ');
  const end = sentenceEnd >= Math.floor(maximum * 0.55) ? sentenceEnd + 1 : wordEnd;
  return `${clipped.slice(0, Math.max(1, end)).trim()}…`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function headingOverlap(sentence: string, title: string): number {
  const words = title
    .replace(/^\d+(?:\.\d+)*[.)]?\s*/, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 4 && !/^(?:methods?|results?|discussion|introduction|abstract|conclusion|background)$/.test(word));
  if (words.length === 0) return 0;
  const lower = sentence.toLowerCase();
  return words.filter((word) => lower.includes(word)).length;
}

export function scoreSkimSentence(sentence: string, role: SectionRole, title = ''): number {
  const text = sentence.trim();
  if (text.length < 28) return -5;
  let score = 0;
  if (text.length >= 50 && text.length <= 280) score += 2;
  if (text.length > 380) score -= 2;
  if (ORGANIZATION_RE.test(text) || AFFILIATION_RE.test(text)) score -= 12;
  if (STRUCTURED_LABEL_RE.test(text)) score += 3;
  const numbers = findNumbers(text).length;
  score += Math.min(4, numbers * 2);

  if (AIM_RE.test(text)) score += role === 'intro' || role === 'abstract' ? 7 : 3;
  if (FINDING_RE.test(text)) score += role === 'results' || role === 'abstract' || role === 'conclusion' ? 7 : 3;
  if (DESIGN_RE.test(text)) score += role === 'methods' ? 5 : 1;
  if (CAVEAT_RE.test(text)) {
    if (role === 'discussion' || role === 'conclusion') score += 2;
    else score -= 1;
  }
  if (HEDGE_RE.test(text) && role === 'results') score -= 2;
  if (headingOverlap(text, title) > 0) score += 2;

  const cites = text.match(/\(\s*\d{4}\s*\)/g)?.length ?? 0;
  if (cites >= 2) score -= 4;
  if (/^(?:table|figure|fig\.|equation)\b/i.test(text)) score -= 6;
  return score;
}

interface RankedSentence {
  text: string;
  score: number;
}

function rankSentences(text: string, role: SectionRole, title: string): RankedSentence[] {
  const chunks = text
    .split(/\n+/)
    .map((chunk) => chunk.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
  const sentences: string[] = [];
  for (const chunk of chunks) {
    const parts = splitSentences(chunk);
    if (parts.length === 0 && chunk.length >= 28) sentences.push(chunk);
    else sentences.push(...parts);
  }
  const seen = new Set<string>();
  const ranked: RankedSentence[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({ text: sentence, score: scoreSkimSentence(sentence, role, title) });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

function pickMatching(ranked: RankedSentence[], re: RegExp, floor = 0): string {
  const hit = ranked.find((row) => row.score >= floor && re.test(row.text));
  return hit ? clip(hit.text) : '';
}

function pickGist(ranked: RankedSentence[], role: SectionRole): { gist: string; bullets: string[] } {
  const usable = ranked.filter((row) => row.score >= 0 && !ORGANIZATION_RE.test(row.text) && !AFFILIATION_RE.test(row.text));
  const pool = usable.length > 0 ? usable : ranked.filter((row) => row.text.length >= 40);
  if (pool.length === 0) return { gist: '', bullets: [] };

  let preferred = pool;
  if (role === 'methods') preferred = pool.filter((row) => DESIGN_RE.test(row.text) || findNumbers(row.text).length > 0);
  if (role === 'results' || role === 'conclusion') preferred = pool.filter((row) => FINDING_RE.test(row.text) || findNumbers(row.text).length > 0);
  if (role === 'intro') preferred = pool.filter((row) => AIM_RE.test(row.text));
  if (role === 'abstract') {
    const findings = pool.filter((row) => FINDING_RE.test(row.text) || STRUCTURED_LABEL_RE.test(row.text) || findNumbers(row.text).length > 0);
    if (findings.length) preferred = findings;
  }
  const lead = (preferred.length > 0 ? preferred : pool)[0];
  const gistParts = [lead.text];
  const second = pool.find(
    (row) =>
      row.text !== lead.text &&
      row.score >= Math.max(1, lead.score - 3) &&
      findNumbers(row.text).length > 0 &&
      !gistParts[0].includes(row.text.slice(0, 40)),
  );
  if (second && (gistParts[0] + ' ' + second.text).length <= 420) gistParts.push(second.text);

  const gist = clip(gistParts.join(' '));
  const bullets = pool
    .filter((row) => row.text !== lead.text && row.text !== second?.text && row.score >= 3)
    .slice(0, 2)
    .map((row) => clip(row.text, 280));
  return { gist, bullets };
}

export function summarizeSection(
  title: string,
  text: string,
  opts: { id?: string; depth?: number } = {},
): SkimSection {
  const role = classifySectionRole(title);
  const ranked = rankSentences(text, role, title);
  const { gist, bullets } = skipFromSkim(title) ? { gist: '', bullets: [] } : pickGist(ranked, role);
  return {
    id: opts.id ?? '',
    title,
    depth: opts.depth ?? 2,
    role,
    gist,
    bullets,
    numbers: findNumbers(text).slice(0, 8),
    words: wordCount(text),
    aim: pickMatching(ranked, AIM_RE, 0),
    finding: firstOf(
      pickMatching(ranked, FINDING_RE, 1),
      role === 'results' || role === 'abstract' || role === 'conclusion'
        ? ranked.find((row) => row.score >= 2 && findNumbers(row.text).length > 0)?.text
        : '',
    ),
    caveat: pickMatching(ranked, CAVEAT_RE, 0),
  };
}

function firstOf(...values: Array<string | undefined>): string {
  for (const value of values) {
    const clean = (value ?? '').trim();
    if (clean.length >= 24) return clip(clean);
  }
  return '';
}

function byRole(sections: SkimSection[], role: SectionRole): SkimSection | undefined {
  return sections.find((section) => section.role === role && (section.gist || section.finding || section.aim));
}

/** Assemble the paper-level brief from already-summarised sections. */
export function buildPaperBrief(sections: SkimSection[]): PaperBrief {
  const readable = sections.filter((section) => !skipFromSkim(section.title));
  const abstract = byRole(readable, 'abstract');
  const intro = byRole(readable, 'intro');
  const methods = byRole(readable, 'methods');
  const results = byRole(readable, 'results');
  const discussion = byRole(readable, 'discussion');
  const conclusion = byRole(readable, 'conclusion');

  const asked = firstOf(intro?.aim, abstract?.aim, intro?.gist);
  const did = firstOf(methods?.gist);
  const found = firstOf(results?.finding, results?.gist, abstract?.finding, conclusion?.gist, conclusion?.finding, abstract?.gist);
  const caveat = firstOf(
    readable.find((section) => /limitation/i.test(section.title))?.gist,
    discussion?.caveat,
    conclusion?.caveat,
    discussion?.gist && CAVEAT_RE.test(discussion.gist) ? discussion.gist : '',
  );
  const verdict = firstOf(conclusion?.gist, abstract?.finding, found, asked);

  return { verdict, asked, did, found, caveat };
}

export function briefIsEmpty(brief: PaperBrief): boolean {
  return !brief.verdict && !brief.asked && !brief.did && !brief.found && !brief.caveat;
}
