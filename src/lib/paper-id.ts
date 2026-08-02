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
