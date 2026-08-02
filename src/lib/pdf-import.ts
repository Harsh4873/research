import { buildFrontMatter, citationLine, mineAbbreviations, type PaperConversion, type PaperMeta } from './jats';
import {
  buildLines,
  buildMarkdown,
  findRunningLines,
  median,
  orderColumns,
  type PdfLine,
  type PdfPage,
  type PdfSpan,
} from './pdf-layout';

const MAX_PAGES = 80;

interface TextItemLike {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
  fontName?: string;
  hasEOL?: boolean;
}

/**
 * Loaded lazily so the PDF engine never ships in the initial bundle.
 *
 * The legacy build is deliberate: the modern one calls very new platform APIs
 * (`Math.sumPrecise`, `Map.getOrInsertComputed`) that most shipping browsers,
 * including current mobile Safari, do not have yet.
 */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function spanFromItem(item: TextItemLike, styles: Record<string, { fontFamily?: string }>, pageHeight: number): PdfSpan | null {
  const text = item.str ?? '';
  if (!text) return null;
  const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
  const scaleY = Math.hypot(transform[2], transform[3]) || item.height || 10;
  const fontName = item.fontName ?? '';
  const family = styles[fontName]?.fontFamily ?? fontName;
  return {
    text,
    x: transform[4] ?? 0,
    // PDF origin is bottom-left; flip so downward reading order sorts ascending.
    y: pageHeight - (transform[5] ?? 0),
    width: item.width ?? text.length * scaleY * 0.5,
    height: scaleY,
    fontName: family,
    bold: /bold|black|heavy|semibold/i.test(family),
    italic: /italic|oblique/i.test(family),
  };
}

export interface PdfExtractionProgress {
  page: number;
  pages: number;
}

export interface PdfImportOptions {
  onProgress?: (progress: PdfExtractionProgress) => void;
  signal?: AbortSignal;
  /** Title fallback when the document has no usable metadata. */
  fallbackTitle?: string;
}

const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"'<>,;]+)/;

