import type {
  Block,
  ClozeCard,
  DocStats,
  Inline,
  OutlineNode,
  ParsedDoc,
  StudyMaterial,
  TermCard,
  TermSource,
} from '../model';
import { parseMarkdown, plainText } from './markdown';

export const BLANK = '____';

const MAX_CLOZES = 60;
const MAX_TERMS = 140;
const MAX_SECTION_CARDS = 24;
const SEPARATOR_RE = /^\s*(?:[:：]|[—–―]|::|[-=]{1,2})\s*/;
const DEFINITION_CONNECTOR_RE = /^\s*(?:is|are|means?|refers? to|describes?|represents?|equals?|=)\s+/i;
const IMPLICIT_DEFINITION_RE = /^\s*(?:an?\s+|the\s+|how\s+|whether\s+|probability\b|ratio\b)/i;
const QUESTION_RE = /^(?:q|question)\s*(?:\d+)?\s*[:.)\-–—]\s*(.+)$/i;
const ANSWER_RE = /^(?:a|answer)\s*(?:\d+)?\s*[:.)\-–—]\s*(.+)$/i;
const GENERIC_CLOZE_TARGETS = new Set([
  'done', 'state', 'status', 'update', 'updated', 'current', 'currently', 'important',
  'note', 'result', 'results', 'yes', 'no', 'true', 'false', 'running', 'finished',
  'gene', 'genes', 'slowest', 'estimate', 'estimates', 'estimated', 'fix', 'fixes', 'fixed',
]);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Stable content id: djb2 hash rendered in base 36. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Unit {
  text: string;
  inlines: Inline[];
  section: string;
  isItem: boolean;
}

function collectUnits(blocks: Block[], section: string, units: Unit[], tables: { block: Extract<Block, { type: 'table' }>; section: string }[]): string {
  let current = section;
  for (const block of blocks) {
    if (block.type === 'heading') {
      current = block.text || current;
    } else if (block.type === 'para') {
      units.push({ text: block.text, inlines: block.inlines, section: current, isItem: false });
    } else if (block.type === 'list') {
      collectListUnits(block, current, units);
    } else if (block.type === 'quote') {
      current = collectUnits(block.blocks, current, units, tables);
    } else if (block.type === 'table') {
      tables.push({ block, section: current });
    }
  }
  return current;
}

function collectListUnits(list: Extract<Block, { type: 'list' }>, section: string, units: Unit[]): void {
  for (const item of list.items) {
    units.push({ text: item.text, inlines: item.inlines, section, isItem: true });
    if (item.children) collectListUnits(item.children, section, units);
  }
}

function isReasonableTerm(term: string): boolean {
  if (term.length < 2 || term.length > 80) return false;
  if (!/[a-zA-ZÀ-ɏͰ-῿぀-鿿]/.test(term)) return false;
  if (term.includes('://') || term.includes('|')) return false;
  if (term.trim().split(/\s+/).length > 8) return false;
  if (/[.!?]$/.test(term.trim())) return false;
  return true;
}

function termFromBoldStart(unit: Unit): { term: string; definition: string } | null {
  const [first, ...rest] = unit.inlines;
  if (!first || first.kind !== 'bold') return null;
  let term = first.text.trim();
  let definition = plainText(rest);
  const endsWithColon = /[:：]\s*$/.test(term);
  if (endsWithColon) {
    term = term.replace(/[:：]\s*$/, '').trim();
    definition = definition.replace(/^\s*[—–\-]\s*/, '').trim();
  } else {
    const m = definition.match(SEPARATOR_RE);
    if (m) definition = definition.slice(m[0].length).trim();
    else {
      const connector = definition.match(DEFINITION_CONNECTOR_RE);
      if (connector) definition = definition.slice(connector[0].length).trim();
      else if (!IMPLICIT_DEFINITION_RE.test(definition)) return null;
    }
  }
  if (!isReasonableTerm(term) || definition.length < 4) return null;
  return { term, definition };
}

