# teach/

Explainers for the TB/diabetes positive-selection paper, written so you can read one top to bottom and
then defend that piece in a meeting. No prior biology assumed. Stats and CS assumed at about half.

Last updated **2026-07-24**, the night the PAML rerun was launched on Grace.

---

## Read in this order

| doc | what it covers |
|---|---|
| [GenomegaMap.md](GenomegaMap.md) | the primary method. DPD, what a posterior buys you, the settings for Methods |
| [PAML.md](PAML.md) | the independent cross-check. omega, likelihood ratio tests, the branch model, the Grace run |
| [PNPS.md](PNPS.md) | the counting-based secondary check, and why unequal cohorts bias it |
| [Significance.md](Significance.md) | how a gene is called a hit, and the multiple-testing defence |
| [NDB12_Update.md](NDB12_Update.md) | what changed when non-diabetes grew from 175 to 744 isolates |
| [Runs.md](Runs.md) | where the compute happens, what it costs, and how these runs fail silently |

---

## The one-paragraph version of the whole project

We have *M. tuberculosis* genomes from TB patients who do and do not have diabetes. For each of ~4018
genes we ask whether the gene is under different selective pressure in the two groups. The primary
measure is **DPD**, a Bayesian posterior probability that the diabetes cohort's dN/dS is higher, from
GenomegaMap. Two independent checks back it up: a **PAML** likelihood ratio test on the phylogeny, and
a **pN/pS** count-based comparison with a chi-square. The paper's claim rests on the three agreeing,
not on any one threshold.

---

## The cohort

**NDB12**: 178 diabetes + 744 non-diabetes = **922 isolates**. Diabetes has been fixed at 178
throughout; non-diabetes grew from 175 to 744 on 2026-07-23. Everything current is on 922. Anything
quoting 353 isolates (178 + 175) is the superseded run.

---

## Status board, 2026-07-24

| run | folder | state |
|---|---|---|
| **GenomegaMap, DB vs NDB** | `db-vs-ndb12/` | **done.** 4018 genes, spreadsheets and `master/db_vs_ndb_master.xlsx` built |
| **PAML branch model** | `FinalPaml/` | **running on Grace**, launched 23:29 tonight. 2614 genes, ~3 h for 93% of them |
| GenomegaMap, combined 922 | `combined/` | inputs built, not run. Regenerates Table 2, fixes the lldD1 count |
| GenomegaMap, drug R vs S | `drug-resistance-genes/` | inputs built (205 vs 717), not run |
| GenomegaMap, lineage L2 vs L4 | `lineage-comp/` | inputs built (191 vs 700), not run. Probably a second paper |

The live task list is `todo.md` at the repo root. The paper plan (7 tables, 5 figures, the consolidated
master spreadsheet) came out of the [2026-07-24 meeting](../miscellaneous/notes/meetings/2026-07-24.md).

---

## Numbers you will be asked for

| | value | source |
|---|---|---|
| isolates | 178 DB / 744 NDB / 922 total | `db-vs-ndb12/diabetes.DB_NDB12.xlsx`, `samplestatus=good` only |
| genes with an alignment in both cohorts | 4018 | |
| genes testable by PAML (the clean set) | **2614** | both cohorts have >= 1 nonsynonymous and >= 1 synonymous allele |
| genes at DPD > 0.95 | **35** (was 14 at 175 NDB) | [NDB12_Update.md](NDB12_Update.md) |
| genes at DPD < 0.05 | 33 (was 17) | |
| significance cutoff | DPD > 0.95 | [Significance.md](Significance.md) |
| PAML vs DPD agreement | **+0.92 Spearman, on the superseded 353 run** | the 922 rerun is in flight, do not quote a new number yet |

**The +0.92 is the single most quoted number in the project and it is currently stale.** It came from
the 353-isolate run. The 922 rerun launched tonight will replace it. Until it lands, say "about +0.9 on
the previous cohort, rerun in progress".

---

## Vocabulary, once

- **omega (ω, dN/dS)** a rate ratio the software estimates per gene. Nonsynonymous (amino-acid
  changing) substitutions over synonymous (silent) ones. Below 1 means change is being removed
  (purifying), 1 means nothing is watching (neutral), above 1 means change is favoured (positive).
- **DPD** = P(ω_diabetes > ω_non-diabetes). A probability, not a p-value. Near 1 means the diabetes
  cohort looks more positively selected; near 0 the reverse; near 0.5 no evidence either way.
- **DB / NDB** diabetes / non-diabetes cohort. Just group labels.
- **haplotype** a distinct sequence. Identical isolates collapse to one, because codeml rejects
  duplicates. Runtime is driven by haplotype count, not isolate count.
- **2dLL** the PAML test statistic, `2 * (lnL_alt - lnL_null)`. Compare it to 3.84 for p = 0.05 at
  df = 1.
- **local FDR** how surprising a gene is against the genome-wide distribution of all genes. Unlike DPD
  and chi-square it is *not* a per-gene measure, which is why the cohort imbalance hurt it.
