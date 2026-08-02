/**
 * Layout reconstruction for PDF text.
 *
 * PDFs carry positioned glyph runs, not structure. Everything here is pure so
 * the heuristics that rebuild lines, columns, headings, tables, and equations
 * can be unit-tested without a PDF engine.
 */

export interface PdfSpan {
  text: string;
  /** Left edge, in PDF user units. */
  x: number;
  /** Baseline, measured from the top of the page. */
  y: number;
  width: number;
  height: number;
  fontName: string;
  bold: boolean;
  italic: boolean;
}

export interface PdfLine {
  text: string;
  x: number;
  right: number;
  y: number;
  size: number;
  bold: boolean;
  page: number;
  /** Gaps between spans, used to spot table columns. */
  gaps: number[];
  /** Left edge of each span, used to align table columns across lines. */
  stops: number[];
  /** Text grouped into visually separated columns (table cell candidates). */
  cells: string[];
  /** Left edge of each cell. */
  cellStops: number[];
}

export interface PdfPage {
  page: number;
  width: number;
  height: number;
  spans: PdfSpan[];
}

const SECTION_WORDS = [
  'abstract',
  'summary',
  'introduction',
  'background',
  'related work',
  'materials and methods',
  'methods and materials',
  'methods',
  'materials',
  'experimental procedures',
  'results',
  'results and discussion',
  'discussion',
  'conclusion',
  'conclusions',
  'limitations',
  'future work',
  'acknowledgements',
  'acknowledgments',
  'author contributions',
  'funding',
  'competing interests',
  'conflict of interest',
  'data availability',
  'code availability',
  'supplementary material',
  'supplementary information',
  'supporting information',
  'references',
  'bibliography',
  'appendix',
];

const CAPTION_RE = /^(table|fig(?:ure)?\.?|scheme|box|algorithm)\s*([0-9IVXivx]+[a-z]?)\s*[.:—–-]?\s*(.*)$/i;
const NUMBERED_HEADING_RE = /^(\d{1,2}(?:\.\d{1,2}){0,2})[.)]?\s+(\S.*)$/;
const MATH_CHARS = /[=≈≤≥±×÷∑∏∫√∞∂∇αβγδεθλμνπρστφχψωΔΣΩ°′^_|⟨⟩]/g;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Group spans into visual lines, ordered top-to-bottom then left-to-right. */
export function buildLines(page: PdfPage): PdfLine[] {
  const spans = page.spans.filter((span) => span.text.trim().length > 0);
  if (spans.length === 0) return [];

  const tolerance = Math.max(2, median(spans.map((s) => s.height)) * 0.5);
  const buckets: PdfSpan[][] = [];
  for (const span of [...spans].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const bucket = buckets[buckets.length - 1];
    if (bucket && Math.abs(bucket[0].y - span.y) <= tolerance) bucket.push(span);
    else buckets.push([span]);
  }

  return buckets.map((bucket) => {
    const ordered = [...bucket].sort((a, b) => a.x - b.x);
    const gaps: number[] = [];
    const stops = ordered.map((span) => span.x);
    let text = '';
    let previousRight = ordered[0].x;
    const sizes = ordered.map((span) => span.height);
    const spaceWidth = median(sizes) * 0.28;

    ordered.forEach((span, index) => {
      if (index > 0) {
        const gap = span.x - previousRight;
        gaps.push(gap);
        if (gap > spaceWidth) text += ' ';
      }
      text += span.text;
      previousRight = span.x + span.width;
    });

    const boldChars = ordered.filter((span) => span.bold).reduce((sum, span) => sum + span.text.length, 0);
    const totalChars = ordered.reduce((sum, span) => sum + span.text.length, 0);
    const size = median(sizes);

    // Group spans into cells: a gap much wider than a word space is column
    // separation rather than spacing, which is how PDF tables are laid out.
    const cellGap = Math.max(size * 1.4, 6);
    const cells: string[] = [];
    const cellStops: number[] = [];
    let current = '';
    let currentRight = ordered[0].x;
    ordered.forEach((sp, index) => {
      if (index > 0 && sp.x - currentRight > cellGap) {
        cells.push(current.replace(/\s+/g, ' ').trim());
        current = '';
      }
      if (!current) cellStops[cells.length] = sp.x;
      current += current && sp.x - currentRight > size * 0.28 ? ` ${sp.text}` : sp.text;
      currentRight = sp.x + sp.width;
    });
    if (current.trim()) cells.push(current.replace(/\s+/g, ' ').trim());

    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: ordered[0].x,
      right: previousRight,
      y: ordered[0].y,
      size,
      bold: totalChars > 0 && boldChars / totalChars > 0.6,
      page: page.page,
      gaps,
      stops,
      cells: cells.filter(Boolean),
      cellStops: cellStops.slice(0, cells.length),
    };
  });
}

/**
 * Detect a two-column layout and return lines in reading order.
 * Single-column pages are returned untouched.
 */
