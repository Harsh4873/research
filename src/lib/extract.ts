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
const SEPARATOR_RE = /^\s*(?:[:：]|[—–―]|::|[-=]{1,2})\s*/;
const QUESTION_RE = /^(?:q|question)\s*(?:\d+)?\s*[:.)\-–—]\s*(.+)$/i;
const ANSWER_RE = /^(?:a|answer)\s*(?:\d+)?\s*[:.)\-–—]\s*(.+)$/i;

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
    if (!m) return null;
    definition = definition.slice(m[0].length).trim();
  }
  if (!isReasonableTerm(term) || definition.length < 4) return null;
  return { term, definition };
}

function termFromColonLine(unit: Unit): { term: string; definition: string } | null {
  if (unit.inlines[0]?.kind === 'bold') return null; // handled by the bold rule
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
    .split(/(?<=[.!?])\s+(?=["'(A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
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
    const key = normalizeKey(term);
    if (!key) return;
    const cleanDef = definition.replace(/\s+/g, ' ').trim();
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

  // 3) Cloze cards. Prose sentences first (blank a bold phrase or a known term),
  //    then definition lines with the term blanked out.
  const clozes: ClozeCard[] = [];
  const seenClozes = new Set<string>();
  const termMatchers = terms
    .filter((t) => t.term.length >= 3)
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
        .filter((span) => span && sentence.toLowerCase().includes(span.toLowerCase()))
        .sort((a, b) => b.length - a.length)[0];
      if (bold && bold.length < sentence.length * 0.8) {
        addCloze(sentence, bold, unit.section);
        continue;
      }
      const known = termMatchers.find((t) => t.re.test(sentence));
      if (known && known.term.length < sentence.length * 0.8) {
        addCloze(sentence, known.term, unit.section);
      }
    }
  }

  for (const card of terms) {
    if (clozes.length >= MAX_CLOZES) break;
    if (card.definition.length < 12) continue;
    const def = card.definition.replace(new RegExp(`\\b${escapeRegExp(card.term)}\\b`, 'gi'), BLANK);
    const prompt = `${BLANK} — ${def}`;
    const key = normalizeKey(prompt);
    if (seenClozes.has(key)) continue;
    seenClozes.add(key);
    clozes.push({ id: hashId(`cloze|${key}|${normalizeKey(card.term)}`), prompt, answer: card.term, section: card.section });
  }

  // 4) Outline and stats.
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
