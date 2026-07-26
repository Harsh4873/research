# GenomegaMap.md

The primary analysis. Everything in Table 3 and Figures 1-3 comes from here. Written to help you write
and defend the paper, not to teach the Bayesian theory.

> **State, 2026-07-24.** The DB-vs-NDB run on 922 isolates is **done** (`db-vs-ndb12/`, 4018 genes,
> spreadsheets and `master/db_vs_ndb_master.xlsx` built). Three further genomegaMap runs have inputs
> built but have not been run: the pooled 922 combined run, drug-resistant vs sensitive, and lineage
> L2 vs L4. See [Runs.md](Runs.md) and the repo-root `todo.md`.

---

## 1. What it produces

For each gene, in each cohort separately, a **posterior distribution** over omega (dN/dS). Not a single
number, a distribution with a width.

From those two distributions comes the paper's headline statistic:

> **DPD = P(omega_DB > omega_NDB)**

Read literally: draw one omega from the diabetes posterior and one from the non-diabetes posterior; DPD
is the fraction of draws where the diabetes value is larger.

- DPD near **1.0** = strong evidence diabetes omega is higher
- DPD near **0.5** = the two posteriors overlap, no evidence either way
- DPD near **0.0** = non-diabetes is higher

**Cutoff used in the paper: DPD > 0.95** is marked with an asterisk as significant. Genes just below
(including eccD3) are reported as "near-significant leads."

---

## 2. Why a posterior and not a point estimate

This is the single most important thing to understand for defending the paper.

A gene with 3 mutations and a gene with 300 mutations can both give omega = 2.0, but you should believe
them very differently. GenomegaMap encodes that: little data gives a wide posterior, lots of data gives
a narrow one. DPD then automatically accounts for confidence, because two wide overlapping posteriors
cannot produce a DPD near 1 no matter where their centres sit.

**This is why the expanded non-diabetes cohort matters.** Going from 175 to 744 isolates narrows the
non-diabetes posterior. Less overlap means DPD gets pushed toward 0 or 1, so genuinely different genes
can cross 0.95 while artefacts fall apart. It is a precision gain, not a bias, because each cohort's
posterior is estimated only from its own data.

---

## 3. The model and settings (what to write in Methods)

The tool is `gcat` running the **genomegaMap Constant model** (a single omega per gene, as opposed to
site-varying). Mutation model is **NY98**. Per-gene XML, one run per gene per cohort.

| setting | value | note |
|---|---|---|
| `niter` | 10000 | MCMC iterations |
| `burnin` | 2000 | discarded inside the XML, so no burn-in is removed again downstream |
| `thinning` | 5 | every 5th sample kept |
| **posterior samples** | **1600** | = (10000 - 2000) / 5 |
| theta (diversity) | improper log-uniform prior | |
| kappa (ts/tv) | improper log-uniform prior, starts 1.0 | estimated, not fixed |
| omega prior | gamma(shape 1, scale 1) | via a continuous-mosaic with p = 1e-6, which keeps it effectively one omega per gene |
| codon frequencies | uniform, 1/61 | all non-stop codons equal |

Output per gene is a trace file with columns `iteration, loglikelihood, loglik(seqs), theta, kappa,
omega0`. The reported omega is the mean of the 1600 `omega0` samples; the 95% CI is the 2.5 and 97.5
percentiles of those samples.

**Note the difference from PAML:** here kappa is *estimated* and codon frequencies are uniform. In our
PAML runs kappa is *fixed at 4*. That is a deliberate, defensible difference (see [PAML.md](PAML.md)),
not an inconsistency: PAML fixes nuisance parameters so the likelihood-ratio test is clean, while
GenomegaMap integrates over them.

---

## 4. How DPD is actually computed

Both cohorts give 1600 posterior samples each. DPD is computed from those two sample sets, so it
inherits the full shape of both posteriors rather than just their means. That is why a gene can have a
higher diabetes mean omega and still show a mediocre DPD: if the posteriors are wide, the overlap is
large.

This also explains the **non-consecutive DPD ranks** in Table 3. Genes that pass the DPD sort but fail
the count filters (low-count genes like Rv3055) are dropped from the presentation table, so the rank
numbers jump.

---

## 5. Where it runs

Genome-wide, one gene at a time, so it is embarrassingly parallel and runs as a SLURM array on FASTER.
Roughly 1.5 to 1.9 seconds per codon at 744 isolates for the full 10000 iterations, about 700 core-hours
for all 4018 genes. The recipe is `db-vs-ndb12/commands.md` (the folder was called `ndb12/` before it
was renamed). PAML runs on Grace instead, for balance reasons; see [Runs.md](Runs.md).

---

## 6. What a reviewer will attack, and the answer

**"DPD is a posterior probability, not a p-value. Where is the multiple-testing correction?"**
This is the main vulnerability. See [Significance.md](Significance.md). Short version: the paper reports
an Efron empirical-null **local FDR** on the DPD scores as the FDR-based check, and it agrees with the
0.95 cutoff (ten genes reach local FDR < 0.20, essentially the same set).

**"Your cohorts are different sizes now (178 vs 744)."**
Fine for this method. Each cohort's posterior is fit independently on its own alignment; unequal size
changes precision, not location. Contrast with pN/pS, where unequal depth genuinely does bias the
comparison (see [PNPS.md](PNPS.md)).

**"One omega per gene hides site-level variation."**
Acknowledged and deliberate. The Constant model is the right granularity for a per-gene cohort contrast
and keeps the model non-hierarchical, which also matters for why standard BH is not the natural
correction here.

**"Is this independently supported?"**
Yes, that is the entire point of the PAML cross-check. An independent frequentist branch-model test
correlates with DPD at Spearman **+0.92**. Two unrelated methods agreeing is the strongest defence in
the paper.

**Caveat as of 2026-07-24:** that +0.92 is from the **superseded 353-isolate** run. The PAML rerun on
922 isolates launched tonight and will replace it. Until it lands, say "about +0.9 on the previous
cohort, rerun in progress" rather than quoting +0.92 as current. See [PAML.md](PAML.md) section 16.
