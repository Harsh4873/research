import {
  childElements,
  collapse,
  findDescendant,
  findDescendants,
  firstChild,
  textContent,
  textOf,
  type XmlElement,
  type XmlNode,
} from './xml';
import { parseXml } from './xml';

export interface PaperMeta {
  title: string;
  authors: string[];
  journal?: string;
  year?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  license?: string;
  keywords: string[];
}

export interface PaperConversion {
  meta: PaperMeta;
  markdown: string;
  counts: {
    sections: number;
    tables: number;
    figures: number;
    equations: number;
    supplements: number;
    references: number;
  };
}

/* ------------------------------------------------------------------ *
 * Inline conversion
 * ------------------------------------------------------------------ */

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** Render MathML as a compact linear expression. */
function mathmlToText(node: XmlElement): string {
  const kids = childElements(node);
  const render = (el: XmlElement): string => mathmlToText(el);
  const joinKids = (sep = '') => kids.map(render).join(sep);

  switch (node.local) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'semantics':
    case 'mpadded':
      return joinKids();
    case 'mi':
    case 'mn':
    case 'mtext':
      return textContent(node);
    case 'mo': {
      const op = textContent(node);
      // Space around binary operators, but not around delimiters.
      return /^[(){}[\],.|]$/.test(op) ? op : ` ${op} `;
    }
    case 'msup':
      return kids.length >= 2 ? `${render(kids[0])}^${wrapIfLong(render(kids[1]))}` : joinKids();
    case 'msub':
      return kids.length >= 2 ? `${render(kids[0])}_${wrapIfLong(render(kids[1]))}` : joinKids();
    case 'msubsup':
      return kids.length >= 3
        ? `${render(kids[0])}_${wrapIfLong(render(kids[1]))}^${wrapIfLong(render(kids[2]))}`
        : joinKids();
    case 'mfrac':
      return kids.length >= 2 ? `(${render(kids[0])}) / (${render(kids[1])})` : joinKids();
    case 'msqrt':
      return `sqrt(${joinKids()})`;
    case 'mroot':
      return kids.length >= 2 ? `root_${render(kids[1])}(${render(kids[0])})` : joinKids();
    case 'mfenced': {
      const open = node.attrs.open ?? '(';
      const close = node.attrs.close ?? ')';
      return `${open}${kids.map(render).join(node.attrs.separators ?? ', ')}${close}`;
    }
    case 'mover':
      return kids.length >= 2 ? `${render(kids[0])}^(${render(kids[1])})` : joinKids();
    case 'munder':
      return kids.length >= 2 ? `${render(kids[0])}_(${render(kids[1])})` : joinKids();
    case 'munderover':
      return kids.length >= 3
        ? `${render(kids[0])}_(${render(kids[1])})^(${render(kids[2])})`
        : joinKids();
    case 'mtable':
      return kids.map(render).join('; ');
    case 'mtr':
      return kids.map(render).join(', ');
    case 'mtd':
      return joinKids();
    case 'mspace':
      return ' ';
    default:
      return joinKids();
  }
}

function wrapIfLong(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 1 ? `(${trimmed})` : trimmed;
}

/** Extract math from a JATS formula element as readable text. */
function formulaText(node: XmlElement): string {
  const tex = findDescendant(node, 'tex-math');
  if (tex) {
    return collapse(textOf(tex))
      .replace(/^\\documentclass[\s\S]*?\\begin\{document\}/, '')
      .replace(/\\end\{document\}$/, '')
      .replace(/\\begin\{equation\*?\}|\\end\{equation\*?\}/g, '')
      .trim();
  }
  const math = findDescendant(node, 'math');
  if (math) return collapse(mathmlToText(math));
  // Some publishers ship equations only as images; the label is not the maths.
  return '';
}

interface InlineOptions {
  /** Drop bibliographic citation markers, which add noise to study text. */
  dropCitations?: boolean;
}

