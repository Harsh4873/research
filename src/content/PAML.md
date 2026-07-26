# PAML.md

A from-scratch explanation of the PAML side of the TB/diabetes project. Readable top to bottom with no
prior context. Every number is from a real run, and where a number is from the **superseded 353-isolate
run** it says so.

> **State, 2026-07-24.** The pipeline was rebuilt for the 922-isolate cohort and launched on Grace at
> 23:29 tonight. There is **no current genome-wide result yet.** The headline "+0.92 correlation with
> DPD" is from the old 353-isolate run and must not be quoted as current. See section 16.

**Contents**
1. [The question](#1-the-question)
2. [Omega (dN/dS) in one page](#2-omega-dnds-in-one-page)
3. [The two tools](#3-the-two-tools)
4. [Likelihood ratio tests in one page](#4-likelihood-ratio-tests-in-one-page)
5. [The OLD method and why it failed](#5-the-old-method-and-why-it-failed)
6. [The fix: test DB against NDB directly](#6-the-fix-test-db-against-ndb-directly)
7. [The method we run: the branch model](#7-the-method-we-run-the-branch-model)
8. [The paired-tree method (archived)](#8-the-paired-tree-method-archived)
9. [Why the two agree](#9-why-the-two-agree)
10. [The signed statistic](#10-the-signed-statistic)
11. [fix_blength: how the big genes became affordable](#11-fix_blength-how-the-big-genes-became-affordable)
12. [The clean-gene gate](#12-the-clean-gene-gate)
13. [Reading the output columns](#13-reading-the-output-columns)
14. [Practical gotchas](#14-practical-gotchas)
15. [Settings, file map, and how to run it](#15-settings-file-map-and-how-to-run-it)
16. [Results](#16-results)
17. [Is this valid? (Yang 1998)](#17-is-this-valid-yang-1998)
18. [Glossary](#18-glossary)

---

## 1. The question

We have *M. tuberculosis* isolates from two groups of patients:

- **DB** = isolates from patients with diabetes, **178**
- **NDB** = isolates from patients without diabetes, **744**

922 total. For each testable gene we want to know: **is this gene under different selective pressure in
the diabetes host environment than in the non-diabetes one?**

That is it. Everything below is machinery for answering that one question per gene, and for ranking the
genes so the paper can say "these are the genes that respond to the diabetic host."

PAML is the **cross-check**, not the primary method. GenomegaMap gives the primary ranking (DPD). The
value of PAML is that it is a completely different statistical framework, so agreement between them is
much harder to dismiss than either alone.

---

## 2. Omega (dN/dS) in one page

When a codon mutates, the change is one of two kinds:

- **Synonymous (S)**: the DNA changed but the amino acid did not. Selection mostly ignores these, so
  they accumulate at the background mutation rate. They are your control.
- **Nonsynonymous (N)**: the amino acid changed. Selection sees these.

**Omega (ω, dN/dS) is the ratio of the two rates**, corrected for how many of each kind are even
possible:

| omega | meaning | why |
|---|---|---|
| **ω < 1** | purifying (negative) selection | amino acid changes are being removed. Most genes look like this. |
| **ω = 1** | neutral | changes accumulate at the same rate as silent ones, so nothing is watching. |
| **ω > 1** | positive (diversifying) selection | changes are being favoured. Rare and interesting. |

Most TB genes sit around ω = 0.1 to 0.7.

**The key mental move for this project:** we do not care much whether a gene's omega is above or below
1. We care whether **omega differs between DB and NDB.** Section 5 is the story of what happens when you
forget that.

---

## 3. The two tools

### GenomegaMap (primary, Bayesian)
Produces per gene a posterior probability, **DPD = P(ω_DB > ω_NDB)**. Directional: it tells you which
cohort is higher, not just that they differ. That matters in section 10. See
[GenomegaMap.md](GenomegaMap.md).

### PAML / codeml (cross-check, frequentist)
`codeml` is the workhorse program in the PAML package. You hand it:

1. an **alignment** (the gene's coding sequence for each isolate, in frame)
2. a **tree** (the phylogeny relating those isolates)
3. a **control file** (which model to fit, which parameters to fix)

and it returns a **maximum likelihood fit**: the omega that best explains the data, plus the **log
likelihood (lnL)** of that fit. Our job is to run codeml in the right configuration and turn its lnL
values into a per-gene statistic we can correlate against DPD.

**A good cross-check is one that correlates with DPD.** That is the success metric throughout.

---

## 4. Likelihood ratio tests in one page

**Likelihood** = how probable your data is under a given model. codeml reports the **log** likelihood
(lnL), always negative for this kind of data (for example -619.7). **Closer to zero is better.**

**The test.** Fit two nested models:

- **Null (H0)**: the simpler model, with a restriction applied.
- **Alt (H1)**: the same model with the restriction lifted, so one extra free parameter.

The alt can never fit worse, because it contains the null as a special case. The question is whether it
fits **enough** better to justify the extra parameter:

```
2dLL  =  2 * (lnL_alt  -  lnL_null)
```

**Wilks' theorem**: if the null is true, `2dLL` follows a chi-square with degrees of freedom equal to
the number of extra parameters. All our tests add exactly one omega, so

```
df = 1     critical values:  3.84 (p = 0.05)     6.63 (p = 0.01)     10.83 (p = 0.001)
```

A `2dLL` of 0.995 means "the extra parameter bought you nothing." A `2dLL` of 65 means "the restriction
is badly wrong."

**Sanity checks:** `2dLL` is never negative (if it is, an optimizer got stuck, see section 14), and
3.84 is your mental yardstick.

---

## 5. The OLD method and why it failed

The original setup ran **4 codeml runs per gene** and tested **free omega versus omega = 1**, pooled
over both cohorts. In words: *"is this gene's omega different from neutral?"*

### Why that is the wrong question here
That measures **selection strength**, not **diabetes difference.** A gene under crushing purifying
selection in *both* cohorts (most of the genome) produces a huge `2dLL` because its omega is nowhere
near 1, even though **the two cohorts are identical to each other.**

### The example that made it obvious: esxK (Rv1197)

| quantity | value | reading |
|---|---|---|
| DPD | **0.4944** | dead neutral. GenomegaMap sees no diabetes difference at all. |
| ω_DB | 0.0763 | strong purifying selection |
| ω_NDB | 0.0258 | strong purifying selection |
| **old statistic (ω vs 1)** | **65.39** | "wildly significant!" |
| **new statistic (DB vs NDB)** | **1.012** | "nothing here" (p = 0.31) |

The old statistic screamed 65 on a gene whose DPD is 0.49. It was not detecting diabetes. It was
detecting that 0.076 is very far from 1, which is true of nearly every gene in the genome.

### The verdict, genome-wide
The old omega-versus-1 statistic correlated with DPD at **-0.01**. That is zero.

We also burned time trying to fix it with parameters (CodonFreq, kappa, clock, cleandata, different null
omegas). **None of it helped**, because the problem was never a nuisance parameter. It was the
hypothesis being tested. This is the most useful lesson in the project: when a statistic will not
correlate, check what null you are testing against before you tune anything.

---

## 6. The fix: test DB against NDB directly

Stop comparing each cohort to the abstract value 1. **Compare the cohorts to each other.**

- **Null (H0):** DB and NDB share ONE omega. (No diabetes effect.)
- **Alt (H1):** DB and NDB each get their OWN omega. (A diabetes effect.)
- One extra parameter, so **df = 1**.

```
2dLL  =  2 * (lnL_separate_omegas  -  lnL_shared_omega)
```

Same LRT machinery, same df, different and correct null. On esxK this drops the statistic from 65.39 to
1.012, which finally matches its DPD of 0.4944. Genome-wide the correlation with DPD went from -0.01 to
**+0.92** (on the 353 cohort).

---

## 7. The method we run: the branch model

**Setup:** ONE combined tree with every isolate on it, split into two labelled clades:

```
( <all 178 DB isolates>$1 , <all 744 NDB isolates>$2 );
```

That is `FinalPaml/data/ndb12/diabetes.DB_NDB12.CDS.split.noblen.bintree`, 922 tips, built by
`scripts/build_ndb12_tree.py` from the tree the project lead sent on 2026-07-24. The `$1` and `$2` are codeml
**clade labels**: the `$` form is inherited by everything below that node, so one tag labels the whole
clade. (`#1` / `#2` label a single branch only.)

**Why a split tree at all.** In the real phylogeny the two cohorts are interleaved. The branch model
needs every DB tip under one label and every NDB tip under the other, so the split tree is built by
pruning his tree twice, once to the 178 DB tips and once to the 744 NDB tips, then joining the two
topologies at a new root. Each side keeps its own within-cohort topology; only the between-cohort
structure is replaced.

### Step 1: the null (one shared omega) = codeml `model = 0`
`model=0` fits **one omega for the entire tree**, ignoring the labels. The shared omega comes out
directly from codeml's optimizer in a single run. No grid search.

### Step 2: the alt (two omegas) = codeml `model = 2`
`model=2` is the **branch model**: a separate omega per labelled branch class, fitted jointly in one run.

```
model=2:  ω($1 = DB),   ω($2 = NDB)
```

### Step 3: the test
```
2dLL = 2 * (lnL_model2 - lnL_model0)      df = 1
```

On esxK, from the 353 run: `2 * (-618.6783 - (-619.1761)) = 0.9954`, p = 0.3184.

### Cost
**2 codeml runs per gene.** The code is `FinalPaml/lib/method.py`, function `run_gene`.

### The one code change this required
`collapse_isolates.py` collapses byte-identical sequences into haplotypes, because codeml cannot use
duplicate sequences. Originally it grouped **by sequence only**, which would merge a DB isolate and an
NDB isolate with identical sequence into one tip. That destroys the split: a merged tip cannot belong to
one clade. The fix is to group by **(sequence, label)**:

```python
key = (s, label_of.get(name)) if label_of else s
```

so identical sequences under different labels stay two separate tips.

---

## 8. The paired-tree method (archived)

An earlier method fitted each cohort on its **own** tree and found the shared-omega null by a **grid
search** over ~12 candidate omegas, keeping the best combined log likelihood. It gave the same answers
(esxK 1.012 vs 0.995; Spearman +0.924 vs +0.922) at ~26 codeml runs per gene instead of 2.

It was retired once the branch model proved equivalent and 13x cheaper. Its code and results are in
`oldProjects/` (`FinalPaml.run-artifacts.tar.gz`, `PAML.tar.gz`). It is worth knowing about for one
reason: **the two pipelines were written independently and agreed**, which is itself a result.

---

## 9. Why the two agree

- **Same null.** `model=0` solves for the single shared omega inside one run; the grid finds the same
  number by brute force. Two ways to compute one thing.
- **Same alt.** `model=2` estimates the two clade omegas jointly; the paired method estimates the same
  two omegas separately. On esxK they landed on identical values (0.0763 and 0.0258).
- **Same df.** Both add exactly one omega.

The only real difference is **branch lengths**: the combined tree shares one set across both cohorts,
the paired method lets each cohort estimate its own. Second-order, which is why esxK gives 1.012 one way
and 0.995 the other.

### The Rv0290 robustness check (three routes, three settings)

the project lead independently ran Rv0290 with **different nuisance settings** (free kappa, `CodonFreq = 2`
F3x4) than ours (kappa fixed at 4, `CodonFreq = 0` uniform):

| route | settings | ω_DB | ω_NDB | shared ω | **2dLL** |
|---|---|---|---|---|---|
| branch model, his run | free kappa, F3x4 | 2.8528 | 0.3561 | 0.77222 | **3.5584** |
| branch model, our run, his settings | free kappa, F3x4 | 2.8527 | 0.3561 | 0.7722 | **3.5586** |
| branch model, our run, our settings | kappa = 4, uniform | 4.0661 | 0.5079 | 1.1007 | **3.5575** |
| paired-tree, our run | kappa = 4, uniform | 4.0662 | 0.5079 | (grid) | **3.579** |

Row 2 is the important one: running **our** script with **his** settings reproduces his log likelihoods
to four decimals. The two pipelines are not merely in agreement, they compute the identical fit.

The **individual omegas differ by ~30%** because F3x4 changes the codon frequency model and rescales
omega. But **the LRT statistic is stable to three decimals.** This is the best evidence we have that the
test measures the DB/NDB difference and not an artifact of the nuisance parameters.

*(These are 353-cohort numbers. Worth repeating on 922 once the run lands.)*

---

## 10. The signed statistic

`2dLL` is **always positive.** It measures *how much* the cohorts differ, never *which one is higher*.
So these two opposite genes are indistinguishable:

| gene | ω_DB | ω_NDB | 2dLL | biologically |
|---|---|---|---|---|
| A | 4.0 | 0.5 | 8 | diabetes-driven |
| B | 0.5 | 4.0 | 8 | non-diabetes-driven |

DPD *can* tell them apart (gene A near 1, gene B near 0). So an unsigned statistic can never correlate
with DPD, no matter how good it is.

### The fix: glue a sign on
```
signed_2dLL = sign(ω_DB - ω_NDB) * 2dLL
signed_Z    = sign(ω_DB - ω_NDB) * sqrt(2dLL)
```

In Python, one call:

```python
signed_Z = math.copysign(math.sqrt(max(two_delta, 0.0)), omega_DB - omega_NDB)
```

**For Table 5 use signed 2dLL, not signed Z.** Z is a monotone transform of the same thing and gives the
same plot; the meeting on 2026-07-24 settled on 2dLL. The sqrt only makes the relationship with DPD
look more linear. **The sign is the part that matters.**

---

## 11. fix_blength: how the big genes became affordable

This is new since the 353 run and it is the single most important practical change, so it deserves its
own section.

**The problem.** `model=2` re-estimates every branch length on top of the two omegas. On a 922-tip tree
that is hundreds of free parameters. On the old cohort, Rv0648 ran **12+ hours** at 131 haplotypes,
where the cost curve predicted 18 minutes. At 922 isolates a full `model=2` fit on the biggest genes is
simply not affordable.

**The fix.** `--fix-blength` makes `model=0` estimate the branch lengths once, then `model=2` holds
them fixed and optimizes **only the two clade omegas**. That is a 2-parameter fit instead of a
several-hundred-parameter one.

**Why it is legitimate, and conservative.** Under this LRT the branch lengths are near-identical between
the two models anyway, because the models differ only in how omega is partitioned. Holding them fixed
means `model=2` can improve fit **only** through the extra omega, never through branch lengths. So the
statistic is if anything understated. Validated on esxK: 2dLL 0.992 fixed versus 0.995 full.

**It is on for the whole 922 run**, main array and oversize alike, not just the biggest genes. That is a
deliberate methodological choice worth confirming with the project lead, and it is what makes the wall times
predictable enough to reserve compute against.

---

## 12. The clean-gene gate

Omega is a ratio, so it breaks when either side is zero:

- **no synonymous substitutions** means dS = 0, so omega blows up. codeml reports **999**.
- **no nonsynonymous substitutions** means dN = 0, so omega collapses. codeml reports about **0.0001**.

Neither is a real estimate, so those genes are excluded. A gene qualifies when it has **at least one
nonsynonymous and one synonymous allele in BOTH cohorts**.

**The clean set is 2614 genes** out of 4018, up from 1805 on the old 353 cohort. More isolates means
more chance a gene has at least one of each kind of change in both cohorts, which is a direct benefit of
the expansion.

**You do not have to run codeml to know which genes these are.** Whether omega pins at a boundary is
fully determined by the NS/S counts already in `db-vs-ndb12/master/db_vs_ndb_master.xlsx`. That shortcut
was checked against real fits on 30 genes covering all four pinning modes plus clean controls and agreed
30/30, so `lib/genes.py:clean_genes()` derives the set from counts and the expensive Model 0 gate
(stage 1) is optional. It exists only to widen that validation or to put the per-gene M0 omegas on
record.

---

## 13. Reading the output columns

Each Grace task writes a TSV with these 14 columns:

| column | meaning |
|---|---|
| `gene` | Rv number |
| `n_hap`, `n_DB`, `n_NDB` | distinct sequences kept, total and per cohort |
| `lnL0` | log likelihood of `model=0` (shared omega) |
| `lnL2` | log likelihood of `model=2` (two omegas) |
| `shared_omega` | the single omega from `model=0` |
| `omega_DB`, `omega_NDB` | the two clade omegas from `model=2` |
| `two_delta` | **the statistic.** `2 * (lnL2 - lnL0)`, df = 1 |
| `signed_Z` | `sqrt(two_delta)` with the sign of (ω_DB - ω_NDB) |
| `p_value` | chi-square p for `two_delta`, df = 1 |
| `status` | `ok`, or `skip: <reason>`, or `error: ...` |
| `seconds` | wall time for that gene |

`scripts/merge_tasks.py` concatenates the per-task files and writes
`results/data/paml_output.tsv` with a `dpd` column joined on, which is the schema `report.py` and
`make_tables.py` consume.

---

## 14. Practical gotchas

### Local optima and restarts
codeml is a hill climber. On trees with many near-zero-length branches (ours, because closely related
isolates barely differ) the surface is bumpy and it can stop on a lower hill.

**Symptom:** the same gene gives different answers on different runs, or `2dLL` comes out absurdly high
or negative.

**Real case:** esxK's `model=0` once got stuck at lnL = -621.59 when the true optimum is about -619.7.
`model=2` found its peak fine, so `2dLL` came out **5.83 instead of 0.995.** Nothing was wrong with the
method; the null just failed to converge.

**The fix is multistart:** run codeml N times from different starting omegas and keep the highest lnL.
That is `--restarts`. With `--fix-blength` one restart is enough, because both models share branch
lengths by construction and the local-optimum problem cannot arise.

### Non-determinism from set ordering
An early bug: the code did `list(leaves(tree))`, and Python set iteration order is not stable across
processes. Different tip orderings gave different starting conditions and different local optima, so
Rv1197 returned 57, 61, 59 on successive runs. Fixed with `sorted(leaves(pruned))`. **If a result is not
reproducible, suspect an unordered container before you suspect the science.**

### Runtime is driven by haplotypes, not isolates
A gene where 922 isolates collapse to 12 distinct sequences runs in a second. One that collapses to 900
does not. Cost goes roughly as **tips^2.5**, so the tail is brutal: 5% of genes are 75% of the compute.
See [Runs.md](Runs.md).

### Rebuilding codeml changes the last digit
The binary shipped to Grace had to be recompiled (Grace's glibc is older than galaxy's). Any fresh
build differs from any other in the 5th decimal, from compiler and CPU differences in the math library.
Measured across 8 genes: max 2dLL disagreement **1e-5** against a threshold of 3.84. Irrelevant to any
conclusion, but it means **one binary for the whole run**, which is why the same static binary now sits
in `FinalPaml/bin/codeml` locally and on the cluster.

---

## 15. Settings, file map, and how to run it

### Settings

| setting | value | why |
|---|---|---|
| `CodonFreq` | **0** (uniform, 1/61) | `2` (F3x4) made results worse and uniform keeps the cohorts on identical footing |
| `fix_kappa` | **1**, `kappa = 4` | kappa is the transition/transversion ratio, a nuisance parameter. Pinning it removes run-to-run wobble. |
| `clock` | **0** | `model=2` requires an unrooted tree, so no molecular clock |
| `cleandata` | **0** | `1` strips every column with any ambiguity, which removed too much data |
| `fix_blength` | **2** on model=2 | section 11 |
| `restarts` | **1** with fix-blength | section 14 |

**The general principle:** fix the nuisance parameters so the only thing varying between null and alt is
the omega structure. Then any likelihood difference is attributable to that and nothing else.

Note this differs deliberately from GenomegaMap, which *estimates* kappa and integrates over nuisance
parameters. PAML fixes them so the likelihood ratio is clean. Both are defensible; say so in Methods
rather than letting it look like an inconsistency.

### File map, relative to `FinalPaml/`

```
bin/codeml                    statically linked, runs anywhere, one binary everywhere

lib/
  paml_lib.py                 writes the control file, runs codeml, multistart, parses lnL/omega
  method.py                   THE TEST. run_gene() = model 0 vs model 2 for one gene
  collapse_isolates.py        alignment + tree -> haplotypes, pruned tree, labelled tree, alias map
  genes.py                    the clean-gene set and the reference tables from the master spreadsheet

scripts/
  build_ndb12_tree.py         the project lead's 922-tip tree -> the $1/$2 split tree
  run_one.py                  ONE gene, every number printed. Start here when learning.
  run_all.py                  genome-wide, locally, in parallel
  run_task.py                 one Grace array task's worth of genes
  plan_grace_tasks.py         bin-packs genes into balanced array tasks, writes the slurm --array/--time
  merge_tasks.py              concatenates the per-task TSVs, reports missing genes
  report.py                   the xlsx + the DPD scatter, prints the Spearman
  make_tables.py              the paper tables

grace/
  commands.md                 the run recipe, 6 steps
  preflight.sh                every check that has ever caught a real failure. Run before every sbatch.
  calibrate_cost.py           measures how long a gene actually takes; the wall times come from this
  paml_stage2*.grace.slurm    the array jobs
  tasks/                      the per-task gene lists, generated
```

### Commands

```bash
# one gene, fully verbose. Start here.
python3 scripts/run_one.py --gene Rv1197 --restarts 3

# genome-wide, locally
python3 scripts/run_all.py --jobs 8

# genome-wide, on Grace: see grace/commands.md
python3 scripts/plan_grace_tasks.py --stage 2 --wall-hours 168 --safety 1.4
bash grace/preflight.sh 2
```

After the run comes back:

```bash
python3 scripts/merge_tasks.py --stage 2 --indir grace/out/stage2 grace/out/stage2_oversize
python3 scripts/report.py        # prints the Spearman against DPD
python3 scripts/make_tables.py
```

---

## 16. Results

### Current, 922 isolates

**Launched on Grace 2026-07-24 at 23:29. Not finished.** 2614 genes, none excluded. First numbers were
clean: 994 genes in the first three minutes with zero failures.

The 8-gene canary reproduced the old run's omegas to 4 decimal places on the genes they share, which is
the first real evidence the rebuild is faithful:

| gene | ω_DB old (353) -> new (922) | ω_NDB old -> new |
|---|---|---|
| Rv1888A | 0.4625 -> **0.46251** | 0.4614 -> **0.46143** |
| Rv2446c | 0.4980 -> **0.49799** | 0.4980 -> **0.49799** |
| Rv0715 | 0.4257 -> **0.42573** | 0.8531 -> **0.85314** |
| Rv2550c | 0.4433 -> **0.44332** | 0.4455 -> *0.88962* |

**Every ω_DB reproduces.** It should: the diabetes cohort is the same 178 isolates in both runs. Only
ω_NDB moves, and only where the extra non-diabetes isolates carried variation the old run never saw
(Rv2550c). That asymmetry, DB frozen and NDB moving, is exactly what a correct cohort expansion looks
like. If ω_DB had drifted too, something would be wrong.

### Superseded, 353 isolates. **Do not quote these in the paper.**

| method | genes | Spearman vs DPD |
|---|---|---|
| old statistic (omega vs 1) | 1,596 | **-0.01** |
| paired-tree LRT | 1,596 | **+0.924** |
| branch model | 1,576 of 1,878 | **+0.922** |

**What the scatter looks like:** DPD on x, signed 2dLL on y. The old statistic gives a shapeless blob.
The signed statistic gives a clear positive diagonal: DPD near 1 sits high and positive, DPD near 0 sits
low and negative, DPD near 0.5 clusters at zero. the project lead asked for the **unrestricted-axis** version
of this plot for Figure 2b.

---

## 17. Is this valid? (Yang 1998)

> Yang, Z. (1998). Likelihood ratio tests for detecting positive selection and application to primate
> lysozyme evolution. *Molecular Biology and Evolution* 15(5):568-573.
> DOI 10.1093/oxfordjournals.molbev.a025957, PMID 9580986.

This is the paper that introduced the **branch models** in codeml, including exactly the two-ratio test
we run: a one-ratio model against a two-ratio model where a designated set of branches gets its own
omega, compared by an LRT with df = 1. Our method **is** Yang's test with `$1` = diabetes and
`$2` = non-diabetes.

**"But you searched for the shared omega. Is that allowed?"**

Yes, and it is required. Under a likelihood ratio test **every free parameter in the null is estimated
at its maximum likelihood value.** The shared omega is a free parameter of the null, so estimating it is
mandatory, not optional. `model=0` does exactly that with codeml's optimizer.

**And it is conservative.** Maximizing the null's likelihood makes `lnL_null` as *large* as possible,
which makes `2dLL = 2*(lnL_alt - lnL_null)` as *small* as possible. Searching for the best shared omega
can only ever **shrink** the statistic. Any gene that still comes out significant did so against the
toughest possible null. That is the opposite of p-hacking.

Compare with the old setup, which fixed the null at omega = 1: an arbitrary value that fits most TB
genes terribly, which is precisely why it produced numbers like 65.

---

## 18. Glossary

| term | meaning |
|---|---|
| **omega, ω, dN/dS** | ratio of nonsynonymous to synonymous substitution rates. <1 purifying, =1 neutral, >1 positive. |
| **dN / dS** | nonsynonymous / synonymous substitution rate |
| **DB / NDB** | diabetes / non-diabetes patient cohort |
| **DPD** | GenomegaMap's P(ω_DB > ω_NDB). The primary Bayesian ranking. |
| **lnL** | log likelihood. Negative; closer to zero is a better fit. |
| **LRT** | likelihood ratio test |
| **2dLL** | `2 * (lnL_alt - lnL_null)`, the test statistic. Compare to chi-square. |
| **df** | degrees of freedom, the number of extra free parameters. Always 1 here. |
| **signed_Z** | `sqrt(2dLL)` with the sign of (ω_DB - ω_NDB) |
| **codeml** | the maximum likelihood program in the PAML package |
| **model=0** | codeml's one-ratio model: a single omega for the whole tree |
| **model=2** | codeml's branch model: a separate omega per labelled branch class |
| **`$1` / `$2`** | codeml clade labels, inherited by all branches below the node |
| **fix_blength** | hold branch lengths at model=0's estimate so model=2 fits only the omegas |
| **haplotype** | a distinct sequence. Identical isolates collapse to one; codeml rejects duplicates. |
| **multistart / restarts** | run codeml from several starting omegas, keep the highest lnL |
| **kappa** | transition/transversion rate ratio. A nuisance parameter, fixed at 4 here. |
| **clean set** | the 2614 genes with >= 1 nonsynonymous and >= 1 synonymous allele in both cohorts |
| **Spearman** | rank correlation. Used because we care about the ranking of genes, not exact values. |