export function orderColumns(lines: PdfLine[], pageWidth: number): PdfLine[] {
  if (lines.length < 8) return lines;
  const mid = pageWidth / 2;
  const left = lines.filter((line) => line.right < mid + pageWidth * 0.04);
  const right = lines.filter((line) => line.x > mid - pageWidth * 0.04);
  const spanning = lines.filter((line) => !left.includes(line) && !right.includes(line));

  // Require both columns to carry real content before splitting.
  if (left.length < 4 || right.length < 4) return lines;
  if (left.length + right.length < lines.length * 0.7) return lines;

  const byY = (a: PdfLine, b: PdfLine) => a.y - b.y;
  const topSpanning = spanning.filter((line) => line.y <= Math.min(...left.map((l) => l.y), ...right.map((l) => l.y)));
  const rest = spanning.filter((line) => !topSpanning.includes(line));
  return [...topSpanning.sort(byY), ...left.sort(byY), ...right.sort(byY), ...rest.sort(byY)];
}

/** Lines repeated at the same page position are running heads or footers. */
export function findRunningLines(pages: PdfLine[][]): Set<string> {
  const counts = new Map<string, number>();
  const total = pages.length;
  if (total < 3) return new Set();
  for (const lines of pages) {
    if (lines.length === 0) continue;
    const top = lines.slice(0, 2);
    const bottom = lines.slice(-2);
    for (const line of [...top, ...bottom]) {
      const key = normalizeRunning(line.text);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.floor(total * 0.4));
  return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key));
}

function normalizeRunning(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 4 || clean.length > 120) return '';
  // Page numbers vary; normalise digits so the shape still matches.
  return clean.replace(/\d+/g, '#').toLowerCase();
}

export function isPageNumber(text: string): boolean {
  return /^[|[(]?\s*(page\s*)?\d{1,4}\s*(of\s*\d{1,4})?\s*[)\]|]?$/i.test(text.trim());
}

export function mathDensity(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  const symbols = clean.match(MATH_CHARS)?.length ?? 0;
  const digits = clean.match(/\d/g)?.length ?? 0;
  const letters = clean.match(/[A-Za-z]/g)?.length ?? 0;
  return (symbols * 2 + digits) / Math.max(1, symbols * 2 + digits + letters);
}

export function looksLikeEquation(line: PdfLine): boolean {
  const text = line.text.trim();
  if (text.length < 3 || text.length > 200) return false;
  if (/^[A-Z][a-z]+ \d/.test(text)) return false;
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]{3,}$/.test(word));
  const hasOperator = /[=≈≤≥<>+−×÷∑∏∫]/.test(text);
  return hasOperator && words.length <= 4 && mathDensity(text) > 0.35;
}

export interface HeadingInfo {
  level: 2 | 3;
  title: string;
}

/** Classify a line as a section heading, using wording, size, and weight. */
export function classifyHeading(line: PdfLine, bodySize: number): HeadingInfo | null {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 90) return null;
  if (CAPTION_RE.test(text)) return null;
  if (/[.;,]$/.test(text) && !/\.$/.test(text.replace(/\b(?:[A-Z]\.){1,3}$/, ''))) return null;

  const lower = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const numbered = text.match(NUMBERED_HEADING_RE);

  if (SECTION_WORDS.includes(lower)) return { level: 2, title: titleCase(text) };
  if (numbered) {
    const depth = numbered[1].split('.').filter(Boolean).length;
    const body = numbered[2].trim();
    if (body.length <= 80 && !/[.]$/.test(body) && (line.size >= bodySize * 0.98 || line.bold)) {
      return { level: depth <= 1 ? 2 : 3, title: `${numbered[1]} ${body}` };
    }
  }
  const bigger = line.size > bodySize * 1.12;
  const emphasised = line.bold && line.size >= bodySize * 0.98;
  const shortEnough = text.split(/\s+/).length <= 9;
  if ((bigger || emphasised) && shortEnough && /^[A-Z0-9]/.test(text) && !/[)(]$/.test(text)) {
    return { level: bigger ? 2 : 3, title: text };
  }
  return null;
}

function titleCase(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === clean.toUpperCase()) {
    return clean
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\bAnd\b/g, 'and')
      .replace(/\bOf\b/g, 'of');
  }
  return clean;
}

export function parseCaption(text: string): { label: string; rest: string } | null {
  const match = text.trim().match(CAPTION_RE);
  if (!match) return null;
  const kind = /^t/i.test(match[1]) ? 'Table' : /^s/i.test(match[1]) ? 'Scheme' : /^b/i.test(match[1]) ? 'Box' : /^a/i.test(match[1]) ? 'Algorithm' : 'Figure';
  return { label: `${kind} ${match[2]}`, rest: match[3].trim() };
}

