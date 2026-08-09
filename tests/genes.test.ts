import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  GeneDataError,
  parseSelection,
  siblingUrl,
  validateCatalog,
  type Gene,
  type SelectionData,
} from '../src/lib/gene-catalog';
import { findGene, searchGenes } from '../src/lib/gene-search';
import { geneQuery } from '../src/lib/gene-literature';
import {
  DEFAULT_WEIGHTS,
  SIGNALS,
  annotationConfidence,
  decodeWeights,
  encodeWeights,
  rankGenes,
  type Weights,
} from '../src/lib/gene-priority';

function gene(over: Partial<Gene> & { orf: string }): Gene {
  return {
    gene: null,
    start: 1,
    end: 900,
    strand: '+',
    length: 300,
    annotation: 'Conserved hypothetical protein',
    category: 'hypothetical',
    ...over,
    name: over.gene ?? over.orf,
  };
}

const CATALOG: Gene[] = [
  gene({ orf: 'Rv0290', gene: 'eccD3', annotation: 'ESX conserved component EccD3, ESX-3 type VII secretion system', category: 'cell-wall' }),
  gene({ orf: 'Rv0205', annotation: 'Possible conserved transmembrane protein', category: 'cell-wall' }),
  gene({ orf: 'Rv2583c', gene: 'relA', annotation: 'GTP pyrophosphokinase RelA', category: 'metabolism' }),
  gene({ orf: 'Rv0648', annotation: 'Probable alpha-mannosidase', category: 'metabolism' }),
  gene({ orf: 'Rv1908c', gene: 'katG', annotation: 'Catalase-peroxidase-peroxynitritase T KatG', category: 'virulence' }),
  gene({ orf: 'Rv3910', annotation: 'Conserved hypothetical protein', category: 'hypothetical' }),
];

describe('sibling data paths', () => {
  it('resolves the genes site beside this app, not inside it', () => {
    expect(siblingUrl('genes.json', '/research/')).toBe('/genes/data/genes.json');
    expect(siblingUrl('selection.enc', '/research/')).toBe('/genes/data/selection.enc');
  });

  it('still resolves when the app is served from the root', () => {
    expect(siblingUrl('genes.json', '/')).toBe('/genes/data/genes.json');
  });
});

describe('catalog validation', () => {
  it('expands the compact records the sibling site publishes', () => {
    const catalog = validateCatalog({
      organism: 'Mycobacterium tuberculosis H37Rv',
      genes: [{ o: 'Rv0290', g: 'eccD3', s: 359045, e: 360426, d: '+', l: 460, a: 'ESX conserved component', c: 'cell-wall' }],
    });
    expect(catalog.count).toBe(1);
    expect(catalog.byOrf.get('Rv0290')).toMatchObject({ name: 'eccD3', strand: '+', category: 'cell-wall' });
  });

  it('names an unnamed gene by its locus and keeps an unknown class unclassified', () => {
    const catalog = validateCatalog({ genes: [{ o: 'Rv0205', g: null, a: 'Possible protein', c: 'not-a-class' }] });
    expect(catalog.byOrf.get('Rv0205')).toMatchObject({ name: 'Rv0205', category: 'unclassified' });
  });

  it('rejects a payload with no usable genes', () => {
    expect(() => validateCatalog({ genes: [] })).toThrow(GeneDataError);
    expect(() => validateCatalog({ genes: [{ nope: 1 }] })).toThrow(GeneDataError);
    expect(() => validateCatalog('nonsense')).toThrow(GeneDataError);
  });

  it('labels every category it accepts', () => {
    for (const gene of validateCatalog({ genes: [{ o: 'Rv1', c: 'pe-ppe' }] }).genes) {
      expect(CATEGORY_LABEL[gene.category]).toBeTruthy();
    }
  });
});

