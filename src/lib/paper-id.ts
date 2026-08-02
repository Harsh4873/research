export type PaperIdKind = 'pmid' | 'pmcid' | 'doi';

export interface PaperId {
  kind: PaperIdKind;
  value: string;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/i;

/**
 * Accepts what a person actually pastes: a bare PMID, a PMCID, a DOI, or a
 * PubMed / PMC / doi.org URL.
 */
export function parsePaperId(input: string): PaperId | null {
  const raw = input.trim();
  if (!raw) return null;

  // PMC identifiers, with or without the prefix, including PMC URLs.
  const pmcUrl = raw.match(/(?:pmc\/articles\/|europepmc\.org\/article\/pmc\/)\s*(PMC\d+|\d+)/i);
  if (pmcUrl) return { kind: 'pmcid', value: normalizePmcid(pmcUrl[1]) };
  if (/^pmc\s*\d+$/i.test(raw)) return { kind: 'pmcid', value: normalizePmcid(raw) };

  // PubMed URLs and "pmid: 123" forms.
  const pubmedUrl = raw.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{4,9})/i);
  if (pubmedUrl) return { kind: 'pmid', value: pubmedUrl[1] };
  const pmidLabelled = raw.match(/\bpmid\s*[:#]?\s*(\d{4,9})\b/i);
  if (pmidLabelled) return { kind: 'pmid', value: pmidLabelled[1] };
  const europePmcMed = raw.match(/europepmc\.org\/(?:article\/med\/|abstract\/MED\/)(\d{4,9})/i);
  if (europePmcMed) return { kind: 'pmid', value: europePmcMed[1] };

  // DOIs, including doi.org URLs.
  const doi = raw.match(DOI_RE);
  if (doi) return { kind: 'doi', value: doi[1].replace(/[.,;)]+$/, '') };

  // A bare number is a PMID. PubMed numbering starts at 1, so any 1–9 digit
  // number is a candidate; longer strings are not PMIDs.
  if (/^\d{1,9}$/.test(raw)) return { kind: 'pmid', value: raw };

  return null;
}

/**
 * Pull every identifier out of free text — a reference list, an EndNote
 * export, a pasted column of numbers.
 *
 * Bare numbers are matched far more strictly here than in `parsePaperId`:
 * reference lists are full of years, volumes, and page numbers, so only
 * 7–8 digit numbers (the modern PMID range) count when there is no label.
 */
export function parsePaperIds(text: string): PaperId[] {
  const found = new Map<string, PaperId>();
  const add = (id: PaperId) => {
    const key = `${id.kind}:${id.value.toLowerCase()}`;
    if (!found.has(key)) found.set(key, id);
  };

  let rest = text;
  const consume = (re: RegExp, handle: (match: RegExpExecArray) => void) => {
    rest = rest.replace(re, (...args) => {
      const match = args.slice(0, -2) as unknown as RegExpExecArray;
      handle(match);
      return ' '.repeat(String(match[0]).length);
    });
  };

  // Most specific first; each match is blanked so later passes cannot
  // rediscover its digits as a PMID.
  consume(/\bPMC\s?(\d+)\b/gi, (m) => add({ kind: 'pmcid', value: normalizePmcid(m[1]) }));
  consume(/\b(10\.\d{4,9}\/[^\s,;"'<>()[\]]+)/g, (m) =>
    add({ kind: 'doi', value: m[1].replace(/[.,;)]+$/, '') }),
  );
  consume(/\bPMID\s*[:#]?\s*(\d{1,9})\b/gi, (m) => add({ kind: 'pmid', value: m[1] }));
  consume(/\b(\d{7,8})\b/g, (m) => add({ kind: 'pmid', value: m[1] }));

  return [...found.values()];
}

export function normalizePmcid(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? `PMC${digits}` : value.toUpperCase();
}

/** The Europe PMC search query for a parsed identifier. */
export function europePmcQuery(id: PaperId): string {
  switch (id.kind) {
    case 'pmid':
      return `EXT_ID:${id.value} AND SRC:MED`;
    case 'pmcid':
      return `PMCID:${normalizePmcid(id.value)}`;
    case 'doi':
      return `DOI:"${id.value}"`;
  }
}

export function describePaperId(id: PaperId): string {
  switch (id.kind) {
    case 'pmid':
      return `PMID ${id.value}`;
    case 'pmcid':
      return normalizePmcid(id.value);
    case 'doi':
      return `DOI ${id.value}`;
  }
}
