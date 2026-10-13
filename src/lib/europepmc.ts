import { europePmcQuery, normalizePmcid, type PaperId } from './paper-id';
import { buildFrontMatter, citationLine, jatsToMarkdown, mineAbbreviations, type PaperConversion, type PaperMeta } from './jats';
import { htmlToMarkdown, structuredAbstractParts } from './html-text';
import { delay } from './delay';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export interface EpmcRecord {
  id?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  abstractText?: string;
  isOpenAccess?: string;
  inEPMC?: string;
  hasPDF?: string;
  hasSuppl?: string;
  keywordList?: { keyword?: string[] };
  journalInfo?: { journal?: { title?: string }; yearOfPublication?: number };
  fullTextUrlList?: { fullTextUrl?: Array<{ url?: string; documentStyle?: string; site?: string; availabilityCode?: string }> };
}

export class PaperLookupError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'PaperLookupError';
    this.hint = hint;
  }
}

/** 429 and 5xx are retried. A pause of 0 is for tests. */
export const fullTextRetry = { attempts: 3, pauseMs: 400 };

/**
 * The archive was busy or unreachable. This is not "the article has no full text".
 * Callers must not save an abstract in its place.
 */
export class ArchiveBusyError extends PaperLookupError {
  readonly status: number;
  constructor(status: number) {
    const detail = status > 0 ? `The archive replied ${status}.` : 'The archive could not be reached.';
    super(detail, 'The full text was not saved in its place. Try again in a moment.');
    this.name = 'ArchiveBusyError';
    this.status = status;
  }
}

function isAbort(error: unknown): boolean {
  return (error as Error)?.name === 'AbortError';
}

async function fetchResponse(url: string, signal: AbortSignal | undefined, headers?: HeadersInit): Promise<Response> {
  try {
    return await fetch(url, { signal, headers });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ArchiveBusyError(0);
  }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < fullTextRetry.attempts; attempt += 1) {
    if (attempt > 0) await delay(fullTextRetry.pauseMs * attempt, signal);
    let response: Response;
    try {
      response = await fetchResponse(url, signal, { Accept: 'application/json' });
    } catch (error) {
      if (isAbort(error)) throw error;
      if (error instanceof ArchiveBusyError && error.status > 0) lastStatus = error.status;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastStatus = response.status;
      continue;
    }
    if (!response.ok) throw new PaperLookupError(`The lookup service replied ${response.status}.`);
    try {
      return await response.json();
    } catch (error) {
      if (isAbort(error)) throw error;
      // A 200 that is not JSON is a bad reply, not a busy archive.
      throw new PaperLookupError('The lookup service returned an unreadable reply.');
    }
  }
  throw new ArchiveBusyError(lastStatus);
}

async function getText(url: string, signal?: AbortSignal): Promise<string | null> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < fullTextRetry.attempts; attempt += 1) {
    if (attempt > 0) await delay(fullTextRetry.pauseMs * attempt, signal);
    try {
      const response = await fetchResponse(url, signal);
      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        lastStatus = response.status;
        continue;
      }
      if (!response.ok) return null;
      return response.text();
    } catch (error) {
      if (isAbort(error)) throw error;
      lastStatus = 0;
    }
  }
  throw new ArchiveBusyError(lastStatus);
}

/** Look up article metadata in Europe PMC. */
export async function searchEuropePmc(id: PaperId, signal?: AbortSignal): Promise<EpmcRecord | null> {
  const url = `${EPMC}/search?query=${encodeURIComponent(europePmcQuery(id))}&resultType=core&format=json&pageSize=1`;
  const payload = (await getJson(url, signal)) as { resultList?: { result?: EpmcRecord[] } };
  return payload.resultList?.result?.[0] ?? null;
}