/** Join wrapped lines into paragraphs, repairing end-of-line hyphenation. */
export function joinParagraph(lines: string[]): string {
  let out = '';
  for (const line of lines) {
    const piece = line.trim();
    if (!piece) continue;
    if (!out) {
      out = piece;
      continue;
    }
    if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(piece)) out = `${out.slice(0, -1)}${piece}`;
    else out = `${out} ${piece}`;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Consecutive multi-column lines with aligned column starts are a table. */
export function detectTableRun(lines: PdfLine[], start: number): number {
  const first = lines[start];
  if (!first || first.cells.length < 2) return start;
  let end = start;
  while (end < lines.length) {
    const line = lines[end];
    if (line.cells.length < 2) break;
    if (end > start && !columnsAlign(first, line)) break;
    end += 1;
  }
  return end - start >= 2 ? end : start;
}

/** Two rows belong to the same table when their column starts line up. */
function columnsAlign(a: PdfLine, b: PdfLine): boolean {
  const tolerance = Math.max(a.size, b.size) * 1.6;
  let matched = 0;
  for (const stop of b.cellStops) {
    if (a.cellStops.some((other) => Math.abs(other - stop) <= tolerance)) matched += 1;
  }
  return matched >= Math.min(2, b.cellStops.length);
}

/** The visually separated columns of a line. */
export function splitRow(line: PdfLine): string[] {
  return line.cells.length > 0 ? line.cells : [line.text];
}

export interface DocumentBuildOptions {
  /** Stop capturing body prose once the reference list starts. */
  trimReferences?: boolean;
}

export interface BuiltDocument {
  markdown: string;
  counts: { sections: number; tables: number; figures: number; equations: number };
}

/**
 * Assemble ordered lines into sectioned markdown.
 * `lines` must already be in reading order across the whole document.
 */
export function buildMarkdown(lines: PdfLine[], options: DocumentBuildOptions = {}): BuiltDocument {
  const bodySize = median(lines.map((line) => line.size)) || 10;
  const out: string[] = [];
  const counts = { sections: 0, tables: 0, figures: 0, equations: 0 };
  let paragraph: string[] = [];
  let inReferences = false;
  const references: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const text = joinParagraph(paragraph);
    paragraph = [];
    if (text.length > 1) out.push(text);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();
    if (!text || isPageNumber(text)) continue;

    const heading = classifyHeading(line, bodySize);
    if (heading) {
      flush();
      const isRefs = /^(references|bibliography)$/i.test(heading.title.trim());
      inReferences = isRefs;
      out.push(`${'#'.repeat(heading.level)} ${heading.title}`);
      counts.sections += 1;
      continue;
    }

    if (inReferences) {
      if (options.trimReferences !== false) {
        references.push(text);
        continue;
      }
    }

    const caption = parseCaption(text);
    if (caption) {
      flush();
      out.push(`#### ${caption.label}${caption.rest ? `. ${caption.rest}` : ''}`);
      if (/^Table/.test(caption.label)) counts.tables += 1;
      else counts.figures += 1;
      // A table body usually follows its caption.
      const end = detectTableRun(lines, i + 1);
      if (end > i + 1) {
        const rows = lines.slice(i + 1, end).map((row) => splitRow(row));
        const width = Math.max(...rows.map((row) => row.length), 2);
        const pad = (row: string[]) => {
          const copy = row.map((cell) => cell.replace(/\|/g, '\\|'));
          while (copy.length < width) copy.push('');
          return copy.slice(0, width);
        };
        const header = pad(rows[0]).map((cell, idx) => cell || `Column ${idx + 1}`);
        const table = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
        for (const row of rows.slice(1)) table.push(`| ${pad(row).join(' | ')} |`);
        out.push(table.join('\n'));
        i = end - 1;
      }
      continue;
    }

    if (looksLikeEquation(line)) {
      flush();
      out.push('```math\n' + text + '\n```');
      counts.equations += 1;
      continue;
    }

    // A large vertical gap or a sentence end followed by a fresh capital
    // starts a new paragraph.
    const previous = lines[i - 1];
    if (previous && paragraph.length > 0) {
      const gap = line.y - previous.y;
      const newBlock = gap > line.size * 2.1 || (previous.page !== line.page && /[.!?]$/.test(previous.text));
      if (newBlock) flush();
    }
    paragraph.push(text);
  }
  flush();

  if (references.length > 0) {
    const grouped = groupReferences(references);
    out.push(`_This set lists ${grouped.length} reference${grouped.length === 1 ? '' : 's'} from the paper._`);
    out.push(grouped.slice(0, 60).map((ref, index) => `${index + 1}. ${ref}`).join('\n'));
  }

  return { markdown: out.join('\n\n'), counts };
}

/** Reference lists wrap across lines; start a new entry at a numeric marker. */
export function groupReferences(lines: string[]): string[] {
  const refs: string[] = [];
  for (const line of lines) {
    const starts = /^\[?\d{1,3}[.)\]]\s+/.test(line) || /^[A-Z][A-Za-z'’-]+,\s+[A-Z]\./.test(line);
    if (starts || refs.length === 0) refs.push(line.replace(/^\[?\d{1,3}[.)\]]\s+/, ''));
    else refs[refs.length - 1] = joinParagraph([refs[refs.length - 1], line]);
  }
  return refs.filter((ref) => ref.length > 12);
}
