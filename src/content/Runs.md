# Runs.md

Where the compute happens, what it costs, and how these jobs fail. Written 2026-07-24 after getting the
PAML rerun onto Grace, which took most of a day and surfaced about a dozen real bugs.

This is the doc to read before launching anything on a cluster. None of it is about biology.

---

## 1. The two clusters

| | FASTER | Grace |
|---|---|---|
| host | `FASTER login node` | `Grace login node` |
| balance | ~10000 SU, most reserved | ~20000 SU, institutional allocation |
| used for | the genomegaMap runs | the PAML rerun |
| home directory | **not shared** | **not shared** |
| `/scratch/user/<cluster-user>` | **shared between them** | **shared** |

**Scratch is shared, home is not.** That single fact explains the biggest failure of the week: a Grace
attempt at genomegaMap died in one second on every task with `libxerces-c-3.2.so: cannot open shared
object file`, because `gcat` needs Apache Xerces which is bundled only in the FASTER *home* build.

The local workstation is referred to as “galaxy.” Login uses institutional credentials.

**SU accounting:** SLURM reserves `tasks x walltime x cores` **whole, at submit**, and releases it as
tasks finish. So the number that has to fit your balance is the **reservation**, not the burn. A job
asking 250 tasks x 5 h reserves 1250 SU even if it uses 200.

**Duo on every connection.** Each `ssh` and each `scp` is a separate Duo push. Add this to
`~/.ssh/config` and they share one authentication for 8 hours:

```
Host Grace login node Grace login node
    User <cluster-user>
    ControlMaster auto
    ControlPath ~/.ssh/cm/%r@%h:%p
    ControlPersist 8h
```

---

## 2. Partition limits (Grace)

From `sinfo -o "%P %l"`:

| partition | max walltime |
|---|---|
| short | 2 h |
| medium | 24 h |
| **long** | **7 days** |
| xlong | 21 days |
| bigmem | 2 h |

**Check this before planning, not after.** The first PAML plan assumed a 48-hour wall, which forced
dropping 131 PE/PPE genes and 5 more that "could not finish in any wall". Grace allows 7 days. That one
wrong assumption was the entire reason for excluding a fifth of the compute. With the real limit,
**every gene runs and nothing is excluded**, for 8932 SU of the 20000 balance.

---

## 3. Why runtime is so uneven

codeml's cost is driven by the number of **distinct sequences** (tree tips), not by gene count or
isolate count, and it grows roughly as **tips^2.5**.

| | median | p90 | max |
|---|---|---|---|
| DB haplotypes | 7 | 24 | 178 |
| NDB haplotypes | 19 | 129 | 744 |

Most genes are cheap. A small tail is not. Concretely, for the 922-isolate PAML run:

- 2434 genes (93%) finish inside 3 hours of packed work
- 180 genes need their own long-wall array
- the worst single gene is ~112 hours on one core

**5% of the genes are 75% of the compute**, and they are almost all PE/PPE/PE-PGRS. Those are TB's
repetitive, poorly-alignable gene families. Their median is 345 distinct haplotypes out of 922 isolates
against 35 for every other gene. Nearly every isolate looking unique is the signature of alignment noise
in repetitive regions, not real biological variation. Whether to report them is a scientific decision
for the project lead; it is no longer a compute decision, because they fit.

### Bin packing is what makes it affordable
Because the reservation is set by the **slowest** task, striding genes through an array naively means
one task lands three huge genes and sets the wall for all 250. `scripts/plan_grace_tasks.py` sorts genes
by predicted cost and drops each into the emptiest task (the standard LPT heuristic, within 4/3 of
optimal for makespan). Genes too big for the main wall go to a second, longer array which is packed the
same way.

Leaving that second array at one gene per task cost **31490 SU**; packing it brought the identical genes
to **7682 SU**.

### The cost model must be measured, not assumed
Wall times come from one formula, `seconds(h) = a * (h/20)^b`. Get `a` wrong and every wall is wrong in
the same direction.

That happened. `a` was taken from Model 0 timings and reused for the stage-2 fit, which also runs
model=2 on top. Measured, stage 2 is **2.6x slower** than that curve: 40 tips took 144 s against 56 s
predicted, 60 tips took 393 s against 154 s. The plan had been giving a 6-hour wall to tasks needing
about 8. Every task would have been killed at the wall.

`grace/calibrate_cost.py` measures it. Re-run it after any change to the tree, the cohort, or the codeml
settings.

---

## 4. How these runs fail

Every failure below actually happened on this project. **None of them crash.** That is the whole
problem: the job runs, SLURM reports success, and you find out at merge time that the numbers are short
or from the wrong cohort.

