/** Inline run inside a block of text. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export interface ListItem {
  inlines: Inline[];
  text: string;
  children?: ListBlock;
}

export interface HeadingBlock {
  type: 'heading';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  inlines: Inline[];
  text: string;
  id: string;
}

export interface ParaBlock {
  type: 'para';
  inlines: Inline[];
  text: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
}

export interface TableBlock {
  type: 'table';
  header: string[];
  rows: string[][];
}

export interface QuoteBlock {
  type: 'quote';
  blocks: Block[];
}

export interface CodeBlock {
  type: 'code';
  lang: string;
  code: string;
}

export interface RuleBlock {
  type: 'rule';
}

export type Block =
  | HeadingBlock
  | ParaBlock
  | ListBlock
  | TableBlock
  | QuoteBlock
  | CodeBlock
  | RuleBlock;

export interface ParsedDoc {
  title?: string;
  /** Lower-cased YAML front matter keys, when the document has any. */
  meta?: Record<string, string>;
  blocks: Block[];
}

/** Where a term card was harvested from. */
export type TermSource = 'bold' | 'colon' | 'table' | 'qa' | 'section';

export interface TermCard {
  id: string;
  term: string;
  definition: string;
  section: string;
  source: TermSource;
}

export interface ClozeCard {
  id: string;
  /** Sentence with the answer replaced by `____`. */
  prompt: string;
  answer: string;
  section: string;
}

export interface OutlineNode {
  id: string;
  title: string;
  depth: number;
}

export interface DocStats {
  words: number;
  readingMinutes: number;
  sections: number;
  terms: number;
  clozes: number;
}

export interface StudyMaterial {
  doc: ParsedDoc;
  terms: TermCard[];
  clozes: ClozeCard[];
  outline: OutlineNode[];
  stats: DocStats;
}

export interface StudySet {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

/** Mastery ladder: 0 = unseen, 1 = learning, 2 = almost, 3 = mastered. */
export type Box = 0 | 1 | 2 | 3;

export interface CardProgress {
  box: Box;
  seen: number;
  correct: number;
  wrong: number;
  starred: boolean;
  last: number;
}

export interface SetProgress {
  cards: Record<string, CardProgress>;
  bestMatchMs?: number;
}

export type Theme = 'auto' | 'light' | 'dark';

export interface AppData {
  version: 1;
  sets: StudySet[];
  progress: Record<string, SetProgress>;
  /** Deleted set ids → deletion time, so deletions propagate through sync. */
  tombstones: Record<string, number>;
  theme: Theme;
}

export type SyncState = 'off' | 'connecting' | 'syncing' | 'synced' | 'error';

export interface SyncStatus {
  state: SyncState;
  email?: string;
  error?: string;
}

/** Recall studies a set; Review reads a paper. Each has its own tabs. */
export const STUDY_MODES = ['notes', 'cards', 'quiz', 'blanks', 'match'] as const;
export const PAPER_MODES = ['notes', 'data', 'claims', 'find', 'skim'] as const;
export const MODES = ['notes', 'cards', 'quiz', 'blanks', 'match', 'data', 'claims', 'find', 'skim'] as const;
export type Mode = (typeof MODES)[number];
export type StudyMode = (typeof STUDY_MODES)[number];
export type PaperMode = (typeof PAPER_MODES)[number];

export function emptyCardProgress(): CardProgress {
  return { box: 0, seen: 0, correct: 0, wrong: 0, starred: false, last: 0 };
}
