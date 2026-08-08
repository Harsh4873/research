import type { Block, ListBlock, ParsedDoc, TableBlock } from '../model';

/**
 * Derives the reading views for a paper — data, claims, search, and skim —
 * from the parsed document. Pure, so every heuristic is unit-testable.
 */

export interface FigureItem {
  label: string;
  caption: string;
  section: string;
  /** Published artwork, when the source carried one. */
  image?: string;
  /** Where to read the float when it cannot be shown here. */
  link?: string;
}

export interface TableItem {
  label: string;
  caption: string;
  /** Null when the source did not carry a machine-readable table. */
  block: TableBlock | null;
  section: string;
  /** Why the table is not here, when it is not. */
  note?: string;
  link?: string;
}

export interface EquationItem {
  label: string;
  code: string;
  section: string;
}

export interface SupplementItem {
  name: string;
  description: string;
  file?: string;
  href?: string;
}

export interface AvailabilityItem {
  title: string;
  text: string;
}

export type ClaimKind = 'finding' | 'conclusion' | 'quantified';

export interface ClaimItem {
  text: string;
  section: string;
  kind: ClaimKind;
  score: number;
  /** The phrase that marked this sentence as a claim. */
  trigger: string;
}

export interface SkimSection {
  id: string;
  title: string;
  depth: number;
  gist: string;
  numbers: string[];
  words: number;
}

export interface PaperViews {
  figures: FigureItem[];
  tables: TableItem[];
  equations: EquationItem[];
  supplements: SupplementItem[];
  availability: AvailabilityItem[];
  claims: ClaimItem[];
  skim: SkimSection[];
}

const FLOAT_LABEL_RE = /^(table|figure|fig\.?|scheme|box|equation|algorithm)\s*([0-9IVXivx]+[a-z]?)?\s*[.:—–-]?\s*(.*)$/i;
const AVAILABILITY_RE = /(data|code|software|materials?)\s+availability|availability of (data|code)|accession (codes?|numbers?)/i;
const SUPPLEMENT_SECTION_RE = /^(supplementary|supporting)\s+(material|information|data|files?)$/i;

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

const CLAIM_PATTERNS: Array<{ re: RegExp; kind: ClaimKind; score: number }> = [
  { re: /\bwe (?:found|discovered|observed|identified|detected)\b/i, kind: 'finding', score: 10 },
  { re: /\bwe (?:show|showed|demonstrate[d]?|report|reveal(?:ed)?|establish(?:ed)?)\b/i, kind: 'finding', score: 10 },
  { re: /\b(?:here|in this (?:study|work|paper|analysis))\s*,?\s*we\b/i, kind: 'finding', score: 9 },
  { re: /\bour (?:results?|data|findings?|analysis|study|work)\s+(?:show|showed|suggest|suggests|indicate|indicates|demonstrate|demonstrates|reveal|reveals|support|supports|confirm|confirms)\b/i, kind: 'finding', score: 10 },
  { re: /\b(?:results?|findings?|data|analysis)\s+(?:show|showed|suggest|suggests|indicate|indicates|demonstrate|demonstrates|reveal|reveals)\s+that\b/i, kind: 'finding', score: 8 },
  { re: /\bwe (?:conclude|propose|argue|suggest|hypothesi[sz]e)\b/i, kind: 'conclusion', score: 9 },
  { re: /\b(?:these|our) (?:results?|findings?|data)\s+(?:support|suggest|imply|indicate|point to)\b/i, kind: 'conclusion', score: 9 },
  { re: /\b(?:taken together|altogether|in summary|in conclusion|overall)\b/i, kind: 'conclusion', score: 8 },
  { re: /\bthis (?:study|work|paper)\s+(?:shows|showed|demonstrates|reveals|provides|establishes)\b/i, kind: 'finding', score: 8 },
  { re: /\bwas (?:significantly|strongly|markedly)\b|\b(?:significantly|markedly)\s+(?:higher|lower|greater|increased|decreased|reduced|associated)\b/i, kind: 'quantified', score: 7 },
  { re: /\b(?:associated with|correlated with|predicted|risk of)\b/i, kind: 'quantified', score: 5 },
];

const HEDGE_RE = /\b(?:may|might|could|would|remains? unclear|further (?:work|study|research)|future (?:work|studies))\b/i;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFloatLabel(heading: string): { kind: string; label: string; caption: string } | null {
  const match = heading.trim().match(FLOAT_LABEL_RE);
  if (!match) return null;
  const word = match[1].toLowerCase();
  const kind = word.startsWith('t') ? 'table' : word.startsWith('e') ? 'equation' : word.startsWith('f') ? 'figure' : 'other';
  const number = match[2] ? ` ${match[2]}` : '';
  const nice = kind === 'table' ? 'Table' : kind === 'figure' ? 'Figure' : kind === 'equation' ? 'Equation' : match[1];
  return { kind, label: `${nice}${number}`.trim(), caption: match[3].trim() };
}

