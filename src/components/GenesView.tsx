import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Dna,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  Quote,
  Search,
  Sliders,
  Unlock,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABEL,
  loadGeneCatalog,
  loadSelectionData,
  unlockedSelectionData,
  type Gene,
  type GeneCatalog,
  type SelectionData,
} from '../lib/gene-catalog';
import { LockedError, passphraseStore } from '../lib/lockbox';
import { findGene, searchGenes } from '../lib/gene-search';
import {
  DEFAULT_PATHWAYS,
  DEFAULT_WEIGHTS,
  SIGNALS,
  SIGNAL_META,
  decodeWeights,
  encodeWeights,
  rankGenes,
  type RankedGene,
  type SignalId,
  type Weights,
} from '../lib/gene-priority';
import { geneLiterature, literatureCounts, type GeneLiterature, type LiteratureItem } from '../lib/gene-literature';
import type { GeneCategory } from '../lib/gene-catalog';

const SHORTLIST = 40;
const PAGE = 25;

interface GenesViewProps {
  params: Record<string, string>;
  onNavigate: (query: Record<string, string>) => void;
  /** Hand a paper to Review, which fetches and saves it. */
  onImportPaper: (identifier: string) => void;
}

const fmt = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);

const EXTERNAL = (gene: Gene) => [
  { label: 'Mycobrowser', href: `https://mycobrowser.epfl.ch/genes/${gene.orf}` },
  { label: 'NCBI', href: `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(gene.orf)}` },
  { label: 'UniProt', href: `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(`${gene.orf} AND organism_id:83332`)}` },
  { label: 'STRING', href: `https://string-db.org/cgi/network?identifiers=${encodeURIComponent(gene.orf)}&species=83332` },
  { label: 'KEGG', href: `https://www.genome.jp/dbget-bin/www_bget?mtu:${gene.orf}` },
  { label: 'Selection Lab', href: `/genes/#/selection?gene=${gene.orf}` },
];