/** Convert a JATS node's children to inline markdown. */
function inlineMarkdown(node: XmlNode, opts: InlineOptions = { dropCitations: true }): string {
  if (node.kind === 'text') return node.text;
  const kids = () => node.children.map((child) => inlineMarkdown(child, opts)).join('');

  switch (node.local) {
    case 'italic':
    case 'em': {
      const inner = collapse(kids());
      return inner ? `*${inner}*` : '';
    }
    case 'bold':
    case 'strong': {
      const inner = collapse(kids());
      return inner ? `**${inner}**` : '';
    }
    case 'monospace':
    case 'code': {
      const inner = collapse(kids());
      return inner ? `\`${inner}\`` : '';
    }
    case 'sup': {
      const inner = collapse(kids());
      return inner ? `^${inner}` : '';
    }
    case 'sub': {
      const inner = collapse(kids());
      return inner ? `_${inner}` : '';
    }
    case 'sc':
    case 'roman':
    case 'sans-serif':
    case 'underline':
      return kids();
    case 'ext-link': {
      const href = node.attrs['xlink:href'] ?? node.attrs.href ?? '';
      const text = collapse(kids());
      if (!text) return href;
      return href ? `[${text}](${href})` : text;
    }
    case 'uri': {
      const text = collapse(kids());
      return text;
    }
    case 'xref': {
      if (opts.dropCitations && node.attrs['ref-type'] === 'bibr') return '';
      return kids();
    }
    case 'inline-formula': {
      const math = formulaText(node);
      return math ? `\`${math}\`` : '';
    }
    case 'disp-formula': {
      const math = formulaText(node);
      return math ? `\`${math}\`` : '';
    }
    case 'break':
      return ' ';
    case 'fn':
    case 'label':
      return '';
    default:
      return kids();
  }
}

