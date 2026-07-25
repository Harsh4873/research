# Architecture

Recall is a fully client-side React + Vite single-page app. There is no backend, no accounts, and no network I/O at runtime; the deployed site is static files on GitHub Pages served under `/research/`.

## Pipeline

```
markdown text
  → lib/markdown.ts   parse to a block model (headings, paragraphs, lists, tables, quotes, code)
  → lib/extract.ts    derive study material: term/definition cards, cloze sentences, section outline, stats
  → lib/questions.ts  build multiple-choice quizzes and match rounds (seeded RNG, word-overlap distractors)
  → components/*      study modes render the derived material
```

Study material is always **derived** from the stored markdown at load time (memoized per set). Storage keeps only the source markdown plus progress, so extraction improvements apply retroactively to existing sets.

## Modules

- `src/lib/markdown.ts` — small deterministic Markdown parser producing typed blocks with inline runs (bold, italic, code, links). ATX headings only; front matter is skipped (a `title:` is honored).
- `src/lib/extract.ts` — heuristics that turn blocks into cards: bold-term bullets (`**Term** — definition`), plain `Term: definition` bullets, two-plus-column tables, `Q:`/`A:` pairs, and cloze sentences built by blanking a bold phrase or a known term inside prose sentences. Cards get stable content-hash ids so progress survives re-parsing.
- `src/lib/questions.ts` — quiz builder (term→definition, definition→term, and cloze multiple choice) with distractors preferred by word overlap, plus match-round sampling. Uses a seeded mulberry32 PRNG so tests are deterministic.
- `src/lib/answer.ts` — typed-answer checking: Unicode/diacritic normalization, punctuation and leading-article stripping, and length-scaled Levenshtein tolerance.
- `src/lib/store.ts` — versioned `localStorage` persistence (`recall.data.v1`) for sets, per-card progress boxes, match best times, and theme preference. Works against an injectable storage so tests run in Node without a DOM.
- `src/App.tsx` — hash router (`#/`, `#/set/<id>/<mode>`) so deep links work on GitHub Pages without a SPA fallback.
- `public/sw.js` — cache-first app-shell service worker; its activate step also deletes caches left behind by the previous app that lived at this scope.

## Testing

Vitest (Node environment) covers the parser, extraction heuristics, question building, answer checking, and storage round-trips. `npm run build` type-checks then produces `dist/`, which the Pages workflow verifies before deploying.
