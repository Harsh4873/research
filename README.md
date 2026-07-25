# Recall

Recall is the owner's personal study tool, published at `https://harsh.bet/research/` from the standalone `Harsh4873/research` repository. Paste or upload Markdown notes and Recall turns them into study material — flashcards, quizzes, fill-in-the-blanks, matching games, and a clean reading view.

## What it does

- Imports `.md` / `.txt` notes by paste, file picker, or drag-and-drop; each document becomes a study set.
- Extracts term–definition pairs from bold-term bullets, `Term: definition` lines, two-column tables, and `Q:`/`A:` pairs.
- Generates fill-in-the-blank sentences from bold phrases and known terms found in prose.
- Study modes: **Notes** (rendered outline + glossary), **Flashcards** (flip, star, self-grade), **Quiz** (multiple choice with distractors), **Blanks** (typed answers with fuzzy matching and hints), and **Match** (timed pairing game).
- Tracks per-card mastery (learning → almost → mastered) and per-set progress, with a "focus weak cards" filter in every mode.
- Exports and re-imports sets as JSON.

## Privacy boundary

Everything runs in the browser. Notes, generated cards, and progress live in `localStorage` on the device; nothing is uploaded anywhere and there are no accounts, no analytics, and no API calls.

## Local development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

## Deployment

Push to `main`; GitHub Actions tests, builds, and publishes `/research/` to GitHub Pages directly from this repository. There is no backend to deploy.