/** NCBI esummary, used when Europe PMC has no record for a PMID. */
async function ncbiSummary(pmid: string, signal?: AbortSignal): Promise<EpmcRecord | null> {
  const url = `${EUTILS}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`;
  const payload = (await getJson(url, signal).catch((error) => {
    if (isAbort(error) || error instanceof ArchiveBusyError) throw error;
    return null;
  })) as { result?: Record<string, unknown> } | null;
  const entry = payload?.result?.[pmid] as
    | { title?: string; fulljournalname?: string; source?: string; pubdate?: string; authors?: Array<{ name?: string }>; elocationid?: string; articleids?: Array<{ idtype?: string; value?: string }> }
    | undefined;
  if (!entry?.title) return null;
  const doi = entry.articleids?.find((a) => a.idtype === 'doi')?.value;
  const pmcid = entry.articleids?.find((a) => a.idtype === 'pmcid')?.value;
  return {
    pmid,
    doi,
    pmcid: pmcid ? normalizePmcid(pmcid) : undefined,
    title: entry.title.replace(/\.$/, ''),
    authorString: (entry.authors ?? []).map((a) => a.name).filter(Boolean).join(', '),
    journalTitle: entry.fulljournalname ?? entry.source,
    pubYear: (entry.pubdate ?? '').match(/\d{4}/)?.[0],
  };
}

/** Fetch NCBI's abstract text for records Europe PMC only knows by title. */
async function ncbiAbstract(pmid: string, signal?: AbortSignal): Promise<string | undefined> {
  const url = `${EUTILS}/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&rettype=abstract&retmode=text`;
  let text: string | null;
  try {
    text = await getText(url, signal);
  } catch (error) {
    if (isAbort(error) || error instanceof ArchiveBusyError) throw error;
    return undefined;
  }
  if (!text) return undefined;
  // The plain-text record puts the abstract between the author list and the
  // trailing metadata lines; keep the longest paragraph as a safe heuristic.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 180 && !/^(Author information|DOI|PMID|PMCID|Conflict of interest)/i.test(part));
  const best = paragraphs.sort((a, b) => b.length - a.length)[0];
  return best;
}

/** True when the document carries an article body, not just front matter. */
export function hasArticleBody(xml: string): boolean {
  const body = xml.search(/<body[\s>]/);
  if (body === -1) return false;
  // An empty <body/> or one holding only whitespace is not full text.
  return /<body[\s>][\s\S]{200,}?<\/body>/.test(xml);
}

function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

/** Open/free PDF links Europe PMC already listed, plus the PMC renderer when we have an id. */
export function openAccessPdfUrls(record: EpmcRecord, pmcid?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw?: string) => {
    if (!raw) return;
    const url = toHttps(raw.trim());
    if (!/^https:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  for (const item of record.fullTextUrlList?.fullTextUrl ?? []) {
    const style = (item.documentStyle ?? '').toLowerCase();
    const code = (item.availabilityCode ?? '').toUpperCase();
    if (style !== 'pdf') continue;
    if (code !== 'OA' && code !== 'F') continue;
    add(item.url);
  }
  if (pmcid && (record.hasPDF === 'Y' || out.length > 0)) {
    add(`https://europepmc.org/articles/${normalizePmcid(pmcid)}?pdf=render`);
  }
  return out;
}

function headBytes(buf: ArrayBuffer, n = 8): string {
  return String.fromCharCode(...new Uint8Array(buf.slice(0, n)));
}

function looksLikePdf(buf: ArrayBuffer): boolean {
  return headBytes(buf, 5).startsWith('%PDF');
}

/** A download failed (network, 429, or 5xx). A missing or non-PDF response is not this error. */
export class PdfDownloadError extends Error {
  constructor() {
    super('The PDF could not be downloaded.');
    this.name = 'PdfDownloadError';
  }
}

/**
 * Fetch a PDF only when the response is actually a PDF, not an HTML wall.
 * `strict` throws on network errors, 429, and 5xx so the reader can tell
 * "download failed" from "no file". Lookup keeps the lenient path.
 */
async function fetchPdfBuffer(url: string, signal?: AbortSignal, strict = false): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url, { signal, redirect: 'follow' });
    if (response.status === 404) return null;
    if (!response.ok) {
      if (strict && (response.status === 429 || response.status >= 500)) throw new PdfDownloadError();
      return null;
    }
    const buf = await response.arrayBuffer();
    return looksLikePdf(buf) ? buf : null;
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof PdfDownloadError) throw error;
    if (strict) throw new PdfDownloadError();
    return null;
  }
}