describe('selection parsing', () => {
  const payload = {
    metadata: { cohorts: { db: 178, ndb: 744, total: 922 } },
    genes: [{ o: 'Rv0290', dpd: 0.9684, wd: 2.245, wn: 0.64, al: 23, dl: 2.0324, pll: 3.9106, x2: 3.4968 }],
  };

  it('keeps the signals the ranking needs', () => {
    const data = parseSelection(payload);
    expect(data.cohorts).toEqual({ db: 178, ndb: 744, total: 922 });
    expect(data.byOrf.get('Rv0290')).toMatchObject({ dpd: 0.9684, omegaDb: 2.245, alleles: 23, signed2LL: 3.9106 });
  });

  it('reads a missing measurement as absent, not as zero', () => {
    const data = parseSelection({ genes: [{ o: 'Rv1', dpd: null, pll: null }] });
    expect(data.byOrf.get('Rv1')).toMatchObject({ dpd: null, signed2LL: null, alleles: null });
  });

  it('rejects a payload that is not the selection dataset', () => {
    expect(() => parseSelection({ genes: [] })).toThrow(GeneDataError);
    expect(() => parseSelection({ nope: true })).toThrow(GeneDataError);
  });
});

describe('gene search', () => {
  it('finds a gene by its symbol', () => {
    const hits = searchGenes(CATALOG, 'eccD3');
    expect(hits[0].gene.orf).toBe('Rv0290');
    expect(hits[0].matched).toBe('symbol');
  });

  it('finds a gene by its locus, however it is typed', () => {
    for (const query of ['Rv0205', 'rv0205', 'RV 0205']) {
      expect(searchGenes(CATALOG, query)[0].gene.orf).toBe('Rv0205');
    }
  });

  it('finds genes by what they do, requiring every word', () => {
    expect(searchGenes(CATALOG, 'mannosidase')[0].gene.orf).toBe('Rv0648');
    expect(searchGenes(CATALOG, 'type VII secretion')[0].gene.orf).toBe('Rv0290');
    expect(searchGenes(CATALOG, 'secretion mannosidase')).toHaveLength(0);
  });

  it('ranks an exact identifier above a gene that merely mentions it', () => {
    const catalog = [...CATALOG, gene({ orf: 'Rv9999', annotation: 'Interacts with eccD3 and katG' })];
    expect(searchGenes(catalog, 'eccD3')[0].gene.orf).toBe('Rv0290');
    expect(searchGenes(catalog, 'katG')[0].gene.orf).toBe('Rv1908c');
  });

  it('resolves a deep link only on a confident match', () => {
    expect(findGene(CATALOG, 'Rv0290')?.gene).toBe('eccD3');
    expect(findGene(CATALOG, 'katG')?.orf).toBe('Rv1908c');
    expect(findGene(CATALOG, 'protein')).toBeNull();
    expect(findGene(CATALOG, '')).toBeNull();
  });
});

describe('literature queries', () => {
  it('pairs the identifiers with the organism, and scopes counts to title and abstract', () => {
    const eccD3 = CATALOG[0];
    expect(geneQuery(eccD3)).toBe('(TITLE_ABS:"Rv0290" OR TITLE_ABS:"eccD3") AND (tuberculosis OR mycobacterium)');
    expect(geneQuery(eccD3, 'full-text')).toBe('("Rv0290" OR "eccD3") AND (tuberculosis OR mycobacterium)');
  });

  it('uses the locus alone when the gene has no symbol', () => {
    expect(geneQuery(CATALOG[1])).toBe('(TITLE_ABS:"Rv0205") AND (tuberculosis OR mycobacterium)');
  });
});

describe('annotation confidence', () => {
  it('scores a characterised gene above a hedged one, and a hedge above a blank', () => {
    const named = annotationConfidence(CATALOG[4]); // katG, catalase-peroxidase
    const probable = annotationConfidence(CATALOG[3]); // Probable alpha-mannosidase
    const possible = annotationConfidence(CATALOG[1]); // Possible transmembrane protein
    const hypothetical = annotationConfidence(CATALOG[5]);
    expect(named).toBeGreaterThan(probable);
    expect(probable).toBeGreaterThan(possible);
    expect(possible).toBeGreaterThan(hypothetical);
  });
});