function paragraphText(node: XmlElement): string {
  return collapse(inlineMarkdown(node))
    .replace(/\s+([),.;:%])/g, '$1')
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/\[\s*[,;]?\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ *
 * Block conversion
 * ------------------------------------------------------------------ */

interface Ctx {
  out: string[];
  counts: PaperConversion['counts'];
  supplements: string[];
  /** Display equations published only as images, so with no text form. */
  imageEquations: number;
}

function push(ctx: Ctx, text: string) {
  if (text.trim()) ctx.out.push(text.trim());
}

/** True when a paragraph is nothing but monospace runs (a data listing). */
function isMonospaceBlock(node: XmlElement): boolean {
  let monospace = 0;
  for (const child of node.children) {
    if (child.kind === 'text') {
      if (child.text.trim()) return false;
      continue;
    }
    if (child.local !== 'monospace') return false;
    monospace += 1;
  }
  return monospace > 0;
}

function convertTable(wrap: XmlElement, ctx: Ctx) {
  const label = textContent(firstChild(wrap, 'label'));
  const caption = textContent(firstChild(wrap, 'caption'));
  const table = findDescendant(wrap, 'table');
  const heading = [label, caption].filter(Boolean).join(' ').trim();
  // Floats use level 4 so they stay out of the section-question outline while
  // remaining real, navigable headings.
  push(ctx, `#### ${heading || 'Table'}`);

  if (!table) {
    push(ctx, '_Table content is not available in the machine-readable full text._');
    ctx.counts.tables += 1;
    return;
  }

  const rows: string[][] = [];
  let headerRow: string[] | null = null;

  for (const section of childElements(table)) {
    if (section.local !== 'thead' && section.local !== 'tbody' && section.local !== 'tr') continue;
    const trs = section.local === 'tr' ? [section] : findDescendants(section, 'tr');
    for (const tr of trs) {
      const cells = childElements(tr)
        .filter((cell) => cell.local === 'td' || cell.local === 'th')
        .flatMap((cell) => {
          const text = escapeCell(paragraphText(cell));
          const span = Number.parseInt(cell.attrs.colspan ?? '1', 10);
          const count = Number.isFinite(span) && span > 1 ? Math.min(span, 12) : 1;
          return count > 1 ? [text, ...Array.from({ length: count - 1 }, () => '')] : [text];
        });
      if (cells.length === 0) continue;
      if (section.local === 'thead' && !headerRow) headerRow = cells;
      else rows.push(cells);
    }
  }

  if (!headerRow && rows.length > 0) headerRow = rows.shift() ?? null;
  if (!headerRow) {
    push(ctx, '_Table content is not available in the machine-readable full text._');
    ctx.counts.tables += 1;
    return;
  }

  const width = Math.max(headerRow.length, ...rows.map((row) => row.length), 2);
  const pad = (row: string[]) => {
    const copy = [...row];
    while (copy.length < width) copy.push('');
    return copy.slice(0, width);
  };
  const header = pad(headerRow).map((cell, i) => cell || `Column ${i + 1}`);

  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${pad(row).join(' | ')} |`);
  push(ctx, lines.join('\n'));

  const foot = firstChild(wrap, 'table-wrap-foot');
  if (foot) {
    const notes = childElements(foot)
      .flatMap((child) => (child.local === 'fn' ? [child] : findDescendants(child, 'fn')))
      // `fn` is stripped by the inline renderer (it marks a reference), so read
      // the footnote's own paragraphs here.
      .map((fn) => {
        const paras = childElements(fn, 'p').map((p) => paragraphText(p)).filter(Boolean);
        return paras.length > 0 ? paras.join(' ') : textContent(fn);
      })
      .filter(Boolean);
    const plain = notes.length === 0 ? paragraphText(foot) : '';
    if (notes.length > 0) push(ctx, notes.map((note) => `_${note}_`).join('  \n'));
    else if (plain) push(ctx, `_${plain}_`);
  }

  ctx.counts.tables += 1;
}

function convertFigure(fig: XmlElement, ctx: Ctx) {
  const label = textContent(firstChild(fig, 'label'));
  const caption = firstChild(fig, 'caption');
  const capTitle = caption ? textContent(firstChild(caption, 'title')) : '';
  const capBody = caption
    ? childElements(caption, 'p').map((p) => paragraphText(p)).filter(Boolean).join(' ')
    : '';
  const heading = [label, capTitle].filter(Boolean).join(' ').trim();
  push(ctx, `#### ${heading || 'Figure'}`);
  if (capBody) push(ctx, capBody);
  else if (!heading) push(ctx, '_Figure caption is not available._');
  ctx.counts.figures += 1;
}

function convertFormula(formula: XmlElement, ctx: Ctx) {
  const label = textContent(firstChild(formula, 'label'));
  const math = formulaText(formula);
  if (!math) {
    // Image-only equations carry no text. Counting them and noting it once
    // beats stamping dozens of identical placeholders through the document.
    ctx.imageEquations += 1;
    return;
  }
  push(ctx, `#### ${label ? `Equation ${label.replace(/[()]/g, '')}` : 'Equation'}`);
  push(ctx, '```math\n' + math + '\n```');
  ctx.counts.equations += 1;
}

function convertList(list: XmlElement, depth = 0): string {
  const ordered = (list.attrs['list-type'] ?? '').startsWith('order');
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  childElements(list, 'list-item').forEach((item, index) => {
    const parts = childElements(item)
      .filter((child) => child.local === 'p' || child.local === 'label')
      .map((child) => paragraphText(child))
      .filter(Boolean);
    const marker = ordered ? `${index + 1}.` : '-';
    const text = parts.join(' ');
    if (text) lines.push(`${indent}${marker} ${text}`);
    for (const nested of childElements(item, 'list')) lines.push(convertList(nested, depth + 1));
  });
  return lines.join('\n');
}

function convertDefList(defList: XmlElement): string {
  const lines: string[] = [];
  for (const item of findDescendants(defList, 'def-item')) {
    const term = textContent(firstChild(item, 'term'));
    const def = paragraphText(firstChild(item, 'def') ?? item);
    if (term && def) lines.push(`- **${term}**: ${def}`);
    else if (term) lines.push(`- **${term}**`);
  }
  return lines.join('\n');
}

function collectSupplement(node: XmlElement, ctx: Ctx) {
  const label = textContent(firstChild(node, 'label'));
  const caption = firstChild(node, 'caption');
  const capTitle = caption ? textContent(firstChild(caption, 'title')) : '';
  const capBody = caption
    ? childElements(caption, 'p').map((p) => paragraphText(p)).filter(Boolean).join(' ')
    : '';
  const media = firstChild(node, 'media') ?? findDescendant(node, 'media');
  const href = media?.attrs['xlink:href'] ?? node.attrs['xlink:href'] ?? '';
  const name = label || capTitle || href || 'Supplementary file';
  const description = [capTitle && capTitle !== name ? capTitle : '', capBody].filter(Boolean).join(' — ');
  const suffix = href ? ` (file: \`${href}\`)` : '';
  ctx.supplements.push(`- **${name.replace(/[.:]$/, '')}**: ${description || 'Supplementary file provided with the article.'}${suffix}`);
  ctx.counts.supplements += 1;
}

/** Convert the children of a section (or body) to markdown blocks. */
function convertBlocks(parent: XmlElement, ctx: Ctx, depth: number) {
  for (const child of childElements(parent)) {
    switch (child.local) {
      case 'title':
        break; // handled by the caller
      case 'sec':
        convertSection(child, ctx, depth + 1);
        break;
      case 'p': {
        // Floats are often wrapped in paragraphs; pull them out first.
        const floats = childElements(child).filter((el) =>
          ['table-wrap', 'fig', 'disp-formula', 'supplementary-material', 'list', 'def-list', 'boxed-text'].includes(el.local),
        );
        if (floats.length > 0) {
          const clone: XmlElement = {
            ...child,
            children: child.children.filter((node) => node.kind === 'text' || !floats.includes(node as XmlElement)),
          };
          const text = paragraphText(clone);
          if (text) push(ctx, text);
          for (const float of floats) convertBlocks({ ...parent, children: [float] }, ctx, depth);
        } else if (isMonospaceBlock(child)) {
          // Data listings and record dumps belong in a code block, not prose.
          const code = collapse(textOf(child));
          if (code) push(ctx, '```\n' + code + '\n```');
        } else {
          const text = paragraphText(child);
          if (text) push(ctx, text);
        }
        break;
      }
      case 'table-wrap':
        convertTable(child, ctx);
        break;
      case 'fig':
        convertFigure(child, ctx);
        break;
      case 'disp-formula':
        convertFormula(child, ctx);
        break;
      case 'supplementary-material':
        collectSupplement(child, ctx);
        break;
      case 'list':
        push(ctx, convertList(child));
        break;
      case 'def-list':
        push(ctx, convertDefList(child));
        break;
      case 'boxed-text':
      case 'statement': {
        const inner: Ctx = { ...ctx, out: [] };
        convertBlocks(child, inner, depth);
        const quoted = inner.out.join('\n\n').split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
        push(ctx, quoted);
        break;
      }
      case 'disp-quote': {
        const text = childElements(child, 'p').map((p) => paragraphText(p)).filter(Boolean).join(' ');
        if (text) push(ctx, `> ${text}`);
        break;
      }
      case 'code':
      case 'preformat': {
        const code = textOf(child).replace(/^\n+|\n+$/g, '');
        if (code.trim()) push(ctx, '```\n' + code + '\n```');
        break;
      }
      case 'graphic':
      case 'media':
      case 'label':
      case 'ref-list':
      case 'fn-group':
        break;
      default: {
        // Unknown containers may still hold sections or paragraphs.
        if (childElements(child).some((el) => ['sec', 'p', 'table-wrap', 'fig'].includes(el.local))) {
          convertBlocks(child, ctx, depth);
        }
        break;
      }
    }
  }
}

/** Journals often set section titles in full caps; make them readable. */
export function tidyHeading(text: string): string {
  const clean = text.replace(/\s+/g, ' ').replace(/\s*\.$/, '').trim();
  if (!clean) return clean;
  const letters = clean.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    return clean
      .toLowerCase()
      .replace(/(^|[\s(])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`)
      .replace(/\b(And|Of|The|For|In|On|To|A|An|With)\b/g, (word) => word.toLowerCase())
      .replace(/^([a-z])/, (ch) => ch.toUpperCase());
  }
  return clean;
}

function isReferenceSection(sec: XmlElement, title: string): boolean {
  return sec.attrs['sec-type'] === 'ref-list' || /^(references|bibliography|literature cited)$/i.test(title.trim());
}

function convertSection(sec: XmlElement, ctx: Ctx, depth: number) {
  const title = textContent(firstChild(sec, 'title'));
  // Reference sections are rendered once, from the collected reference list.
  if (isReferenceSection(sec, title)) return;
  const level = Math.min(Math.max(depth, 2), 6);
  if (title) {
    push(ctx, `${'#'.repeat(level)} ${tidyHeading(title)}`);
    ctx.counts.sections += 1;
  }
  convertBlocks(sec, ctx, level);
}

/* ------------------------------------------------------------------ *
 * Front matter and metadata
 * ------------------------------------------------------------------ */

function authorNames(articleMeta: XmlElement | undefined): string[] {
  if (!articleMeta) return [];
  const names: string[] = [];
  for (const group of childElements(articleMeta, 'contrib-group')) {
    for (const contrib of childElements(group, 'contrib')) {
      if (contrib.attrs['contrib-type'] && contrib.attrs['contrib-type'] !== 'author') continue;
      const name = firstChild(contrib, 'name') ?? firstChild(contrib, 'name-alternatives');
      if (name) {
        const surname = textContent(firstChild(name, 'surname'));
        const given = textContent(firstChild(name, 'given-names'));
        const full = [given, surname].filter(Boolean).join(' ');
        if (full) names.push(full);
      } else {
        const collab = textContent(firstChild(contrib, 'collab'));
        if (collab) names.push(collab);
      }
    }
  }
  return names;
}

function articleId(articleMeta: XmlElement | undefined, type: string): string | undefined {
  if (!articleMeta) return undefined;
  for (const id of childElements(articleMeta, 'article-id')) {
    if (id.attrs['pub-id-type'] === type) return textContent(id);
  }
  return undefined;
}

function pubYear(articleMeta: XmlElement | undefined): string | undefined {
  if (!articleMeta) return undefined;
  const dates = childElements(articleMeta, 'pub-date');
  const preferred =
    dates.find((d) => d.attrs['pub-type'] === 'epub' || d.attrs['date-type'] === 'pub') ?? dates[0];
  const year = textContent(firstChild(preferred ?? articleMeta, 'year'));
  return year || undefined;
}

function yamlEscape(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim().replace(/"/g, "'");
  return /[:#\-[\]{}&*!|>%@`]/.test(clean) ? `"${clean}"` : clean;
}

export function buildFrontMatter(meta: PaperMeta, extra: Record<string, string | undefined> = {}): string {
  const fields: Array<[string, string | undefined]> = [
    ['title', meta.title],
    ['authors', meta.authors.join(', ') || undefined],
    ['journal', meta.journal],
    ['year', meta.year],
    ['doi', meta.doi],
    ['pmid', meta.pmid],
    ['pmcid', meta.pmcid],
    ['license', meta.license],
    ['keywords', meta.keywords.join(', ') || undefined],
    ...Object.entries(extra),
  ];
  const lines = fields
    .filter(([, value]) => value && value.trim())
    .map(([key, value]) => `${key}: ${yamlEscape(value!)}`);
  return `---\n${lines.join('\n')}\n---`;
}

/** A citation line that reads well and produces no junk flashcards. */
export function citationLine(meta: PaperMeta): string {
  const bits: string[] = [];
  // Deliberately unemphasised: bold here would become a fill-in-the-blank card.
  if (meta.journal) bits.push(meta.journal);
  if (meta.year) bits.push(`(${meta.year})`);
  const authors =
    meta.authors.length > 6 ? `${meta.authors.slice(0, 6).join(', ')}, et al.` : meta.authors.join(', ');
  const tail: string[] = [];
  if (meta.doi) tail.push(`DOI ${meta.doi}`);
  if (meta.pmid) tail.push(`PMID ${meta.pmid}`);
  if (meta.pmcid) tail.push(meta.pmcid);
  const head = bits.join(' ');
  return `> ${[head, authors, tail.join(' · ')].filter(Boolean).join(' · ')}`;
}

function abstractMarkdown(abstract: XmlElement | undefined): string[] {
  if (!abstract) return [];
  const out: string[] = [];
  const sections = childElements(abstract, 'sec');
  if (sections.length > 0) {
    for (const sec of sections) {
      const title = textContent(firstChild(sec, 'title'));
      const body = childElements(sec, 'p').map((p) => paragraphText(p)).filter(Boolean).join(' ');
      if (title && body) out.push(`- **${title.replace(/[:.]$/, '')}**: ${body}`);
      else if (body) out.push(body);
    }
    return out;
  }
  for (const p of childElements(abstract, 'p')) {
    const text = paragraphText(p);
    if (text) out.push(text);
  }
  if (out.length === 0) {
    const text = paragraphText(abstract);
    if (text) out.push(text);
  }
  return out;
}

function referenceLines(scope: XmlElement | undefined, limit = 60): string[] {
  if (!scope) return [];
  const refs = findDescendants(scope, 'ref');
  const lines: string[] = [];
  for (const ref of refs.slice(0, limit)) {
    const citation =
      firstChild(ref, 'element-citation') ??
      firstChild(ref, 'mixed-citation') ??
      firstChild(ref, 'citation');
    const source = citation ? textContent(firstChild(citation, 'source')) : '';
    const title = citation ? textContent(firstChild(citation, 'article-title')) : '';
    const year = citation ? textContent(firstChild(citation, 'year')) : '';
    const names = citation
      ? findDescendants(citation, 'surname').slice(0, 3).map((n) => textContent(n))
      : [];
    const composed = [
      names.length > 0 ? `${names.join(', ')}${findDescendants(citation!, 'surname').length > 3 ? ' et al.' : ''}` : '',
      title,
      source,
      year,
    ]
      .filter(Boolean)
      .join('. ');
    // Some publishers ship the whole citation as one pre-formatted string.
    const citationString = citation ? findDescendant(citation, 'named-content') : undefined;
    const text = composed || textContent(citationString) || textContent(citation ?? ref);
    if (text) lines.push(text.replace(/\s+/g, ' ').trim());
  }
  return lines;
}

/** A short licence label rather than a truncated paragraph of legal text. */
export function summarizeLicense(licenseEl: XmlElement | undefined): string | undefined {
  if (!licenseEl) return undefined;
  const href = licenseEl.attrs['xlink:href'] ?? '';
  const text = textContent(licenseEl);
  const haystack = `${href} ${text}`;
  const nc = /non-?commercial|\/by-nc/i.test(haystack);
  const nd = /no-?derivatives|\/by-nd|-nd\//i.test(haystack);
  const sa = /share-?alike|-sa\//i.test(haystack);
  if (/creative commons|creativecommons\.org/i.test(haystack)) {
    if (/public domain|\/zero\/|cc0/i.test(haystack)) return 'CC0';
    const parts = ['CC BY'];
    if (nc) parts.push('NC');
    if (nd) parts.push('ND');
    else if (sa) parts.push('SA');
    return parts.join('-');
  }
  if (/open access/i.test(haystack)) return 'Open access';
  if (href) return href;
  return text ? text.slice(0, 60).replace(/\s+\S*$/, '') : undefined;
}

/**
 * The letters a run of words would contribute to an abbreviation. An all-caps
 * word contributes all of its letters, so "ribosomal RNA" signs as "rRNA".
 */
function abbreviationSignature(words: string[]): string {
  return words
    .map((word) => {
      const letters = word.replace(/[^A-Za-z]/g, '');
      if (!letters) return '';
      return letters.length > 1 && letters === letters.toUpperCase() ? letters : letters[0];
    })
    .join('');
}

/** Abbreviations defined in the text as "expansion (ABC)". */
export function mineAbbreviations(text: string, limit = 25): string[] {
  const found = new Map<string, string>();
  const re = /([A-Za-z][A-Za-z0-9'’\-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’\-]*){0,5})\s+\(([A-Za-z][A-Za-z0-9]{1,7})\)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) && found.size < limit) {
    const phrase = match[1].trim();
    const abbr = match[2].trim();
    const letters = abbr.replace(/[^A-Za-z]/g, '');
    if (letters.length < 2 || found.has(abbr)) continue;
    // Require at least one capital so ordinary parentheticals are not mined.
    if (abbr === abbr.toLowerCase()) continue;

    const words = phrase.split(/\s+/).filter(Boolean);
    // Try the shortest trailing phrase whose signature matches.
    for (let take = 1; take <= words.length; take++) {
      const candidate = words.slice(words.length - take);
      if (abbreviationSignature(candidate).toLowerCase() !== letters.toLowerCase()) continue;
      const expansion = candidate.join(' ');
      if (expansion.length >= 4 && expansion.toLowerCase() !== abbr.toLowerCase()) found.set(abbr, expansion);
      break;
    }
  }
  return [...found.entries()].map(([abbr, expansion]) => `- **${abbr}**: ${expansion}`);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export interface JatsOverrides {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  sourceNote?: string;
}

/** Convert a JATS full-text XML document into sectioned study markdown. */
export function jatsToMarkdown(xml: string, overrides: JatsOverrides = {}): PaperConversion | null {
  const root = parseXml(xml);
  if (!root) return null;
  const article = root.local === 'article' ? root : findDescendant(root, 'article') ?? root;

  const front = firstChild(article, 'front');
  const articleMeta = front ? firstChild(front, 'article-meta') : undefined;
  const journalMeta = front ? firstChild(front, 'journal-meta') : undefined;

  const titleGroup = articleMeta ? firstChild(articleMeta, 'title-group') : undefined;
  const title = collapse(
    inlineMarkdown(firstChild(titleGroup ?? articleMeta ?? article, 'article-title') ?? article),
  ).replace(/\s*\.$/, '');

  const journal =
    textContent(firstChild(journalMeta ?? article, 'journal-title')) ||
    textContent(findDescendant(journalMeta ?? article, 'journal-title')) ||
    undefined;

  const permissions = articleMeta ? firstChild(articleMeta, 'permissions') : undefined;
  const licenseEl = permissions ? firstChild(permissions, 'license') : undefined;
  const license = summarizeLicense(licenseEl);

  const keywords = articleMeta
    ? childElements(articleMeta, 'kwd-group').flatMap((group) =>
        childElements(group, 'kwd').map((kwd) => textContent(kwd)).filter(Boolean),
      )
    : [];

  const meta: PaperMeta = {
    title: title || 'Untitled paper',
    authors: authorNames(articleMeta),
    journal,
    year: pubYear(articleMeta),
    doi: overrides.doi ?? articleId(articleMeta, 'doi'),
    pmid: overrides.pmid ?? articleId(articleMeta, 'pmid'),
    pmcid: overrides.pmcid ?? (articleId(articleMeta, 'pmc') ? `PMC${articleId(articleMeta, 'pmc')!.replace(/^PMC/i, '')}` : undefined),
    license,
    keywords,
  };

  const ctx: Ctx = {
    out: [],
    counts: { sections: 0, tables: 0, figures: 0, equations: 0, supplements: 0, references: 0 },
    supplements: [],
    imageEquations: 0,
  };

  const abstract = articleMeta ? firstChild(articleMeta, 'abstract') : undefined;
  const abstractLines: string[] = [];
  for (const line of abstractMarkdown(abstract)) {
    // Some journals print a run-in "Keywords:" label inside the abstract;
    // that belongs in the metadata, not in a flashcard.
    const keywordLine = line.match(/^\*\*Key\s?words?:?\*\*:?\s*(.+)$/i) ?? line.match(/^Key\s?words?:\s*(.+)$/i);
    if (keywordLine) {
      const found = keywordLine[1]
        .split(/[,;·]/)
        .map((word) => word.replace(/[*_.]+$/, '').trim())
        .filter(Boolean);
      for (const word of found) if (!meta.keywords.includes(word)) meta.keywords.push(word);
      continue;
    }
    abstractLines.push(line);
  }
  if (abstractLines.length > 0) {
    push(ctx, '## Abstract');
    for (const line of abstractLines) push(ctx, line);
  }

  const body = firstChild(article, 'body');
  if (body) convertBlocks(body, ctx, 1);

  const back = firstChild(article, 'back');
  if (back) {
    // Supplementary material and glossaries often live in <back>.
    for (const supp of findDescendants(back, 'supplementary-material')) collectSupplement(supp, ctx);
    const glossary = findDescendant(back, 'glossary');
    const defLists = glossary ? findDescendants(glossary, 'def-list') : [];
    if (defLists.length > 0) {
      push(ctx, '## Glossary');
      for (const defList of defLists) push(ctx, convertDefList(defList));
    }
  }
  if (ctx.imageEquations > 0) {
    push(ctx, '## Equations');
    push(
      ctx,
      `This article publishes its ${ctx.imageEquations} display equation${ctx.imageEquations === 1 ? '' : 's'} as images rather than as text, so the formulas themselves could not be imported. The surrounding explanations are all here; open the original article to read the derivations.`,
    );
  }

  if (ctx.supplements.length > 0) {
    push(ctx, '## Supplementary material');
    push(ctx, [...new Set(ctx.supplements)].join('\n'));
  }

  // Mine abbreviations from the prose when the article has no glossary.
  const proseForMining = ctx.out.filter((block) => !block.startsWith('#') && !block.startsWith('|')).join(' ');
  if (!ctx.out.some((block) => block === '## Glossary')) {
    const abbreviations = mineAbbreviations(proseForMining);
    if (abbreviations.length >= 2) {
      push(ctx, '## Glossary');
      push(ctx, abbreviations.join('\n'));
    }
  }

  // Reference lists live in <back> in some journals and inside a body section
  // in others, so collect them from the whole article.
  const references = referenceLines(article);
  if (references.length > 0) {
    ctx.counts.references = references.length;
    push(ctx, '## References');
    push(ctx, references.map((ref, index) => `${index + 1}. ${ref}`).join('\n'));
  }

  const header = [
    buildFrontMatter(meta, { source: overrides.sourceNote ?? 'Europe PMC full text (JATS)' }),
    `# ${meta.title}`,
    citationLine(meta),
  ];
  if (meta.keywords.length > 0) header.push(`_This paper is indexed under ${meta.keywords.join(', ')}._`);

  const markdown = [...header, ...ctx.out].join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

  return { meta, markdown, counts: ctx.counts };
}