function jatsIsFullText(converted: PaperConversion | null, xml: string): converted is PaperConversion {
  if (!converted) return false;
  // Letters and some articles ship a real <body> with no titled <sec>.
  return converted.counts.sections > 0 || hasArticleBody(xml);
}

export interface FullTextSource {
  xml: string;
  /** Which archive served it, for the provenance line. */
  from: 'europepmc' | 'pmc';
}

export async function fetchFullTextXml(pmcid: string, signal?: AbortSignal): Promise<string | null> {
  const xml = await getText(`${EPMC}/${normalizePmcid(pmcid)}/fullTextXML`, signal);
  if (!xml || !xml.includes('<article')) return null;
  return xml;
}

/**
 * NCBI's copy of the same article.
 *
 * Europe PMC does not serve `fullTextXML` for author manuscripts (the NIHMS
 * and EMS deposits), and those are a large slice of clinical literature: for
 * them Europe PMC answers with nothing while NCBI returns the complete JATS.
 * Asking both is the difference between an abstract and the paper.
 */
export async function fetchPmcFullTextXml(pmcid: string, signal?: AbortSignal): Promise<string | null> {
  const id = normalizePmcid(pmcid).replace(/^PMC/i, '');
  if (!id) return null;
  const xml = await getText(`${EUTILS}/efetch.fcgi?db=pmc&id=${encodeURIComponent(id)}&retmode=xml`, signal);
  if (!xml || !xml.includes('<article')) return null;
  return xml;
}

async function loadXml(
  load: () => Promise<string | null>,
): Promise<{ xml: string | null; busy: boolean; status: number }> {
  try {
    return { xml: await load(), busy: false, status: 0 };
  } catch (error) {
    if (isAbort(error)) throw error;
    // Busy, 5xx, and network failures are not "this archive has no article".
    const status = error instanceof ArchiveBusyError ? error.status : 0;
    return { xml: null, busy: true, status };
  }
}

function busyStatus(parts: Array<{ busy: boolean; status: number }>): number {
  return parts.find((part) => part.busy && part.status > 0)?.status ?? 0;
}

/** The best full text either archive has for this article, or null. Throws when an archive was busy. */
export async function fetchAnyFullTextXml(pmcid: string, signal?: AbortSignal): Promise<FullTextSource | null> {
  const epmc = await loadXml(() => fetchFullTextXml(pmcid, signal));
  if (epmc.xml && hasArticleBody(epmc.xml)) return { xml: epmc.xml, from: 'europepmc' };
  const ncbi = await loadXml(() => fetchPmcFullTextXml(pmcid, signal));
  if (ncbi.xml && hasArticleBody(ncbi.xml)) return { xml: ncbi.xml, from: 'pmc' };
  if (epmc.busy || ncbi.busy) throw new ArchiveBusyError(busyStatus([epmc, ncbi]));
  // Neither carried a body; the Europe PMC copy is still the better metadata.
  if (epmc.xml) return { xml: epmc.xml, from: 'europepmc' };
  return null;
}

function metaFromRecord(record: EpmcRecord): PaperMeta {
  const authors = (record.authorString ?? '')
    .split(/,\s*/)
    .map((name) => name.replace(/\.$/, '').trim())
    .filter(Boolean);
  return {
    title: (record.title ?? 'Untitled paper').replace(/\.$/, ''),
    authors,
    journal: record.journalTitle ?? record.journalInfo?.journal?.title,
    year: record.pubYear ?? (record.journalInfo?.yearOfPublication?.toString() || undefined),
    doi: record.doi,
    pmid: record.pmid,
    pmcid: record.pmcid ? normalizePmcid(record.pmcid) : undefined,
    keywords: record.keywordList?.keyword ?? [],
  };
}

