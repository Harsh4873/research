import { decodeEntities } from './xml';

/**
 * Converts the HTML that leaks into text sources into markdown.
 *
 * PubMed structured abstracts arrive as `<h4>Background</h4>text…`, and text
 * pasted from a journal page carries `<p>`, `<i>`, `<sup>` and friends. Left
 * alone those tags render as literal text.
 */

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const BLOCK_HTML_RE = /<\/?(?:h[1-6]|p|br|div|ul|ol|li|blockquote|table|tr|td|th|section|article)\b[^>]*>/i;
const ANY_HTML_RE = /<\/?(?:h[1-6]|p|br|div|ul|ol|li|blockquote|b|i|em|strong|sup|sub|code|a|span|abbr|small|u)\b[^>]*>/i;

/** True when the text carries HTML that would otherwise render literally. */
export function looksLikeHtml(text: string): boolean {
  return ANY_HTML_RE.test(text);
}

export function hasBlockHtml(text: string): boolean {
  return BLOCK_HTML_RE.test(text);
}

function attr(rawAttrs: string, name: string): string | undefined {
  const match = rawAttrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[2] ?? match?.[3] ?? match?.[4];
}

/**
 * Heading levels are shifted so the shallowest becomes `##`. A PubMed abstract
 * uses only `<h4>`, which would otherwise become a level nothing reads as a
 * section.
 */
function headingShift(html: string): number {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  if (levels.length === 0) return 0;
  return Math.min(...levels) - 2;
}

export function htmlToMarkdown(html: string): string {
  let source = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const shift = headingShift(source);
  const listStack: Array<{ ordered: boolean; index: number }> = [];
  let out = '';
  let linkHref: string | undefined;
  let last = 0;
  let match: RegExpExecArray | null;

  const text = (value: string) => {
    out += value;
  };
  const block = () => {
    out = out.replace(/[ \t]+$/, '');
    if (!out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n';
  };

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(source))) {
    text(source.slice(last, match.index));
    last = match.index + match[0].length;

    const closing = match[0][1] === '/';
    const name = match[1].toLowerCase();
    const attrs = match[2] ?? '';

    switch (name) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Math.min(6, Math.max(1, Number(name[1]) - shift));
        if (closing) block();
        else {
          block();
          text(`${'#'.repeat(level)} `);
        }
        break;
      }
      case 'p':
      case 'div':
      case 'section':
      case 'article':
      case 'tr':
        block();
        break;
      case 'br':
        text('\n');
        break;
      case 'ul':
      case 'ol':
        if (closing) listStack.pop();
        else listStack.push({ ordered: name === 'ol', index: 0 });
        block();
        break;
      case 'li': {
        if (closing) break;
        const list = listStack[listStack.length - 1];
        out = out.replace(/[ \t]+$/, '');
        if (!out.endsWith('\n')) out += '\n';
        if (list) {
          list.index += 1;
          text(list.ordered ? `${list.index}. ` : '- ');
        } else {
          text('- ');
        }
        break;
      }
      case 'blockquote':
        block();
        if (!closing) text('> ');
        break;
      case 'b':
      case 'strong':
        text('**');
        break;
      case 'i':
      case 'em':
        text('*');
        break;
      case 'code':
        text('`');
        break;
      case 'sup':
        if (!closing) text('^');
        break;
      case 'sub':
        if (!closing) text('_');
        break;
      case 'a': {
        if (closing) {
          text(linkHref ? `](${linkHref})` : '');
          linkHref = undefined;
        } else {
          const href = attr(attrs, 'href');
          if (href) {
            linkHref = href;
            text('[');
          }
        }
        break;
      }
      case 'td':
      case 'th':
        text(' ');
        break;
      default:
        break; // unknown tags simply disappear
    }
  }
  text(source.slice(last));

  return decodeEntities(out)
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Convert HTML inside a markdown document, leaving fenced code blocks alone so
 * example markup keeps rendering as written.
 */
export function normalizeHtmlInMarkdown(source: string): string {
  if (!looksLikeHtml(source)) return source;
  const parts = source.split(/(^```[\s\S]*?^```$|^~~~[\s\S]*?^~~~$)/gm);
  return parts
    .map((part) => (part.startsWith('```') || part.startsWith('~~~') ? part : looksLikeHtml(part) ? htmlToMarkdown(part) : part))
    .join('');
}

export interface AbstractPart {
  label: string;
  body: string;
}

/**
 * Split a structured abstract into its labelled parts, whether the labels
 * arrive as `<h4>Background</h4>` or as a run-in `BACKGROUND: `.
 */
export function structuredAbstractParts(abstract: string): AbstractPart[] {
  const text = abstract.trim();
  if (!text) return [];

  if (/<h[1-6]\b/i.test(text)) {
    const parts: AbstractPart[] = [];
    const re = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const label = htmlToMarkdown(match[1]).replace(/[:.]$/, '').trim();
      const body = htmlToMarkdown(match[2]).trim();
      if (label && body) parts.push({ label, body });
    }
    if (parts.length >= 2) return parts;
  }

  // Run-in labels: "BACKGROUND: … METHODS: …". The label must start the text
  // or follow a sentence break, otherwise the scan matches mid-word and
  // "BACKGROUND" degrades to "OUND".
  const labelRe = /(?:^|[.\s])([A-Z][A-Z&/-]{2,}(?:\s+[A-Z][A-Z&/-]+)*)\s*:\s+/g;
  const found: Array<{ label: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = labelRe.exec(text))) {
    found.push({ label: match[1].replace(/\s+/g, ' ').trim(), start: match.index, end: labelRe.lastIndex });
  }

  if (found.length >= 2) {
    const parts: AbstractPart[] = [];
    found.forEach((entry, index) => {
      const bodyEnd = index + 1 < found.length ? found[index + 1].start : text.length;
      const body = htmlToMarkdown(text.slice(entry.end, bodyEnd)).replace(/\s+/g, ' ').trim();
      if (!body) return;
      const label = entry.label;
      parts.push({ label: label.charAt(0) + label.slice(1).toLowerCase(), body });
    });
    if (parts.length >= 2) return parts;
  }

  return [];
}