function termFromColonLine(unit: Unit): { term: string; definition: string } | null {
  if (unit.inlines[0]?.kind === 'bold') return null; // handled by the bold rule
  if (unit.inlines[0]?.kind === 'link') return null; // usually a linked table of contents entry
  if (!unit.isItem && unit.text.length > 120) return null;
  const idx = unit.text.indexOf(': ');
  if (idx <= 0) return null;
  const term = unit.text.slice(0, idx).trim();
  const definition = unit.text.slice(idx + 2).trim();
  if (!isReasonableTerm(term) || definition.length < 8) return null;
  if (/\d$/.test(term) && /^\d/.test(definition)) return null; // looks like a time or ratio
  if (QUESTION_RE.test(unit.text) || ANSWER_RE.test(unit.text)) return null;
  return { term, definition };
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=\S)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function concise(text: string, maximum = 420): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maximum) return clean;
  const clipped = clean.slice(0, maximum + 1);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '));
  const wordEnd = clipped.lastIndexOf(' ');
  const end = sentenceEnd >= Math.floor(maximum * 0.55) ? sentenceEnd + 1 : wordEnd;
  return `${clipped.slice(0, Math.max(1, end)).trim()}…`;
}

function questionFromHeading(heading: string): string {
  const clean = heading.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').trim();
  if (/[?？]/.test(clean)) return clean;
  const inverted = clean.match(/^(why|how)\s+(.+?)\s+(is|are|was|were|can|could|should|would|does|do|did)\s+(.+)$/i);
  if (inverted) return `${inverted[1]} ${inverted[3]} ${inverted[2]} ${inverted[4]}?`;
  if (/^why\s+a\s+posterior\s+and\s+not\s+a\s+point\s+estimate$/i.test(clean)) return 'Why use a posterior rather than a point estimate?';
  if (/^why\s+the\s+two\s+agree$/i.test(clean)) return 'Why do the two methods agree?';
  if (/^how\s+(?:these|those)\b/i.test(clean)) return clean.replace(/^how\s+/i, 'How do ') + '?';
  if (/^what\s+it\s+is$/i.test(clean)) return 'What is it?';
  if (/^what\s+it\s+produces$/i.test(clean)) return 'What does it produce?';
  if (/^(?:why|how|what|when|where|which|who|can|does|do|is|are|should|could|would)\b/i.test(clean)) return `${clean}?`;
  if (/^the question$/i.test(clean)) return 'What question is this analysis trying to answer?';
  return `What is the key idea in “${clean}”?`;
}

function firstSectionAnswer(blocks: Block[], headingIndex: number, depth: number): string | undefined {
  const pieces: string[] = [];
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === 'heading' && block.depth <= depth) break;
    if (block.type === 'para' && block.text.length >= 28) pieces.push(block.text);
    else if (block.type === 'list' && pieces.length === 0) {
      pieces.push(...block.items.slice(0, 3).map((item) => item.text));
    } else if (block.type === 'quote' && pieces.length === 0) {
      const nested = block.blocks.find((item) => item.type === 'para');
      if (nested?.type === 'para') pieces.push(nested.text);
    }
    if (pieces.join(' ').length >= 180) break;
  }
  const answer = concise(pieces.join(' '));
  return answer.length >= 35 ? answer : undefined;
}

function sectionCards(doc: ParsedDoc): Array<{ term: string; definition: string; section: string }> {
  const cards: Array<{ term: string; definition: string; section: string }> = [];
  for (let index = 0; index < doc.blocks.length && cards.length < MAX_SECTION_CARDS; index += 1) {
    const block = doc.blocks[index];
    if (block.type !== 'heading' || block.depth < 2 || block.depth > 3) continue;
    const heading = block.text.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').trim();
    if (!heading || /^(?:contents?|glossary|references?)$/i.test(heading)) continue;
    const definition = firstSectionAnswer(doc.blocks, index, block.depth);
    if (!definition) continue;
    cards.push({ term: questionFromHeading(heading), definition, section: heading });
  }
  return cards;
}