| failure | what you see | what actually happened |
|---|---|---|
| **stale output** | 4018 finished traces two minutes after launch | leftovers from a prior run in the same scratch dir. The runner skips finished work, so the job was a silent no-op producing the previous cohort's numbers. |
| **wrong task path** | nothing, exit 0, "nothing to do" | slurms read `$RUN/tasks/...` but the tarball extracts to `$RUN/grace/tasks/...`. All 250 tasks no-opped. |
| **array smaller than the task list** | fewer rows than planned | the planner wrote 98 task files, the slurm still said `--array=1-96`. Two genes had no array slot and were never submitted. |
| **wrong cohort symlink** | plausible numbers, quietly wrong | there are eleven `filtered-fastas` directories on scratch with identical filenames. Point at the wrong one and it resolves fine; the collapse step just drops every isolate not in the tree. |
| **stale files after re-extract** | array/task mismatch | `tar` overwrites the files it carries and **deletes nothing**. Re-planning from 96 tasks to 46 leaves `task_047`..`task_096` behind. |
| **glibc mismatch** | `GLIBC_2.34 not found` | a binary compiled on galaxy will not run on Grace's older glibc. Fixed by linking statically. |
| **truncated resume** | a gene silently skipped forever | a task killed at the wall leaves a half-written last row. Counting that gene as done skips it permanently with garbage data. |
| **headerless output** | every column mis-keyed | a task killed during its first gene leaves a 0-byte file (the header was still buffered). Appending then produces a TSV whose first data row gets read as the header. |
| **`codeml --version`** | the task hangs for its full wall | PAML has no such flag. codeml prompts on stdin for a filename and waits forever. |

### The discipline that catches them

**1. `grace/preflight.sh` before every `sbatch`.** Costs 0 SU, takes seconds, and every check in it
corresponds to one of the rows above. It verifies codeml actually *runs* (not just that `ldd` is clean),
that the alignment isolate IDs **are** the tree's tips for that cohort, that every task list has an
array slot, that no task list is empty or duplicated, and that output directories start empty.

**2. Generate the `#SBATCH` lines, never hand-edit them.** `plan_grace_tasks.py` writes both the task
files and the `--array` / `--time` lines, and records the exact invocation in `plan_stage2.json`.
Hand-maintaining two things that must agree is how they drift, and they drifted three separate times.

**3. Run a canary first.** Eight tiny genes, 2 SU, two minutes, through the identical code path, with a
numbered failure for each stage so a failure says *which* thing broke. Two SU of real cluster output
beats any amount of reading the code.

**4. `rm -rf grace` before re-extracting the tarball.** See the stale-files row.

**5. A high finished-count right after launch means stale output, not success.** Check file dates.

---

## 5. The current PAML run

Launched 2026-07-24 23:29.

| | |
|---|---|
| genes | 2614, nothing excluded |
| main array | 250 tasks x 5 h, 2434 genes, `medium` partition |
| oversize array | 46 tasks x 167 h, 180 genes, `long` partition |
| reserved | 8932 SU of 20000 |
| expected burn | ~6157 core-hours |
| binary | statically linked codeml, identical on galaxy and Grace |

Genes are ordered **cheapest-first inside each task**, so partial output maximizes gene count: 112 of
the 180 oversize genes land within 72 hours instead of 84.

Check progress with `bash progress.sh` in the run directory, or:

```bash
cat out/stage2/*.tsv out/stage2_oversize/*.tsv 2>/dev/null | awk -F'\t' '$13=="ok"' | wc -l
```

Results stream to disk per gene, so `merge_tasks.py` works on partial output at any point and names
every gene that has not come back.

---

## 6. Where each run lives

| run | folder | cluster | state |
|---|---|---|---|
| genomegaMap DB vs NDB (922) | `db-vs-ndb12/` | FASTER | done, 4018 traces |
| PAML branch model (922) | `FinalPaml/` | **Grace** | running |
| genomegaMap combined (922 pooled) | `combined/` | FASTER | inputs built, not run |
| genomegaMap drug R vs S | `drug-resistance-genes/` | FASTER | inputs built, not run |
| genomegaMap lineage L2 vs L4 | `lineage-comp/` | FASTER | inputs built, not run |

genomegaMap costs roughly 1.5 to 1.9 seconds per codon at 744 isolates for 10000 MCMC iterations, about
700 core-hours for all 4018 genes. Each folder has its own `commands.md` with the recipe.

---

## 7. Rules of thumb

1. **Measure the cost model before reserving anything.** A wrong constant is invisible and expensive.
2. **The reservation is what must fit the balance**, not the burn.
3. **Check the partition limits first.** They change what is possible more than any optimisation.
4. **Order work cheapest-first** when partial results are useful, which is always.
5. **Assume every failure is silent** and build the check that would catch it. If the check is a script
   rather than a paragraph, it outlives the session that wrote it.