/** Build abstract-only markdown when no open-access full text exists. */
export function abstractOnlyMarkdown(meta: PaperMeta, abstractText: string | undefined, note: string): PaperConversion {
  const out: string[] = [
    buildFrontMatter(meta, { source: note }),
    `# ${meta.title}`,
    citationLine(meta),
  ];
  if (meta.keywords.length > 0) out.push(`_This paper is indexed under ${meta.keywords.join(', ')}._`);

  const raw = (abstractText ?? '').trim();
  // PubMed structured abstracts arrive as HTML (`<h4>Background</h4>…`).
  const clean = raw ? htmlToMarkdown(raw).replace(/\s+/g, ' ').trim() : '';
  if (clean) {
    out.push('## Abstract');
    const parts = structuredAbstractParts(raw);
    if (parts.length >= 2) {
      for (const part of parts) out.push(`- **${part.label}**: ${part.body.replace(/\s+/g, ' ')}`);
    } else {
      out.push(clean);
    }

    const abbreviations = mineAbbreviations(clean);
    if (abbreviations.length >= 2) {
      out.push('## Glossary');
      out.push(abbreviations.join('\n'));
    }
  }

  // A blockquote rather than a section: an availability notice is not study
  // material, and a heading here would become a flashcard.
  out.push(
    [
      '>',
      clean
        ? 'Only the abstract is machine-readable for this article, so this set covers the abstract and metadata.'
        : 'No abstract is available for this record, so this set covers the metadata only.',
      meta.doi ? `Full article: https://doi.org/${meta.doi}` : '',
      meta.pmid ? `PubMed: https://pubmed.ncbi.nlm.nih.gov/${meta.pmid}/` : '',
      'To study the whole paper, download the publisher PDF and drop it on Papers.',
    ]
      .filter(Boolean)
      .join(' '),
  );

  return {
    meta,
    markdown: out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
    counts: { sections: clean ? 1 : 0, tables: 0, figures: 0, equations: 0, supplements: 0, references: 0 },
  };
}

export interface LookupResult extends PaperConversion {
  /** Whether the machine-readable full text was available. */
  fullText: boolean;
  openAccessNote: string;
  /** PDF bytes when this import already downloaded one. Kept so the reader can show the file. */
  pdf?: ArrayBuffer;
}

/**
 * Download the open-access PDF for a PMC article, when the browser is allowed to read it.
 * Returns null for paywalled files, HTML walls, and network failures.
 */
export async function fetchOpenAccessPdf(pmcid: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const id = normalizePmcid(pmcid);
  const urls = [
    `https://europepmc.org/articles/${id}?pdf=render`,
    `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${id}&blobtype=pdf`,
  ];
  let failed = false;
  for (const url of urls) {
    try {
      const buf = await fetchPdfBuffer(url, signal, true);
      if (buf) return buf;
    } catch (error) {
      if (isAbort(error)) throw error;
      failed = true;
    }
  }
  if (failed) throw new PdfDownloadError();
  return null;
}

