import type { Block, HeadingBlock, Inline, ListBlock, ListItem, ParsedDoc } from '../model';

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const QUOTE_RE = /^ {0,3}>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const ESCAPABLE = '\\`*_{}[]()#+-.!|>~';

function emphasisText(source: string): string {
  return source
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '');
}

function expandTabs(s: string): string {
  return s.replace(/\t/g, '  ');
}

function indentOf(line: string): number {
  return expandTabs(line).match(/^ */)![0].length;
}

/** Concatenate the visible text of a run of inlines. */
export function plainText(inlines: Inline[]): string {
  return inlines
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse inline markdown (bold, italic, code, links, images) into typed runs. */
export function parseInlines(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('**', i) || src.startsWith('__', i)) {
      const mark = src.slice(i, i + 2);
      const end = src.indexOf(mark, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: 'bold', text: emphasisText(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const openOk = ch === '*' || i === 0 || /[\s([{'"“]/.test(src[i - 1]);
      const end = openOk ? findEmphasisEnd(src, i + 1, ch) : -1;
      if (end > i + 1) {
        flush();
        out.push({ kind: 'italic', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '!' && src[i + 1] === '[') {
      const link = readLink(src, i + 1);
      if (link) {
        flush();
        if (link.text) out.push({ kind: 'text', text: link.text });
        i = link.next;
        continue;
      }
    }
    if (ch === '[') {
      const link = readLink(src, i);
      if (link) {
        flush();
        out.push({ kind: 'link', text: link.text || link.href, href: link.href });
        i = link.next;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

function findEmphasisEnd(src: string, from: number, mark: string): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] !== mark) continue;
    if (j === from) return -1; // empty emphasis
    if (mark === '_' && j + 1 < src.length && /[A-Za-z0-9]/.test(src[j + 1])) continue;
    return j;
  }
  return -1;
}

function readLink(src: string, from: number): { text: string; href: string; next: number } | null {
  if (src[from] !== '[') return null;
  let depth = 1;
  let j = from + 1;
  while (j < src.length && depth > 0) {
    if (src[j] === '[') depth += 1;
    else if (src[j] === ']') depth -= 1;
    j += 1;
  }
  if (depth !== 0 || src[j] !== '(') return null;
  const close = src.indexOf(')', j + 1);
  if (close < 0) return null;
  const text = src.slice(from + 1, j - 1).replace(/[*_`]/g, '');
  const href = src.slice(j + 1, close).split(/\s+/)[0] ?? '';
  return { text, href, next: close + 1 };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => plainText(parseInlines(cell.trim())));
}

function stripTaskMarker(text: string): string {
  return text.replace(/^\[( |x|X)\]\s+/, '');
}

class Slugger {
  private seen = new Map<string, number>();

  slug(text: string): string {
    const base =
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}

/** Parse a markdown document into a typed block model. */
export function parseMarkdown(source: string): ParsedDoc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const slugger = new Slugger();
  let start = 0;
  let title: string | undefined;
  let meta: Record<string, string> | undefined;

  if (lines[0]?.trim() === '---') {
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t === '---' || t === '...') {
        end = j;
        break;
      }
    }
    if (end > 0) {
      const collected: Record<string, string> = {};
      for (let j = 1; j < end; j++) {
        const m = lines[j].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
        if (!m) continue;
        const value = m[2].trim().replace(/^["']|["']$/g, '');
        if (value) collected[m[1].toLowerCase()] = value;
      }
      if (collected.title) title = collected.title;
      if (Object.keys(collected).length > 0) meta = collected;
      start = end + 1;
    }
  }

  const blocks = parseBlocks(lines.slice(start), slugger);
  if (!title) {
    const h1 = blocks.find((b): b is HeadingBlock => b.type === 'heading' && b.depth === 1);
    if (h1) title = h1.text;
  }
  return { title, meta, blocks };
}

function parseBlocks(lines: string[], slugger: Slugger): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1][0];
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].match(FENCE_RE)?.[1].startsWith(marker)) {
        body.push(lines[j]);
        j += 1;
      }
      blocks.push({ type: 'code', lang: fence[2] ?? '', code: body.join('\n') });
      i = j + 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const inlines = parseInlines(heading[2]);
      const text = plainText(inlines);
      blocks.push({
        type: 'heading',
        depth: heading[1].length as HeadingBlock['depth'],
        inlines,
        text,
        id: slugger.slug(text),
      });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(QUOTE_RE);
        if (m) inner.push(m[1]);
        else if (lines[i].trim()) inner.push(lines[i].trim()); // lazy continuation
        else break;
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(inner, slugger) });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        const row = splitTableRow(lines[j]);
        while (row.length < header.length) row.push('');
        rows.push(row.slice(0, Math.max(header.length, 2)));
        j += 1;
      }
      blocks.push({ type: 'table', header, rows });
      i = j;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    if (LIST_RE.test(line)) {
      const run: string[] = [];
      let j = i;
      while (j < lines.length) {
        const current = lines[j];
        if (current.trim()) {
          if (
            run.length > 0 &&
            !LIST_RE.test(current) &&
            indentOf(current) < 2 &&
            (HEADING_RE.test(current) || QUOTE_RE.test(current) || FENCE_RE.test(current) || HR_RE.test(current))
          ) {
            break;
          }
          run.push(current);
          j += 1;
          continue;
        }
        // blank line: continue the list only if the next non-blank line is a list item
        let k = j + 1;
        while (k < lines.length && !lines[k].trim()) k += 1;
        if (k < lines.length && LIST_RE.test(lines[k])) {
          j = k;
          continue;
        }
        break;
      }
      blocks.push(buildList(run));
      i = j;
      continue;
    }

    const para: string[] = [line.trim()];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() &&
      !HEADING_RE.test(lines[j]) &&
      !HR_RE.test(lines[j]) &&
      !FENCE_RE.test(lines[j]) &&
      !QUOTE_RE.test(lines[j]) &&
      !LIST_RE.test(lines[j]) &&
      !(lines[j].includes('|') && j + 1 < lines.length && TABLE_SEP_RE.test(lines[j + 1]))
    ) {
      para.push(lines[j].trim());
      j += 1;
    }
    const inlines = parseInlines(para.join(' '));
    blocks.push({ type: 'para', inlines, text: plainText(inlines) });
    i = j;
  }

  return blocks;
}

function buildList(lines: string[]): ListBlock {
  const baseIndent = indentOf(lines[0]);
  const items: ListItem[] = [];
  let ordered = false;
  let i = 0;

  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || indentOf(lines[i]) > baseIndent + 1) {
      i += 1; // stray continuation without an open item; skip
      continue;
    }
    if (items.length === 0) ordered = /\d/.test(m[2][0]);

    const textParts = [stripTaskMarker(m[3].trim())];
    const childLines: string[] = [];
    i += 1;
    while (i < lines.length) {
      const child = lines[i].match(LIST_RE);
      const indent = indentOf(lines[i]);
      if (child && indent <= baseIndent + 1) break; // sibling item
      if (child) {
        childLines.push(lines[i]);
      } else if (lines[i].trim()) {
        if (childLines.length > 0) childLines.push(lines[i]);
        else textParts.push(lines[i].trim());
      }
      i += 1;
    }

    const raw = textParts.join(' ');
    const inlines = parseInlines(raw);
    const item: ListItem = { inlines, text: plainText(inlines) };
    if (childLines.length > 0) item.children = buildList(childLines);
    items.push(item);
  }

  return { type: 'list', ordered, items };
}
