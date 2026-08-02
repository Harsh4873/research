# Architecture

Recall is a client-side React + Vite single-page app; the deployed site is static files on GitHub Pages served under `/research/`. There is no app server. The only runtime network I/O is the optional Firebase sync (Google auth + Firestore), which stays completely unloaded until the user turns Sync on.

## Pipeline

```
markdown text
  → lib/markdown.ts   parse to a block model (headings, paragraphs, lists, tables, quotes, code)
  → lib/extract.ts    derive explicit concepts, section recall cards, contextual clozes, outline, stats
  → lib/questions.ts  build multiple-choice quizzes and match rounds (seeded RNG, word-overlap distractors)
  → components/*      study modes render the derived material
```

Study material is always **derived** from the stored markdown at load time (memoized per set). Storage keeps only the source markdown plus progress, so extraction improvements apply retroactively to existing sets.

## Modules

- `src/lib/markdown.ts` — small deterministic Markdown parser producing typed blocks with inline runs (bold, italic, code, links). ATX headings only; front matter is skipped (a `title:` is honored).
- `src/lib/extract.ts` — deterministic semantic heuristics that turn blocks into cards: bold definition sentences, bold-term bullets (`**Term** — definition`), plain `Term: definition` bullets, two-plus-column tables, `Q:`/`A:` pairs, and section recall questions backed by the section's opening explanation. Cloze sentences blank bounded concepts rather than arbitrary emphasized words, with generic status words and oversized claims filtered out. Cards get stable content-hash ids so progress survives re-parsing.
- `src/lib/bundled.ts` and `src/content/` — nine privacy-scrubbed research documents installed as ordinary sets. Content hashing prevents duplicate imports, and deletion tombstones stop removed bundled sets from returning.
- `src/lib/speech.ts` — optional browser-native speech recognition for the Notes composer. Audio is not stored by Recall; support and speech processing depend on the browser.
- `src/lib/questions.ts` — quiz builder (term→definition, definition→term, and cloze multiple choice) with distractors preferred by word overlap, plus match-round sampling. Uses a seeded mulberry32 PRNG so tests are deterministic.
- `src/lib/answer.ts` — typed-answer checking: Unicode/diacritic normalization, punctuation and leading-article stripping, and length-scaled Levenshtein tolerance.
- `src/lib/store.ts` — versioned `localStorage` persistence (`recall.data.v1`) for sets, per-card progress boxes, match best times, and theme preference. Works against an injectable storage so tests run in Node without a DOM.
- `src/App.tsx` — hash router (`#/`, `#/set/<id>/<mode>`) so deep links work on GitHub Pages without a SPA fallback.
- `public/sw.js` — cache-first app-shell service worker; its activate step also deletes caches left behind by the previous app that lived at this scope.

## Review (papers → markdown)

Review reuses the whole study pipeline; it only adds a front end that produces markdown from a paper. A Review paper is an ordinary `StudySet` whose id carries a `paper-` prefix (`src/lib/paper-set.ts`), so it syncs, exports, and studies with no schema or rules change. Paper metadata rides in YAML front matter, which `parseMarkdown` now returns as `meta`.

```
PMID / PMCID / DOI ─→ lib/paper-id.ts     parse and normalise the identifier
                   ─→ lib/europepmc.ts    Europe PMC metadata, then full text;
                                          NCBI E-utilities as metadata fallback
                   ─→ lib/jats.ts         JATS XML → sectioned study markdown
PDF file           ─→ lib/pdf-import.ts   PDF.js text runs (lazy-loaded)
                   ─→ lib/pdf-layout.ts   lines, columns, headings, tables → markdown
                                        ↓
                              the same extract → questions pipeline
```

- `src/lib/xml.ts` — a small dependency-free well-formed-XML parser, so JATS parsing behaves identically in the browser and in Node tests without a DOM implementation.
- `src/lib/reference-file.ts` — reads a reference list out of a dropped file, including `.docx` (a minimal central-directory ZIP reader plus `DecompressionStream('deflate-raw')`, then the same XML parser over `word/document.xml`).
- Bulk import: `parsePaperIds` scans free text for every identifier, matching bare numbers only in the 7–8 digit PMID range so years, volumes, and page numbers are not mistaken for ids. Because a reference list cites one paper by PMID, DOI, *and* PMCID, results are collapsed by `paperIdentity` after resolution — the real list this was built against yields 98 identifiers and 37 distinct papers.
- `src/lib/jats.ts` — the converter. Floats render in place under level-4 headings so they stay navigable without becoming section questions; reference lists are collected once from anywhere in the article; equations published only as images are counted and explained rather than stamped as empty placeholders; licences are normalised to short labels (`CC BY-NC`).
- `src/lib/pdf-layout.ts` — pure layout reconstruction (spans → lines → cells → blocks) so every heuristic is unit-tested without a PDF engine. `pdf-import.ts` is the thin PDF.js bridge and uses the **legacy** build, because the modern one calls platform APIs (`Math.sumPrecise`, `Map.getOrInsertComputed`) that most shipping browsers lack.
- Markdown is shaped for the extractor: glossary bullets and two-column tables become term cards, prose sections become recall prompts, and citation/keyword lines are deliberately written without bold or `Term: value` shapes so they cannot turn into junk cards.
- `extract.ts` skips publishing apparatus (references, acknowledgements, funding, conflicts) entirely, and skips section-question generation for headings that make poor questions (glossary, contents, supplementary material) while still mining their contents.

## Sync

Sync is optional and lazy: `src/lib/cloud.ts` (and the Firebase SDK with it) is `import()`ed only when the user enables Sync or has it enabled from a previous session (`recall.sync.on` flag).

- `src/firebase.ts` — shared-project Firebase init (named app, persistent Firestore cache, Google provider). The web config is public by design; access control lives in the rules.
- `src/lib/sync-core.ts` — pure, unit-tested merge logic. Sets replicate to `recall_users/{uid}/sets/{setId}` and progress to `recall_users/{uid}/progress/{setId}`. Deletions write tombstones (`deleted`, `deletedAt`) so they propagate; live docs win by `updatedAt` (last writer wins), per-card progress wins by `last` touch, and match best-times keep the minimum. `planPush` diffs local state against the last-known remote index so only strictly-newer docs are written.
- `src/lib/cloud.ts` — Firestore adapter: snapshot listeners fold remote changes into app state, local changes push through a debounced diff, and auth uses popup sign-in with a redirect fallback for installed PWAs. Permission errors surface a "deploy the rules" message rather than failing silently.
- `firestore.rules` — the complete ruleset for every app in the shared Firebase project; Recall's block validates doc shapes, enforces the owner-only Google account, keeps `createdAt` immutable, and requires monotonic `updatedAt`. Covered by `tests/firestore.rules.test.ts` against the emulator (`npm run test:rules`).

## Testing

Vitest (Node environment) covers the parser, extraction heuristics, question building, answer checking, and storage round-trips. `npm run build` type-checks then produces `dist/`, which the Pages workflow verifies before deploying.
