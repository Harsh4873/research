import type { AppData, StudySet } from '../model';
import genomegaMap from '../content/GenomegaMap.md?raw';
import ndb12Update from '../content/NDB12_Update.md?raw';
import paml from '../content/PAML.md?raw';
import pnps from '../content/PNPS.md?raw';
import projectOverview from '../content/README.md?raw';
import runs from '../content/Runs.md?raw';
import significance from '../content/Significance.md?raw';
import { hashId } from './extract';

const BUNDLED_AT = Date.UTC(2026, 6, 24);

function bundledSet(id: string, title: string, markdown: string): StudySet {
  return { id: `bundled-${id}`, title, markdown, createdAt: BUNDLED_AT, updatedAt: BUNDLED_AT };
}

/** Research notes that ship with Recall and remain ordinary, removable sets. */
export const BUNDLED_SETS: readonly StudySet[] = [
  bundledSet('overview', 'Project overview', projectOverview),
  bundledSet('genomegamap', 'GenomegaMap', genomegaMap),
  bundledSet('paml', 'PAML', paml),
  bundledSet('pnps', 'pN/pS', pnps),
  bundledSet('significance', 'Significance', significance),
  bundledSet('ndb12-update', 'NDB12 update', ndb12Update),
  bundledSet('runs', 'Compute runs', runs),
];

/**
 * Installs bundled notes once. A deletion tombstone keeps a removed bundle from
 * returning, and content matching avoids duplicating a file the owner already
 * imported before this bundle shipped.
 */
export function withBundledSets(data: AppData): AppData {
  const contentIds = new Set(data.sets.map((set) => hashId(set.markdown)));
  const additions = BUNDLED_SETS.filter((set) => (
    !data.tombstones[set.id]
    && !data.sets.some((existing) => existing.id === set.id)
    && !contentIds.has(hashId(set.markdown))
  ));
  return additions.length ? { ...data, sets: [...additions, ...data.sets] } : data;
}
