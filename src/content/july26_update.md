# July 26 update

Week of **2026-07-24 to 2026-07-26**. First of a weekly series; the point is book-keeping and
learning, so it records what broke as carefully as what worked.

Companion to [PAML.md](PAML.md), [Runs.md](Runs.md), [NDB12_Update.md](NDB12_Update.md). Live task
list is repo-root `todo.md`.

---

## The one-line version

The PAML cross-check was rebuilt for the 922-isolate cohort and run on Grace. **It reproduced:
Spearman +0.924 against DPD, where the old 353-isolate run gave +0.922.** eccD3 crossed the
significance threshold. Four genomegaMap runs are in flight, and the repo was reorganised so that
old-cohort and new-cohort results can no longer be confused.

---

## 1. What landed

### PAML on Grace

| | |
|---|---|
| launched | 2026-07-24 23:29 |
| genes fitted | **2376 of 2614** (238 still running) |
| Spearman vs DPD | **+0.924** (Pearson +0.927) |
| the number it reproduces | +0.922, from the superseded 353 run |
| significant, 2dLL > 3.84 | **17** |
| convergence failures | **0** |
| SU | ~8900 reserved of 20000; real burn ~6000 |

Same answer on a new cohort, a new tree, and a recompiled binary. That is the strongest form the
cross-check can take.

**The candidate genes:**

| gene | omega_DB | omega_NDB | 2dLL | p | |
|---|---|---|---|---|---|
| eccD3 / Rv0290 | 4.04 | 0.57 | **3.91** | 0.048 | significant |
| recG / Rv2973c | 3.15 | 0.38 | **4.71** | 0.030 | significant |
| Rv3193c | 1.53 | 0.53 | 3.30 | 0.069 | just short |
| Rv0648 | | | | | still running |
| eccB3 / Rv0283 | 0.10 | 0.80 | 6.02 | 0.014 | **unverified, see section 3** |

**eccD3 moved across the line.** On the 353 tree it was 3.56, under the 3.84 cutoff; on 922 it is
3.91, over. Its DPD moved the same way over the same change, 0.9447 to 0.9684. Two independent
methods shifted in the same direction when the cohort deepened. That is the useful claim, not the
p-value of 0.048 by itself.

**esxK / Rv1197 stayed flat** (2dLL 0.03, p 0.86), which is the control working: the statistic is
measuring the cohort difference, not selection strength.

**The testable set grew from 1805 to 2614 genes.** With 744 non-diabetes isolates instead of 175,
far fewer genes have zero synonymous or zero nonsynonymous change in a cohort. The other 1404 are
listed with their disqualifying count in `FinalPaml/documents/paml_excluded_genes.xlsx`.

### genomegaMap

`db-vs-ndb12` is done, 4018 traces. Three more are running on FASTER: combined, drug-resistant vs
sensitive, lineage2 vs lineage4. All six cohorts verified to share **byte-identical model settings**
(uniform 1/61 codon frequencies, niter 10000, burnin 2000, thinning 5), which was the project lead's
2026-07-21 concern, now checked across every run rather than just one.

### Figures

Nineteen figures exist, staged as `UPLOAD/figures/0` through `5`, one folder per planned figure with
a self-contained `fig<N>.py` that rebuilds it. Fig 2 panel (b), the PAML S-curve, is real for the
first time.

---

## 2. What broke, and the lesson

Every one of these failed **silently**. That is the through-line: on a cluster, the dangerous errors
do not crash.