describe('GenePrioritize', () => {
  const selection: SelectionData = {
    cohorts: { db: 178, ndb: 744, total: 922 },
    byOrf: new Map([
      ['Rv0290', { orf: 'Rv0290', dpd: 0.9684, omegaDb: 2.245, omegaNdb: 0.64, alleles: 23, deltaLog2: 2.03, signed2LL: 3.91, chiSq: 3.5 }],
      ['Rv3910', { orf: 'Rv3910', dpd: 0.5, omegaDb: 0.4, omegaNdb: 0.42, alleles: 2, deltaLog2: 0.01, signed2LL: 0.1, chiSq: 0.1 }],
    ]),
  };

  it('puts a strongly selected, well-observed gene above a flat one', () => {
    const ranked = rankGenes({ genes: CATALOG, selection, weights: DEFAULT_WEIGHTS });
    const order = ranked.map((r) => r.gene.orf);
    expect(order.indexOf('Rv0290')).toBeLessThan(order.indexOf('Rv3910'));
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
  });

  it('records what each signal contributed, and what was missing', () => {
    const ranked = rankGenes({ genes: CATALOG, selection, weights: DEFAULT_WEIGHTS });
    const eccD3 = ranked.find((r) => r.gene.orf === 'Rv0290')!;
    expect(eccD3.signals.map((s) => s.id)).toEqual([...SIGNALS]);
    expect(eccD3.signals.find((s) => s.id === 'omega')?.value).toBeGreaterThan(0.5);
    // No literature was supplied, so that signal is absent rather than zero.
    expect(eccD3.missing).toContain('literature');
    expect(eccD3.signals.find((s) => s.id === 'literature')?.value).toBeNull();
  });

  it('does not punish a gene for a signal nobody measured', () => {
    const withoutSelection = rankGenes({ genes: [CATALOG[0]], selection: null, weights: DEFAULT_WEIGHTS });
    // Only annotation and pathway have data, so the score is their weighted mean.
    expect(withoutSelection[0].score).toBeGreaterThan(0);
    expect(withoutSelection[0].missing).toEqual(expect.arrayContaining(['omega', 'significance', 'mutations']));
  });

  it('follows the weights: zeroing a signal removes its influence', () => {
    const onlyLiterature: Weights = { omega: 0, significance: 0, mutations: 0, cohort: 0, literature: 1, pathway: 0, annotation: 0 };
    const literature = new Map([['Rv3910', 400], ['Rv0290', 4]]);
    const ranked = rankGenes({ genes: CATALOG, selection, literature, weights: onlyLiterature });
    expect(ranked[0].gene.orf).toBe('Rv3910');
    expect(ranked[0].literature).toBe(400);
  });

  it('lets the pathway weight lift the classes you choose', () => {
    const weights: Weights = { ...DEFAULT_WEIGHTS, omega: 0, significance: 0, mutations: 0, cohort: 0, literature: 0, annotation: 0, pathway: 1 };
    const ranked = rankGenes({ genes: CATALOG, selection: null, weights, pathways: ['metabolism'] });
    expect(['Rv2583c', 'Rv0648']).toContain(ranked[0].gene.orf);
  });

  it('treats an all-zero weighting as no opinion rather than a crash', () => {
    const zero = Object.fromEntries(SIGNALS.map((id) => [id, 0])) as Weights;
    const ranked = rankGenes({ genes: CATALOG, selection, weights: zero });
    expect(ranked).toHaveLength(CATALOG.length);
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  it('round-trips weights through the URL', () => {
    const weights: Weights = { ...DEFAULT_WEIGHTS, omega: 2, literature: 0 };
    expect(decodeWeights(encodeWeights(weights))).toEqual(weights);
    expect(decodeWeights(undefined)).toEqual(DEFAULT_WEIGHTS);
    expect(decodeWeights('9,9,9,9,9,9,9').omega).toBe(3);
    expect(decodeWeights('-4,x').omega).toBe(0);
  });
});