function listItemsOf(block: ListBlock): string[] {
  const out: string[] = [];
  for (const item of block.items) {
    out.push(item.text);
    if (item.children) out.push(...listItemsOf(item.children));
  }
  return out;
}

/** `- **S1 Fig**: caption — description (file: \`name.pdf\`)` → a supplement. */
export function parseSupplementLine(line: string, pmcid?: string): SupplementItem | null {
  const text = line.trim();
  if (!text) return null;
  const fileMatch = text.match(/\(file:\s*`?([^`)]+)`?\)\s*$/i);
  const file = fileMatch?.[1]?.trim();
  const body = fileMatch ? text.slice(0, fileMatch.index).trim() : text;
  // Split on a real separator only — filenames are full of hyphens.
  const split = body.match(/^(.+?)(?::\s+|\s+[—–]\s+|\s+-\s+)([\s\S]*)$/);
  const name = (split ? split[1] : body).replace(/\*\*/g, '').trim();
  const description = (split ? split[2] : '').replace(/\*\*/g, '').trim();
  if (!name) return null;
  const item: SupplementItem = { name, description };
  if (file) {
    item.file = file;
    // PMC serves article supplements from a predictable path.
    if (pmcid) item.href = `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/bin/${encodeURIComponent(file)}`;
    else if (/^https?:\/\//i.test(file)) item.href = file;
  }
  return item;
}

/** Score a sentence as a claim, or return null when it is ordinary prose. */
export function scoreClaim(sentence: string, section: string): ClaimItem | null {
  const text = sentence.trim();
  if (text.length < 40 || text.length > 400) return null;
  if (/^(table|figure|fig\.|equation)\b/i.test(text)) return null;

  let best: { kind: ClaimKind; score: number; trigger: string } | null = null;
  for (const pattern of CLAIM_PATTERNS) {
    const found = text.match(pattern.re);
    if (!found) continue;
    if (!best || pattern.score > best.score) best = { kind: pattern.kind, score: pattern.score, trigger: found[0] };
  }
  if (!best) return null;

  let score = best.score;
  // Numbers make a claim concrete; hedging makes it weaker.
  const numbers = text.match(NUMBER_RE)?.length ?? 0;
  score += Math.min(3, numbers);
  if (HEDGE_RE.test(text)) score -= 3;
  if (/^(results|discussion|conclusion|abstract)/i.test(section)) score += 1;

  return { text, section, kind: best.kind, score, trigger: best.trigger };
}

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
    // Bare years and small counts are rarely the numbers a reader wants.
    if (/^\d{4}$/.test(value) && Number(value) > 1500 && Number(value) < 2100) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'para':
      return block.text;
    case 'list':
      return listItemsOf(block).join(' ');
    case 'quote':
      return block.blocks.map(blockText).join(' ');
    case 'table':
      return [block.header, ...block.rows].map((row) => row.join(' ')).join(' ');
    case 'code':
      return block.code;
    default:
      return '';
  }
}

/** Build every Review reading view from a parsed paper. */
export function buildPaperViews(doc: ParsedDoc, pmcid?: string): PaperViews {
  const views: PaperViews = {
    figures: [],
    tables: [],
    equations: [],
    supplements: [],
    availability: [],
    claims: [],
    skim: [],
  };

  let section = 'Overview';
  let pendingFloat: { kind: string; label: string; caption: string } | null = null;
  let inSupplements = false;
  let availabilityTitle: string | null = null;
  const claims: ClaimItem[] = [];
  const skim: SkimSection[] = [];
  let current: SkimSection | null = null;

  const pushSkim = () => {
    if (current && (current.gist || current.numbers.length > 0 || current.words > 0)) skim.push(current);
  };

  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i];

    if (block.type === 'heading') {
      const parsed = block.depth >= 4 ? parseFloatLabel(block.text) : null;
      if (parsed && parsed.kind !== 'other') {
        pendingFloat = parsed;
        if (parsed.kind === 'figure') {
          views.figures.push({ label: parsed.label, caption: parsed.caption, section });
        }
        continue;
      }
      if (block.depth <= 3) {
        pushSkim();
        section = block.text;
        inSupplements = SUPPLEMENT_SECTION_RE.test(block.text.trim());
        availabilityTitle = AVAILABILITY_RE.test(block.text) ? block.text : null;
        current = { id: block.id, title: block.text, depth: block.depth, gist: '', numbers: [], words: 0 };
        pendingFloat = null;
      }
      continue;
    }

    // Attach content to the float heading that introduced it.
    if (block.type === 'table') {
      views.tables.push({
        label: pendingFloat?.kind === 'table' ? pendingFloat.label : `Table ${views.tables.length + 1}`,
        caption: pendingFloat?.kind === 'table' ? pendingFloat.caption : '',
        block,
        section,
      });
      pendingFloat = null;
      continue;
    }
    if (block.type === 'code') {
      if (block.lang === 'math' || pendingFloat?.kind === 'equation') {
        views.equations.push({
          label: pendingFloat?.kind === 'equation' ? pendingFloat.label : `Equation ${views.equations.length + 1}`,
          code: block.code,
          section,
        });
        pendingFloat = null;
        continue;
      }
      continue;
    }
    if (block.type === 'para' && pendingFloat?.kind === 'figure') {
      const last = views.figures[views.figures.length - 1];
      const image = block.inlines.find((run) => run.kind === 'image');
      const fallback = block.inlines.find((run) => run.kind === 'link');
      if (last && image) last.image = image.href;
      if (last && !image && fallback && !block.text.replace(fallback.text, '').trim()) last.link = fallback.href;
      const prose = block.inlines
        .filter((run) => run.kind !== 'image')
        .map((run) => run.text)
        .join('')
        .trim();
      if (last && prose && !image) last.caption = last.caption ? `${last.caption} ${prose}`.trim() : prose;
      // An artwork-only paragraph is not the caption, so the float stays open
      // for the paragraph that is.
      if (!image && !fallback) pendingFloat = null;
      // Figure captions are prose worth searching, so fall through to skim.
    }

    // A table the source could not express machine-readably still belongs in
    // Data, as the note and the link to where it can be read.
    if (block.type === 'para' && pendingFloat?.kind === 'table') {
      const link = block.inlines.find((run) => run.kind === 'link');
      views.tables.push({
        label: pendingFloat.label,
        caption: pendingFloat.caption,
        block: null,
        section,
        note: block.text.replace(link?.text ?? '', '').replace(/[_\s]+$/g, '').replace(/^[_\s]+/, '').trim(),
        link: link?.href,
      });
      pendingFloat = null;
    }

    if (block.type === 'list' && inSupplements) {
      for (const line of listItemsOf(block)) {
        const item = parseSupplementLine(line, pmcid);
        if (item) views.supplements.push(item);
      }
      continue;
    }

    const text = blockText(block);
    if (!text) continue;

    if (availabilityTitle && (block.type === 'para' || block.type === 'list')) {
      views.availability.push({ title: availabilityTitle, text });
    }

    if (current) {
      current.words += text.split(/\s+/).filter(Boolean).length;
      if (!current.gist && block.type === 'para' && text.length > 40) {
        current.gist = splitSentences(text).slice(0, 2).join(' ');
      }
      for (const number of findNumbers(text)) {
        if (current.numbers.length < 8 && !current.numbers.includes(number)) current.numbers.push(number);
      }
    }

    if (block.type === 'para' || block.type === 'list' || block.type === 'quote') {
      for (const sentence of splitSentences(text)) {
        const claim = scoreClaim(sentence, section);
        if (claim) claims.push(claim);
      }
    }
  }
  pushSkim();

  // Strongest claims first, but keep document order within a score.
  views.claims = claims
    .map((claim, index) => ({ claim, index }))
    .sort((a, b) => b.claim.score - a.claim.score || a.index - b.index)
    .map((entry) => entry.claim)
    .filter((claim, index, all) => all.findIndex((other) => other.text === claim.text) === index)
    .slice(0, 40);
  views.skim = skim;
  return views;
}

export interface SearchHit {
  section: string;
  text: string;
  /** Character ranges of the match within `text`. */
  ranges: Array<[number, number]>;
  kind: 'para' | 'table' | 'heading' | 'list' | 'code' | 'quote';
}

/** Case-insensitive search across the paper, returning matches in context. */
export function searchPaper(doc: ParsedDoc, query: string, limit = 200): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: SearchHit[] = [];
  let section = 'Overview';

  for (const block of doc.blocks) {
    if (block.type === 'heading' && block.depth <= 3) section = block.text;
    if (block.type === 'rule') continue;
    const text = blockText(block);
    if (!text) continue;

    const ranges: Array<[number, number]> = [];
    const haystack = text.toLowerCase();
    let from = 0;
    while (ranges.length < 50) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      ranges.push([at, at + needle.length]);
      from = at + needle.length;
    }
    if (ranges.length === 0) continue;
    hits.push({ section, text, ranges, kind: block.type });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Every distinct number in the paper, with the sentence it came from. */
export function collectNumbers(doc: ParsedDoc, limit = 300): Array<{ value: string; text: string; section: string }> {
  const out: Array<{ value: string; text: string; section: string }> = [];
  const seen = new Set<string>();
  let section = 'Overview';

  for (const block of doc.blocks) {
    if (block.type === 'heading' && block.depth <= 3) section = block.text;
    if (block.type !== 'para' && block.type !== 'list' && block.type !== 'quote') continue;
    const text = blockText(block);
    for (const sentence of splitSentences(text)) {
      for (const value of findNumbers(sentence)) {
        const key = `${value}|${sentence.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value, text: sentence, section });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