/** Resolve an identifier all the way to study markdown. */
export async function lookupPaper(id: PaperId, signal?: AbortSignal): Promise<LookupResult> {
  let record: EpmcRecord | null = null;
  let lookupError: ArchiveBusyError | null = null;
  try {
    record = await searchEuropePmc(id, signal);
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof ArchiveBusyError) lookupError = error;
    record = null;
  }

  if (!record && id.kind === 'pmid') record = await ncbiSummary(id.value, signal);

  if (!record) {
    if (lookupError) throw lookupError;
    throw new PaperLookupError(
      'No article matched that identifier.',
      'Check the PMID, PMCID, or DOI, or upload the PDF instead.',
    );
  }

  const meta = metaFromRecord(record);
  if (id.kind === 'pmcid' && !meta.pmcid) meta.pmcid = normalizePmcid(id.value);
  if (id.kind === 'doi' && !meta.doi) meta.doi = id.value;
  if (id.kind === 'pmid' && !meta.pmid) meta.pmid = id.value;

  const pmcid = meta.pmcid;
  // Try whenever the article has a PMC identifier at all. `inEPMC: N` is
  // exactly the author-manuscript case, where Europe PMC holds no full text
  // but NCBI does, so gating on it was throwing away the papers most likely
  // to be recoverable.
  let archiveError: ArchiveBusyError | null = null;
  if (pmcid) {
    let source: FullTextSource | null = null;
    try {
      source = await fetchAnyFullTextXml(pmcid, signal);
    } catch (error) {
      if (isAbort(error)) throw error;
      if (error instanceof ArchiveBusyError) archiveError = error;
      else throw error;
    }
    if (source) {
      const archive = source.from === 'pmc' ? 'PubMed Central' : 'Europe PMC';
      const converted = jatsToMarkdown(source.xml, {
        pmid: meta.pmid,
        pmcid,
        doi: meta.doi,
        sourceNote: `${archive} full text (JATS) · ${pmcid}`,
      });
      if (jatsIsFullText(converted, source.xml)) {
        // Prefer search metadata for fields the XML leaves blank.
        converted.meta = {
          ...converted.meta,
          journal: converted.meta.journal ?? meta.journal,
          year: converted.meta.year ?? meta.year,
          authors: converted.meta.authors.length > 0 ? converted.meta.authors : meta.authors,
          keywords: converted.meta.keywords.length > 0 ? converted.meta.keywords : meta.keywords,
        };
        return {
          ...converted,
          fullText: true,
          openAccessNote:
            source.from === 'pmc'
              ? 'Full text from PubMed Central (author manuscript or open access).'
              : 'Full text from Europe PMC (open access).',
        };
      }
    }
  }

  const pdfUrls = openAccessPdfUrls(record, pmcid);
  let pdfAttempted = false;
  for (const url of pdfUrls) {
    pdfAttempted = true;
    const buf = await fetchPdfBuffer(url, signal);
    if (!buf) continue;
    try {
      const { pdfToMarkdown } = await import('./pdf-import');
      const converted = await pdfToMarkdown(buf, {
        fallbackTitle: meta.title,
        signal,
        sourceNote: meta.pmid ? `Open access PDF · PMID ${meta.pmid}` : 'Open access PDF',
      });
      const substantial = converted.counts.sections > 0 || converted.markdown.length > 1500;
      if (!substantial) continue;
      converted.meta = {
        ...converted.meta,
        title: meta.title || converted.meta.title,
        journal: converted.meta.journal ?? meta.journal,
        year: converted.meta.year ?? meta.year,
        doi: converted.meta.doi ?? meta.doi,
        pmid: converted.meta.pmid ?? meta.pmid,
        pmcid: converted.meta.pmcid ?? meta.pmcid,
        authors: meta.authors.length > 0 ? meta.authors : converted.meta.authors,
        keywords: converted.meta.keywords.length > 0 ? converted.meta.keywords : meta.keywords,
      };
      return {
        ...converted,
        fullText: true,
        openAccessNote: 'Full text from the open-access publisher PDF.',
        pdf: buf,
      };
    } catch (error) {
      if (isAbort(error)) throw error;
      /* try the next URL */
    }
  }

  if (archiveError) throw archiveError;

  let abstractText = record.abstractText;
  if (!abstractText && meta.pmid) abstractText = await ncbiAbstract(meta.pmid, signal);

  const conversion = abstractOnlyMarkdown(
    meta,
    abstractText,
    meta.pmid ? `PubMed abstract · PMID ${meta.pmid}` : 'PubMed abstract',
  );
  const note = pdfAttempted
    ? 'The publisher lists an open-access PDF, but it is not readable from this app (browser wall). Only the abstract was imported. Open the DOI in a browser and drop the PDF on Papers for the full paper.'
    : pmcid
      ? 'Only the abstract is machine-readable for this article.'
      : 'This article is not in PubMed Central, so only the abstract is available.';
  return {
    ...conversion,
    fullText: false,
    openAccessNote: note,
  };
}