| what happened | how it would have shown up | lesson |
|---|---|---|
| codeml compiled on galaxy would not run on Grace (`GLIBC_2.34 not found`) | every task dies in 1s | "it only links libc" is not the same as "it runs anywhere". Ship a **static** binary |
| main array hit the wall twice (5h, then 12h) | 304 then 65 genes missing, no error | the cost model was calibrated on **single genes on an idle machine**; production runs 10 genes on a contended node. Overshoot the wall; it is cheap |
| 10 genes came back with omega pinned at 999 or 0.0001 | **Rv2916c would have entered Table 5 as a false hit** | a pre-filter that predicts a property of an expensive computation must be **verified against the actual output**. The gate was right 99.6% of the time |
| pre-922 spreadsheets sat beside 922-era inputs | wrong-cohort numbers with nothing flagging it | file dates are not provenance |
| ndb12 FASTAs were at a different scratch path | eleven other `filtered-fastas` dirs have identical filenames | verify the **isolate IDs**, not that the files exist |
| a task killed during its first gene left a 0-byte TSV | append produces a headerless file whose first data row is read as the header | resume must repair, not trust |
| task lists and `#SBATCH --array` drifted three times | genes never submitted, nothing failed | generate the array from the task lists; never hand-edit |

### The meta-lesson

The fix for all of them was the same shape: **make the check a script, not a habit.**
`grace/preflight.sh` now runs every check that ever caught a real failure, costs 0 SU, and refuses to
pass on drift. `report.py` checks the fitted omegas. `plan_grace_tasks.py` writes the slurm lines
itself. A memory saying "remember to look" would not have survived the week; a script does.

---

## 3. Open, and what is blocking it

| item | state |
|---|---|
| **eccB3 verification** | Grace gave 2dLL 6.02, p 0.014, which would make it the strongest gene on all three methods. It was 0.045 on the old tree with near-identical omegas, and Rv0283 was already flagged for `restarts=3` on 2026-07-22. Refitting locally at restarts=3, ~3h in. **Do not put it in a table until this returns.** |
| 238 PAML genes | 65 main-array on a 48h resubmit, 173 oversize. Rv0648 is in the tail |
| 3 genomegaMap runs | on FASTER. Blocks Tables 2 and 6, three `master/` folders, and the consolidated supplemental |
| **Table numbering conflict** | the whiteboard has negative selection as **Table 8** with lineage struck at 7; `todo.md` renumbered it to **7**. Both cannot be used. Ask him |
| **Fig 2 panel order** | whiteboard says (a) PAML, (b) chi-square, (c) AUC; the built figure has chi-square first. The transcript says order is flexible, but the whiteboard is later |
| Which figures make the paper | 19 built, the target was 5 |

---

## 4. Repo changes worth knowing

- **`UPLOAD/`** is new: the curated set, one folder per cohort split, plus `master/`, `paml/`,
  `other/`, `figures/`. Rebuild with `python3 UPLOAD/scripts/build_upload.py`.
- **Two cohort eras are now physically separated.** Old results live in
  `UPLOAD/spreadsheets/legacy_353_OLD_COHORT/`, every file prefixed `LEGACY_353_`. The eras have
  **disjoint sample counts** (175/353/79/274/80/264 vs 744/922/205/717/191/700), so leakage is
  machine-checkable: `python3 UPLOAD/scripts/build_legacy_masters.py --verify`.
- **`teach/` was rewritten** on the 922 cohort, and `Runs.md` added on cluster failure modes.
- The whiteboard plan is transcribed at
  `miscellaneous/notes/2026-07-26-results-whiteboard.md`.

---

## 5. Numbers to quote, and one not to

**Safe:** Spearman +0.924 on 2376 genes. 2614 testable genes. 17 significant. eccD3 2dLL 3.91.
The clean set growing 1805 to 2614.

**Not yet:** eccB3's 6.02, pending verification. Anything from the three FASTER runs. Any figure
number, since 19 exist and the paper takes 6.

**Retired:** the old "+0.92 Spearman" is now superseded by +0.924 on the current cohort, and
"18 significant" was wrong (Rv2916c has a pinned omega). Neither ever left the repo.

---

## 6. For next week

1. eccB3 verdict, then finish or drop the eccD3/eccB3 pair framing
2. Last 238 PAML genes, then refresh Table 5 and Fig 2b
3. FASTER runs land, then build the three remaining `master/` folders and the consolidated sheet
4. Resolve the Table 7 vs 8 numbering with Ioerger
5. Choose 6 figures from the 19