export function GenesView({ params, onNavigate, onImportPaper }: GenesViewProps) {
  const [catalog, setCatalog] = useState<GeneCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionData | null>(unlockedSelectionData);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [query, setQuery] = useState('');

  const weights = useMemo(() => decodeWeights(params.w), [params.w]);
  const pathways = useMemo<GeneCategory[]>(
    () => (params.path ? (params.path.split(',').filter(Boolean) as GeneCategory[]) : DEFAULT_PATHWAYS),
    [params.path],
  );

  useEffect(() => {
    let alive = true;
    loadGeneCatalog()
      .then((value) => alive && setCatalog(value))
      .catch((error) => alive && setCatalogError((error as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  const tryUnlock = (passphrase: string, remember: boolean) => {
    const trimmed = passphrase.trim();
    if (!trimmed || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    loadSelectionData(trimmed)
      .then((data) => {
        setSelection(data);
        if (remember) passphraseStore.write(trimmed);
      })
      .catch((error) => {
        if (error instanceof LockedError) passphraseStore.clear();
        setUnlockError((error as Error).message);
      })
      .finally(() => setUnlocking(false));
  };

  // A passphrase already used in this tab opens the signals without asking.
  useEffect(() => {
    if (selection) return;
    const remembered = passphraseStore.read();
    if (remembered) tryUnlock(remembered, false);
  }, []);

  const setParams = (patch: Record<string, string | null>) => {
    const next: Record<string, string> = { ...params };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') delete next[key];
      else next[key] = value;
    }
    onNavigate(next);
  };

  const focused = catalog && params.gene ? catalog.byOrf.get(params.gene) ?? findGene(catalog.genes, params.gene) : null;
  const hits = useMemo(() => (catalog ? searchGenes(catalog.genes, query, 12) : []), [catalog, query]);

  if (catalogError) {
    return (
      <div className="genes fade-in">
        <div className="review-error" role="alert">
          <AlertTriangle size={16} aria-hidden /> {catalogError} The Genes tab reads the H37Rv catalog published by the
          MtbScope site at <code>/genes/</code>.
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="genes fade-in">
        <div className="review-status" role="status">
          <Loader2 size={16} aria-hidden className="spin" /> Loading the H37Rv catalog…
        </div>
      </div>
    );
  }

  return (
    <div className="genes fade-in">
      <section className="review-hero">
        <h1 className="review-title">
          <Dna size={26} aria-hidden /> Genes
        </h1>
        <p className="review-sub">
          Look up any of the {catalog.count.toLocaleString()} H37Rv genes and read what has been published about it — then
          rank the whole genome by what makes a gene worth your time.
        </p>
      </section>

      <section className="review-import" aria-label="Find a gene">
        <div className="review-search">
          <div className="review-search-field">
            <Search size={17} aria-hidden />
            <input
              className="input review-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="eccD3, Rv0205, alpha-mannosidase, ESX-3 secretion…"
              spellCheck={false}
              aria-label="Find a gene"
            />
            {query ? (
              <button type="button" className="inline-clear" onClick={() => setQuery('')} aria-label="Clear">
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        {query.trim() && (
          <div className="gene-hits">
            {hits.length === 0 ? (
              <p className="dim" style={{ margin: '10px 2px', fontSize: 13.5 }}>
                No gene matches that. Try a locus like <code>Rv0205</code>, a symbol like <code>eccD3</code>, or words from
                a product description.
              </p>
            ) : (
              hits.map((hit) => (
                <button
                  key={hit.gene.orf}
                  type="button"
                  className="gene-hit"
                  onClick={() => {
                    setParams({ gene: hit.gene.orf });
                    setQuery('');
                  }}
                >
                  <span className="gene-hit-name">
                    <span className="mono">{hit.gene.orf}</span>
                    {hit.gene.gene ? <b>{hit.gene.gene}</b> : null}
                  </span>
                  <span className="gene-hit-annot">{hit.gene.annotation}</span>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      {focused ? (
        <GenePanel
          gene={focused}
          selection={selection}
          onClose={() => setParams({ gene: null })}
          onImportPaper={onImportPaper}
        />
      ) : null}

      {!selection && (
        <SignalUnlock busy={unlocking} error={unlockError} onSubmit={(value) => tryUnlock(value, true)} />
      )}

      <Prioritize
        catalog={catalog}
        selection={selection}
        weights={weights}
        pathways={pathways}
        onWeights={(next) => setParams({ w: encodeWeights(next) })}
        onPathways={(next) => setParams({ path: next.join(',') })}
        onPick={(orf) => setParams({ gene: orf })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Unlocking the selection signals
 * ------------------------------------------------------------------ */

function SignalUnlock({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (passphrase: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="signal-unlock"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="signal-unlock-head">
        <Lock size={16} aria-hidden />
        <div>
          <strong>Selection signals are locked</strong>
          <span>
            ω, significance, mutation counts and the cohort difference come from the unpublished diabetes selection study,
            which is published encrypted. Everything else on this page works without it.
          </span>
        </div>
      </div>
      <div className="signal-unlock-row">
        <input
          type="password"
          className="input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Passphrase"
          autoComplete="current-password"
          spellCheck={false}
          disabled={busy}
          aria-label="Selection dataset passphrase"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Unlock size={15} aria-hidden />}
          {busy ? 'Deriving the key…' : 'Unlock'}
        </button>
      </div>
      {error ? <p className="lock-error">{error}</p> : null}
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * One gene
 * ------------------------------------------------------------------ */

function GenePanel({
  gene,
  selection,
  onClose,
  onImportPaper,
}: {
  gene: Gene;
  selection: SelectionData | null;
  onClose: () => void;
  onImportPaper: (identifier: string) => void;
}) {
  const [literature, setLiterature] = useState<GeneLiterature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const signals = selection?.byOrf.get(gene.orf) ?? null;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setLiterature(null);
    geneLiterature(gene, { limit: 20, signal: controller.signal })
      .then((result) => alive && setLiterature(result))
      .catch((e) => alive && (e as Error).name !== 'AbortError' && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [gene.orf]);

  return (
    <section className="gene-panel-card">
      <div className="gene-panel-head">
        <div>
          <h2>
            <span className="mono">{gene.orf}</span>
            {gene.gene ? <span className="accent">{gene.gene}</span> : null}
          </h2>
          <p className="dim">{gene.annotation || 'No product description.'}</p>
          <div className="stat-chips">
            <span className="meta-chip">{CATEGORY_LABEL[gene.category]}</span>
            <span className="meta-chip">{gene.length.toLocaleString()} aa</span>
            <span className="meta-chip mono">
              {gene.strand}
              {Math.round(gene.start / 1000)}k
            </span>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close gene">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="gene-panel-grid2">
        <div>
          <h3 className="pane-title-sm">Selection in diabetes</h3>
          {signals ? (
            <dl className="kv">
              <dt>DPD</dt>
              <dd className="tabnum">{fmt(signals.dpd, 4)}</dd>
              <dt>ω diabetes</dt>
              <dd className="tabnum">{fmt(signals.omegaDb, 3)}</dd>
              <dt>ω non-diabetes</dt>
              <dd className="tabnum">{fmt(signals.omegaNdb, 3)}</dd>
              <dt>Δlog₂(pN/pS)</dt>
              <dd className="tabnum">{fmt(signals.deltaLog2, 3)}</dd>
              <dt>Distinct alleles</dt>
              <dd className="tabnum">{signals.alleles ?? '—'}</dd>
              <dt>Branch model 2ΔLL</dt>
              <dd className="tabnum">{fmt(signals.signed2LL, 3)}</dd>
            </dl>
          ) : (
            <p className="dim" style={{ fontSize: 13.5 }}>
              {selection ? 'This gene is not in the selection dataset.' : 'Unlock the selection dataset to see these.'}
            </p>
          )}

          <h3 className="pane-title-sm" style={{ marginTop: 18 }}>
            Elsewhere
          </h3>
          <div className="gene-links">
            {EXTERNAL(gene).map((link) => (
              <a key={link.label} className="chip" href={link.href} target="_blank" rel="noreferrer noopener">
                {link.label} <ExternalLink size={11} aria-hidden />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="pane-title-sm">
            Literature
            {literature ? <span className="pane-count">{literature.total.toLocaleString()} papers</span> : null}
          </h3>
          {loading && (
            <p className="dim" style={{ fontSize: 13.5 }}>
              <Loader2 size={13} className="spin" aria-hidden /> Searching Europe PMC…
            </p>
          )}
          {error && <p className="lock-error">{error}</p>}
          {literature?.widened && (
            <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
              Nothing names this gene in a title or abstract, so this is a full-text search.
            </p>
          )}
          {literature && literature.items.length === 0 && !loading && (
            <p className="dim" style={{ fontSize: 13.5 }}>Nothing published names this gene yet.</p>
          )}
          <ul className="gene-papers">
            {(literature?.items ?? []).slice(0, 12).map((item) => (
              <PaperRow key={item.id} item={item} onImport={onImportPaper} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PaperRow({ item, onImport }: { item: LiteratureItem; onImport: (identifier: string) => void }) {
  const identifier = item.pmcid ?? item.pmid ?? item.doi ?? '';
  const href = item.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
    : item.doi
      ? `https://doi.org/${item.doi}`
      : `https://europepmc.org/article/${item.source}/${item.id}`;
  return (
    <li className="gene-paper">
      <a className="gene-paper-title" href={href} target="_blank" rel="noreferrer noopener">
        {item.title}
      </a>
      <div className="gene-paper-meta">
        {item.journal ? <span>{item.journal}</span> : null}
        {item.year ? <span>{item.year}</span> : null}
        {item.citations > 0 ? <span>{item.citations.toLocaleString()} citations</span> : null}
        {item.isPreprint ? <span className="tag-preprint">preprint</span> : null}
        {item.hasFullText ? <span className="tag-open">full text</span> : null}
        {identifier ? (
          <button type="button" className="link-btn" onClick={() => onImport(identifier)}>
            Read in Review <ArrowRight size={12} aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * GenePrioritize
 * ------------------------------------------------------------------ */

const PATHWAY_CHOICES: GeneCategory[] = [
  'cell-wall',
  'virulence',
  'lipid',
  'metabolism',
  'regulatory',
  'information',
  'hypothetical',
];

function Prioritize({
  catalog,
  selection,
  weights,
  pathways,
  onWeights,
  onPathways,
  onPick,
}: {
  catalog: GeneCatalog;
  selection: SelectionData | null;
  weights: Weights;
  pathways: GeneCategory[];
  onWeights: (weights: Weights) => void;
  onPathways: (pathways: GeneCategory[]) => void;
  onPick: (orf: string) => void;
}) {
  const [literature, setLiterature] = useState<Map<string, number>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [page, setPage] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const ranked = useMemo(
    () => rankGenes({ genes: catalog.genes, selection, literature, weights, pathways }),
    [catalog, selection, literature, weights, pathways],
  );

  const shortlist = ranked.slice(0, SHORTLIST).map((row) => row.gene);
  const pending = shortlist.filter((gene) => !literature.has(gene.orf));

  const fetchLiterature = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: pending.length });
    void literatureCounts(pending, {
      signal: controller.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    })
      .then((counts) => {
        setLiterature((current) => new Map([...current, ...counts]));
      })
      .finally(() => setProgress(null));
  };

  const pages = Math.max(1, Math.ceil(ranked.length / PAGE));
  const shown = ranked.slice(page * PAGE, page * PAGE + PAGE);

  const downloadCsv = () => {
    const header = ['rank', 'orf', 'gene', 'product', 'class', 'score', ...SIGNALS, 'papers'];
    const lines = [header.join(',')];
    const cell = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    ranked.slice(0, 500).forEach((row, index) => {
      lines.push(
        [
          index + 1,
          row.gene.orf,
          row.gene.gene ?? '',
          row.gene.annotation,
          row.gene.category,
          row.score.toFixed(2),
          ...SIGNALS.map((id) => {
            const signal = row.signals.find((s) => s.id === id);
            return signal?.value === null || signal === undefined ? '' : signal.value.toFixed(4);
          }),
          row.literature ?? '',
        ]
          .map(cell)
          .join(','),
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'geneprioritize.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="prioritize">
      <div className="section-head">
        <h2>
          <Sliders size={18} aria-hidden /> GenePrioritize
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadCsv}>
          <Download size={14} aria-hidden /> CSV
        </button>
      </div>
      <p className="dim" style={{ marginTop: 0, fontSize: 13.5, maxWidth: '72ch' }}>
        Every signal is scaled to 0–1 and weighted by you; the score is the weighted mean over the signals that have data
        for that gene, so a gene is never punished for a measurement nobody made.
        {!selection && ' The selection signals are locked, so this is ranking on annotation, pathway and literature alone.'}
      </p>

      <div className="weight-grid">
        {SIGNALS.map((id) => (
          <label key={id} className="weight" title={SIGNAL_META[id].help}>
            <span>{SIGNAL_META[id].label}</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.25}
              value={weights[id]}
              onChange={(event) => onWeights({ ...weights, [id]: Number(event.target.value) })}
              aria-label={`${SIGNAL_META[id].label} weight`}
            />
            <b className="tabnum">{weights[id].toFixed(2)}</b>
          </label>
        ))}
      </div>

      <div className="filter-row">
        <span className="dim" style={{ fontSize: 12.5 }}>Pathways of interest:</span>
        {PATHWAY_CHOICES.map((category) => {
          const on = pathways.includes(category);
          return (
            <button
              key={category}
              type="button"
              className={`chip${on ? ' chip-active' : ''}`}
              aria-pressed={on}
              onClick={() => onPathways(on ? pathways.filter((c) => c !== category) : [...pathways, category])}
            >
              {CATEGORY_LABEL[category]}
            </button>
          );
        })}
      </div>

      <div className="filter-row">
        <button type="button" className="btn btn-sm" onClick={fetchLiterature} disabled={progress !== null || pending.length === 0}>
          {progress ? (
            <>
              <Loader2 size={14} className="spin" aria-hidden /> {progress.done}/{progress.total}
            </>
          ) : (
            <>
              <Quote size={14} aria-hidden /> Fetch literature for the top {SHORTLIST}
            </>
          )}
        </button>
        <span className="dim" style={{ fontSize: 12.5 }}>
          {literature.size > 0
            ? `${literature.size} genes counted. Ranking the whole genome live would be ${catalog.count.toLocaleString()} searches, so literature re-ranks the shortlist.`
            : 'Counts are fetched for the current top of the ranking, not the whole genome.'}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table gene-rank-table">
          <thead>
            <tr>
              <th style={{ width: 46 }}>#</th>
              <th>Gene</th>
              <th>Product</th>
              <th style={{ width: 150 }}>Score</th>
              <th style={{ width: 120 }}>Signals</th>
              {/* ω is not uppercased with the rest of the header: uppercase ω is Ω, a different quantity. */}
              <th style={{ textAlign: 'right', textTransform: 'none' }}>ω DB</th>
              <th style={{ textAlign: 'right' }}>DPD</th>
              <th style={{ textAlign: 'right' }}>Alleles</th>
              <th style={{ textAlign: 'right' }}>Papers</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <RankRow key={row.gene.orf} row={row} rank={page * PAGE + index + 1} onPick={onPick} />
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="pagerow">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Previous
          </button>
          <span className="dim tabnum" style={{ fontSize: 13.5 }}>
            Page {page + 1} of {pages}
          </span>
          <button className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

const SIGNAL_SHORT: Record<SignalId, string> = {
  omega: 'ω',
  significance: 'sig',
  mutations: 'mut',
  cohort: 'coh',
  literature: 'lit',
  pathway: 'path',
  annotation: 'ann',
};

function RankRow({ row, rank, onPick }: { row: RankedGene; rank: number; onPick: (orf: string) => void }) {
  return (
    <tr onClick={() => onPick(row.gene.orf)} className="rank-row">
      <td className="tabnum dim">{rank}</td>
      <td>
        <span className="mono">{row.gene.orf}</span>
        {row.gene.gene ? <b className="accent" style={{ marginLeft: 6 }}>{row.gene.gene}</b> : null}
      </td>
      <td className="dim rank-product">{row.gene.annotation}</td>
      <td>
        <div className="score-bar" title={`${row.score.toFixed(1)} of 100`}>
          <span style={{ width: `${Math.max(2, row.score)}%` }} />
        </div>
        <span className="tabnum dim" style={{ fontSize: 11.5 }}>{row.score.toFixed(1)}</span>
      </td>
      <td>
        <div className="signal-pips">
          {row.signals
            .filter((signal) => signal.weight > 0)
            .map((signal) => (
              <span
                key={signal.id}
                className="signal-pip"
                data-missing={signal.value === null}
                title={`${SIGNAL_META[signal.id].label}: ${signal.value === null ? 'no data' : signal.value.toFixed(2)}`}
              >
                <i style={{ height: `${signal.value === null ? 6 : 4 + signal.value * 14}px` }} />
                <em>{SIGNAL_SHORT[signal.id]}</em>
              </span>
            ))}
        </div>
      </td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(row.selection?.omegaDb ?? null)}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{fmt(row.selection?.dpd ?? null, 3)}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{row.selection?.alleles ?? '—'}</td>
      <td className="tabnum" style={{ textAlign: 'right' }}>{row.literature ?? '—'}</td>
    </tr>
  );
}