function usefulClozeTarget(target: string, sentence: string): boolean {
  const clean = target.replace(/\s+/g, ' ').trim();
  const key = normalizeKey(clean);
  const words = clean.split(/\s+/).filter(Boolean);
  if (!key || GENERIC_CLOZE_TARGETS.has(key)) return false;
  if (words.length > 8 || clean.length > 72 || /[.!?;:]$/.test(clean)) return false;
  if (clean.length > sentence.length * 0.48) return false;
  if (words.length === 1 && clean.length < 5 && !/[A-Z0-9ωχκ]/.test(clean)) return false;
  return true;
}

/** Derive all study material from a markdown source. */
export function extractStudyMaterial(markdown: string): StudyMaterial {
  const doc: ParsedDoc = parseMarkdown(markdown);
  const units: Unit[] = [];
  const tables: { block: Extract<Block, { type: 'table' }>; section: string }[] = [];
  collectUnits(doc.blocks, 'Overview', units, tables);

  const terms: TermCard[] = [];
  const seenTerms = new Map<string, number>();

  const addTerm = (term: string, definition: string, section: string, source: TermSource) => {
    if (terms.length >= MAX_TERMS) return;
    const key = normalizeKey(term);
    if (!key) return;
    const cleanDef = concise(definition);
    if (cleanDef.length < 4) return;
    const existing = seenTerms.get(key);
    if (existing !== undefined) {
      if (cleanDef.length > terms[existing].definition.length) {
        terms[existing] = { ...terms[existing], definition: cleanDef };
      }
      return;
    }
    seenTerms.set(key, terms.length);
    terms.push({
      id: hashId(`term|${key}|${normalizeKey(cleanDef).slice(0, 40)}`),
      term: term.trim(),
      definition: cleanDef,
      section,
      source,
    });
  };

  // 1) Bold-start and colon definitions, plus Q/A pairs over adjacent units.
  const defUnitTexts = new Set<string>();
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const q = unit.text.match(QUESTION_RE);
    if (q) {
      // "Q: ...? A: ..." on adjacent lines gets merged into one paragraph.
      const inline = q[1].match(/^(.*?[?.!])\s+(?:a|answer)\s*(?:\d+)?\s*[:.)\-–—]\s*(.+)$/i);
      if (inline) {
        addTerm(ensureQuestionMark(inline[1]), inline[2].trim(), unit.section, 'qa');
        defUnitTexts.add(unit.text);
        continue;
      }
      const next = units[i + 1];
      const a = next?.text.match(ANSWER_RE);
      if (a) {
        addTerm(ensureQuestionMark(q[1]), a[1].trim(), unit.section, 'qa');
        defUnitTexts.add(unit.text).add(next.text);
        i += 1;
        continue;
      }
    }
    const bold = termFromBoldStart(unit);
    if (bold) {
      addTerm(bold.term, bold.definition, unit.section, 'bold');
      defUnitTexts.add(unit.text);
      continue;
    }
    const colon = termFromColonLine(unit);
    if (colon) {
      addTerm(colon.term, colon.definition, unit.section, 'colon');
      defUnitTexts.add(unit.text);
    }
  }

  // 2) Tables: first column is the term, remaining columns the definition.
  for (const { block, section } of tables) {
    if (block.header.length < 2) continue;
    for (const row of block.rows) {
      const term = row[0]?.trim() ?? '';
      const rest = row.slice(1).filter((cell) => cell.trim());
      if (!term || rest.length === 0 || !isReasonableTerm(term)) continue;
      const definition =
        block.header.length > 2
          ? rest
              .map((cell, idx) => {
                const label = block.header[idx + 1]?.trim();
                return label ? `${label}: ${cell}` : cell;
              })
              .join('; ')
          : rest.join('; ');
      addTerm(term, definition, section, 'table');
    }
  }

  // 3) Section-level recall prompts make prose-heavy documents studyable even
  //    when the author did not write every concept as “Term: definition”.
  for (const card of sectionCards(doc)) {
    addTerm(card.term, card.definition, card.section, 'section');
  }

  // 4) Cloze cards. Prose sentences first (blank a meaningful bold concept or a known term),
  //    then definition lines with the term blanked out.
  const clozes: ClozeCard[] = [];
  const seenClozes = new Set<string>();
  const termMatchers = terms
    .filter((t) => t.source !== 'section' && t.term.length >= 3 && !/[?？]$/.test(t.term))
    .map((t) => ({ term: t.term, re: new RegExp(`\\b${escapeRegExp(t.term)}\\b`, 'i') }))
    .sort((a, b) => b.term.length - a.term.length);

  const addCloze = (sentence: string, answer: string, section: string) => {
    if (clozes.length >= MAX_CLOZES) return;
    const trimmed = sentence.replace(/\s+/g, ' ').trim();
    const target = answer.trim();
    if (trimmed.length < 30 || trimmed.length > 280) return;
    if (target.length < 2 || target.length > 60 || !/[a-zA-Z0-9]/.test(target)) return;
    const re = new RegExp(escapeRegExp(target), 'i');
    if (!re.test(trimmed)) return;
    const prompt = trimmed.replace(new RegExp(escapeRegExp(target), 'gi'), BLANK);
    if (!prompt.includes(BLANK) || prompt.replace(/_/g, '').trim().length < 15) return;
    const key = normalizeKey(prompt);
    if (seenClozes.has(key)) return;
    seenClozes.add(key);
    clozes.push({ id: hashId(`cloze|${key}|${normalizeKey(target)}`), prompt, answer: target, section });
  };

  for (const unit of units) {
    if (defUnitTexts.has(unit.text)) continue;
    const boldSpans = unit.inlines.filter((r) => r.kind === 'bold').map((r) => r.text.trim());
    for (const sentence of sentencesOf(unit.text)) {
      const bold = boldSpans
        .filter((span) => span && sentence.toLowerCase().includes(span.toLowerCase()) && usefulClozeTarget(span, sentence))
        .sort((a, b) => b.length - a.length)[0];
      if (bold && bold.length < sentence.length * 0.8) {
        addCloze(sentence, bold, unit.section);
        continue;
      }
      const known = termMatchers.find((t) => t.re.test(sentence));
      if (known && known.term.length < sentence.length * 0.8 && usefulClozeTarget(known.term, sentence)) {
        addCloze(sentence, known.term, unit.section);
      }
    }
  }

  for (const card of terms) {
    if (clozes.length >= MAX_CLOZES) break;
    if (
      card.source === 'section'
      || card.definition.length < 12
      || /[?？]$/.test(card.term)
      || /^(?:update|note|caveat)\b/i.test(card.term)
      || !usefulClozeTarget(card.term, `${card.term} — ${card.definition}`)
    ) continue;
    const def = card.definition.replace(new RegExp(`\\b${escapeRegExp(card.term)}\\b`, 'gi'), BLANK);
    const prompt = `${BLANK} — ${def}`;
    const key = normalizeKey(prompt);
    if (seenClozes.has(key)) continue;
    seenClozes.add(key);
    clozes.push({ id: hashId(`cloze|${key}|${normalizeKey(card.term)}`), prompt, answer: card.term, section: card.section });
  }

  // 5) Outline and stats.
  const outline: OutlineNode[] = [];
  for (const block of doc.blocks) {
    if (block.type === 'heading' && block.depth <= 3) {
      outline.push({ id: block.id, title: block.text, depth: block.depth });
    }
  }

  const words = countWords(doc.blocks);
  const stats: DocStats = {
    words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    sections: outline.length,
    terms: terms.length,
    clozes: clozes.length,
  };

  return { doc, terms, clozes, outline, stats };
}

function ensureQuestionMark(q: string): string {
  const t = q.trim();
  return /[?？]$/.test(t) ? t : `${t}?`;
}

function countWords(blocks: Block[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'para') {
      count += block.text.split(/\s+/).filter(Boolean).length;
    } else if (block.type === 'list') {
      count += countListWords(block);
    } else if (block.type === 'quote') {
      count += countWords(block.blocks);
    } else if (block.type === 'table') {
      for (const row of [block.header, ...block.rows]) {
        for (const cell of row) count += cell.split(/\s+/).filter(Boolean).length;
      }
    }
  }
  return count;
}

function countListWords(list: Extract<Block, { type: 'list' }>): number {
  let count = 0;
  for (const item of list.items) {
    count += item.text.split(/\s+/).filter(Boolean).length;
    if (item.children) count += countListWords(item.children);
  }
  return count;
}