/** Guess title and authors from the first page's largest text. */
export function guessFrontMatter(firstPageLines: PdfLine[], fallbackTitle: string): { title: string; authors: string[] } {
  const candidates = firstPageLines.slice(0, 18).filter((line) => line.text.trim().length > 6);
  if (candidates.length === 0) return { title: fallbackTitle, authors: [] };
  const maxSize = Math.max(...candidates.map((line) => line.size));
  const titleLines: string[] = [];
  let titleIndex = -1;
  for (let i = 0; i < candidates.length; i++) {
    const line = candidates[i];
    if (line.size < maxSize * 0.94) continue;
    if (/^(original|research|article|review|report|open access|received|accepted|published|doi|www\.)/i.test(line.text)) continue;
    titleLines.push(line.text.trim());
    titleIndex = i;
    // Titles can wrap onto the next line at the same size.
    const next = candidates[i + 1];
    if (next && next.size >= maxSize * 0.94 && !/^(abstract|introduction)/i.test(next.text)) {
      titleLines.push(next.text.trim());
      titleIndex = i + 1;
    }
    break;
  }
  const title = titleLines.join(' ').replace(/\s+/g, ' ').trim() || fallbackTitle;

  const authors: string[] = [];
  for (let i = titleIndex + 1; i < Math.min(candidates.length, titleIndex + 4); i++) {
    const text = candidates[i].text.trim();
    if (/^abstract/i.test(text)) break;
    const looksLikeAuthors =
      /,/.test(text) && /^[A-Z]/.test(text) && text.split(/,/).length >= 2 && text.length < 300 && !/\d{4}/.test(text);
    if (looksLikeAuthors) {
      for (const name of text.split(/,| and /i)) {
        const clean = name
          .replace(/[*†‡§¶#0-9]+/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean.length >= 3 && /^[A-Z]/.test(clean) && clean.split(/\s+/).length <= 5) authors.push(clean);
      }
      break;
    }
  }
  return { title, authors: authors.slice(0, 25) };
}

/** Extract study markdown from a PDF file entirely in the browser. */
export async function pdfToMarkdown(file: File | ArrayBuffer, options: PdfImportOptions = {}): Promise<PaperConversion> {
  const pdfjs = await loadPdfjs();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const doc = await task.promise;

  try {
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const pageLines: PdfLine[][] = [];
    let pageWidth = 612;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pageWidth = viewport.width;
      const content = await page.getTextContent();
      const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>;
      const spans: PdfSpan[] = [];
      for (const item of content.items as TextItemLike[]) {
        const span = spanFromItem(item, styles, viewport.height);
        if (span) spans.push(span);
      }
      const pdfPage: PdfPage = { page: pageNumber, width: viewport.width, height: viewport.height, spans };
      pageLines.push(orderColumns(buildLines(pdfPage), viewport.width));
      page.cleanup();
      options.onProgress?.({ page: pageNumber, pages: pageCount });
    }

    const running = findRunningLines(pageLines);
    const bodySize = median(pageLines.flat().map((line) => line.size)) || 10;
    const lines = pageLines.flat().filter((line) => {
      const key = line.text.replace(/\s+/g, ' ').trim().replace(/\d+/g, '#').toLowerCase();
      if (running.has(key)) return false;
      // Drop tiny print (line numbers, side notes) that survives as noise.
      return line.size >= bodySize * 0.62;
    });

    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
    };

    const fallbackTitle =
      options.fallbackTitle?.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded paper';
    const guessed = guessFrontMatter(pageLines[0] ?? [], fallbackTitle);
    const metaTitle = (info.Title ?? '').trim();
    // Exporters often leave the source filename in the Title field, which is
    // never what the reader means by the paper's title.
    const looksLikeFilename = /\.(pdf|html?|docx?|tex|odt|pages|rtf)$/i.test(metaTitle) || /^[\w-]+$/.test(metaTitle);
    const title =
      metaTitle && metaTitle.length > 8 && !looksLikeFilename && !/^(untitled|microsoft word|pdf)/i.test(metaTitle)
        ? metaTitle
        : guessed.title;

    const allText = lines.map((line) => line.text).join(' ');
    const doi = allText.match(DOI_IN_TEXT)?.[1]?.replace(/[.,;)]+$/, '');
    const pmid = allText.match(/\bPMID:?\s*(\d{4,9})\b/i)?.[1];

    const authors = (info.Author ?? '')
      .split(/[,;]/)
      .map((name) => name.trim())
      .filter((name) => name.length >= 3 && name.length < 60);

    const meta: PaperMeta = {
      title: title.replace(/\s+/g, ' ').trim(),
      authors: authors.length > 0 ? authors : guessed.authors,
      year: allText.match(/\b(19|20)\d{2}\b/)?.[0],
      doi,
      pmid,
      keywords: (info.Keywords ?? '')
        .split(/[,;]/)
        .map((word) => word.trim())
        .filter(Boolean)
        .slice(0, 12),
    };

    const built = buildMarkdown(lines);
    const header = [
      buildFrontMatter(meta, { source: `PDF import · ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}` }),
      `# ${meta.title}`,
      citationLine(meta),
    ];
    if (meta.keywords.length > 0) header.push(`_Keywords: ${meta.keywords.join(', ')}._`);
    if (doc.numPages > MAX_PAGES) {
      header.push(`_Only the first ${MAX_PAGES} pages of this ${doc.numPages}-page document were imported._`);
    }

    let body = built.markdown;
    const glossary = body.includes('## Glossary') ? '' : buildGlossary(body);
    if (glossary) {
      // A glossary belongs with the material, ahead of the reference list.
      const refsAt = body.indexOf('\n## References');
      body = refsAt >= 0 ? `${body.slice(0, refsAt)}\n\n${glossary}\n${body.slice(refsAt)}` : `${body}\n\n${glossary}`;
    }

    const markdown =
      [...header, body]
        .filter((part) => part && part.trim())
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n';

    return {
      meta,
      markdown,
      counts: {
        sections: built.counts.sections,
        tables: built.counts.tables,
        figures: built.counts.figures,
        equations: built.counts.equations,
        supplements: 0,
        references: 0,
      },
    };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

function buildGlossary(body: string): string {
  const prose = body
    .split('\n')
    .filter((line) => !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('```'))
    .join(' ');
  const abbreviations = mineAbbreviations(prose);
  if (abbreviations.length < 2) return '';
  return ['## Glossary', abbreviations.join('\n')].join('\n\n');
}
