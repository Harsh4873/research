import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Monitor, Moon, Sun } from 'lucide-react';
import type { AppData, Mode, StudyMaterial, StudySet, SyncStatus, Theme } from './model';
import { MODES } from './model';
import type { CloudEngine } from './lib/cloud';
import { extractStudyMaterial } from './lib/extract';
import {
  deleteSet,
  exportSetJson,
  getProgress,
  loadAccountData,
  loadData,
  loadOrAdoptOwnerVaultData,
  nextDataTimestamp,
  readActiveAccountId,
  recordAnswer,
  saveAccountData,
  saveData,
  toggleStar,
  upsertSet,
  withProgress,
  writeActiveAccountId,
} from './lib/store';
import { recordBestMatch } from './lib/sync-core';
import { SetShell } from './components/SetShell';
import { SyncMenu } from './components/SyncMenu';
import { ReviewView, type BulkOutcome, type ImportStatus, type PaperDraft } from './components/ReviewView';
import { appendPaperNote, applyPaperRefresh, createPaperSet, isPaperSet, paperFrontMatter, paperIdentity } from './lib/paper-set';
import { parsePaperId, parsePaperIds, describePaperId } from './lib/paper-id';
import { deletePdf, getPdf, putPdf } from './lib/pdf-store';

/** A reference list can be long; keep one paste from running away. */
const MAX_BULK_LOOKUPS = 120;

const SYNC_FLAG_KEY = 'recall.sync.on';

function syncFlag(): boolean {
  try {
    return localStorage.getItem(SYNC_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function setSyncFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(SYNC_FLAG_KEY, '1');
    else localStorage.removeItem(SYNC_FLAG_KEY);
  } catch {
    /* storage blocked */
  }
}

type Route =
  | { view: 'review' }
  | { view: 'set'; setId: string; mode: Mode };

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'set' && parts[1]) {
    const mode = (MODES as readonly string[]).includes(parts[2])
      ? (parts[2] as Mode)
      : 'skim';
    return { view: 'set', setId: parts[1], mode };
  }
  // Flashcards moved to harsh.bet/quizlet/; old hashes land on papers.
  return { view: 'review' };
}

function navigate(hash: string) {
  window.location.hash = hash;
}

export default function App() {
  const activeAccountRef = useRef<string | null>(readActiveAccountId());
  const [data, setData] = useState<AppData>(() => (
    activeAccountRef.current ? loadAccountData(activeAccountRef.current) : loadData()
  ));
  const dataRef = useRef(data);
  dataRef.current = data;
  const [route, setRoute] = useState<Route>(parseHash);
  const [notice, setNotice] = useState<string | null>(null);
  const [pdfSession, setPdfSession] = useState<{
    id: string;
    status: 'loading' | 'checking' | 'ready' | 'missing';
    bytes: ArrayBuffer | null;
  }>({ id: '', status: 'missing', bytes: null });
  const pdfToken = useRef(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'off' });
  const cloudRef = useRef<CloudEngine | null>(null);

  const bootCloud = async (): Promise<CloudEngine> => {
    const { startCloud } = await import('./lib/cloud');
    const engine = startCloud({
      onStatus: setSyncStatus,
      onAccount: (vaultId, legacyUid) => {
        const previousUid = activeAccountRef.current;
        if (previousUid === vaultId) return dataRef.current;

        if (previousUid) {
          saveAccountData(previousUid, dataRef.current);
        }

        const next = loadOrAdoptOwnerVaultData(
          vaultId,
          legacyUid,
          previousUid,
          dataRef.current,
        );
        activeAccountRef.current = vaultId;
        writeActiveAccountId(vaultId);
        dataRef.current = next;
        setData(next);
        return next;
      },
      onRemote: (fold) => setData((d) => fold(d)),
    });
    cloudRef.current = engine;
    return engine;
  };

  useEffect(() => {
    if (syncFlag()) void bootCloud();
  }, []);

  const enableSync = async () => {
    setSyncFlag(true);
    const engine = await bootCloud();
    await engine.signIn();
  };

  const switchSyncAccount = async () => {
    setSyncFlag(true);
    const engine = await bootCloud();
    await engine.switchAccount();
  };

  const disableSync = async () => {
    setSyncFlag(false);
    setSyncStatus({ state: 'off' });
    await cloudRef.current?.signOut();
  };

  useEffect(() => {
    const onHash = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
      if (raw[0] === 'flashcards' || raw[0] === 'recall') {
        navigate('/papers');
        return;
      }
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const uid = activeAccountRef.current;
    if (uid) saveAccountData(uid, data);
    else saveData(data);
    cloudRef.current?.push(data);
  }, [data]);

  useEffect(() => {
    const root = document.documentElement;
    if (data.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = data.theme;
  }, [data.theme]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const materialCache = useRef(new Map<string, StudyMaterial>());
  const materialFor = (set: StudySet): StudyMaterial => {
    const key = `${set.id}:${set.updatedAt}`;
    let material = materialCache.current.get(key);
    if (!material) {
      material = extractStudyMaterial(set.markdown);
      materialCache.current.set(key, material);
      if (materialCache.current.size > 50) {
        const first = materialCache.current.keys().next().value;
        if (first) materialCache.current.delete(first);
      }
    }
    return material;
  };

  const removeSet = (set: StudySet) => {
    if (!window.confirm(`Remove “${set.title}” and its progress? This also removes it from synced devices.`)) return;
    void deletePdf(set.id);
    setData((d) => deleteSet(d, set.id, nextDataTimestamp(d)));
    if (route.view === 'set' && route.setId === set.id) navigate('/papers');
  };

  /** Review: resolve a PMID / PMCID / DOI into study markdown. */
  const lookupPaper = async (query: string, onStatus: ImportStatus): Promise<PaperDraft> => {
    const id = parsePaperId(query);
    if (!id) throw new Error('That does not look like a PMID, PMCID, or DOI.');
    onStatus(`Looking up ${describePaperId(id)}…`);
    const { lookupPaper: lookup } = await import('./lib/europepmc');
    const result = await lookup(id);
    onStatus('Building study material…');
    return { ...result, note: result.openAccessNote };
  };

  /** Review: read a PDF entirely on this device. */
  const importPdf = async (file: File, onStatus: ImportStatus): Promise<PaperDraft> => {
    onStatus('Opening the PDF…');
    const { pdfToMarkdown } = await import('./lib/pdf-import');
    const pdf = await file.arrayBuffer();
    const conversion = await pdfToMarkdown(pdf, {
      fallbackTitle: file.name,
      onProgress: ({ page, pages, sections }) =>
        onStatus(`Reading page ${page} of ${pages}…`, { sections }),
    });
    onStatus('Building the skim…');
    return {
      ...conversion,
      fullText: true,
      pdf,
      note: 'Extracted from your PDF on this device. Layout-based extraction is best effort. Use the pencil icon to fix anything that came out wrong.',
    };
  };

  /** Review: resolve a whole reference list, one paper at a time. */
  const lookupPapers = async (text: string, onStatus: ImportStatus): Promise<BulkOutcome> => {
    const found = parsePaperIds(text);
    const ids = found.slice(0, MAX_BULK_LOOKUPS);
    const { lookupPaper: lookup } = await import('./lib/europepmc');
    const drafts: PaperDraft[] = [];
    const failures: BulkOutcome['failures'] = [];
    const seen = new Set(data.sets.filter((s) => isPaperSet(s.id)).map((s) => paperIdentity(paperFrontMatter(s.markdown))));

    for (const [index, id] of ids.entries()) {
      onStatus(`Fetching ${index + 1} of ${ids.length} — ${describePaperId(id)}…`);
      try {
        const result = await lookup(id);
        const identity = paperIdentity(result.meta);
        if (seen.has(identity)) continue;
        seen.add(identity);
        drafts.push({ ...result, note: result.openAccessNote });
      } catch (error) {
        failures.push({ label: describePaperId(id), message: (error as Error)?.message ?? 'Lookup failed.' });
      }
    }
    if (found.length > ids.length) {
      failures.push({
        label: `${found.length - ids.length} more identifiers`,
        message: `Only the first ${MAX_BULK_LOOKUPS} were fetched.`,
      });
    }
    return { drafts, failures };
  };

  const readReferenceFile = async (file: File): Promise<string> => {
    const { readReferenceFile: read } = await import('./lib/reference-file');
    return read(file);
  };

  const savePaper = async (draft: PaperDraft) => {
    const created = createPaperSet(
      draft.meta.title,
      draft.markdown,
      nextDataTimestamp(dataRef.current),
    );
    if (draft.pdf) {
      try {
        await putPdf(created.id, draft.pdf.slice(0));
      } catch {
        /* the paper still opens from its text */
      }
    }
    setData((d) => upsertSet(d, created));
    navigate(`/set/${created.id}/skim`);
  };

  /**
   * Re-fetch a saved paper from its own identifier and keep the better result.
   * A paper saved before an extraction improvement — or before its full text
   * was reachable — stays as it was imported, so the fix has to be applied to
   * the library, not only to the next import.
   */
  const refreshPaper = async (set: StudySet): Promise<string> => {
    const front = paperFrontMatter(set.markdown);
    const identifier = front.pmcid ?? front.pmid ?? front.doi;
    if (!identifier) return 'This paper has no identifier to re-fetch it by.';
    const id = parsePaperId(identifier);
    if (!id) return 'This paper has no identifier to re-fetch it by.';

    const wasAbstractOnly = /PubMed abstract/i.test(front.source ?? '');
    try {
      const { lookupPaper: lookup } = await import('./lib/europepmc');
      const result = await lookup(id);
      if (wasAbstractOnly === false && !result.fullText) {
        return 'The source only offered the abstract this time, so the saved copy was kept.';
      }
      // Merge inside the updater against the live copy, so notes written while
      // the request was in flight survive the refresh.
      let changed = false;
      setData((d) => {
        const current = d.sets.find((candidate) => candidate.id === set.id) ?? set;
        const merged = applyPaperRefresh(current.markdown, result.markdown);
        if (merged.trim() === current.markdown.trim()) return d;
        changed = true;
        return upsertSet(d, { ...current, markdown: merged, updatedAt: nextDataTimestamp(d) });
      });
      if (!changed) return 'Already up to date — nothing changed.';
      if (wasAbstractOnly && result.fullText) return `Full text found. ${result.openAccessNote}`;
      return 'Re-fetched from the source.';
    } catch (error) {
      return (error as Error)?.message ?? 'That re-fetch failed.';
    }
  };

  const savePapers = (drafts: PaperDraft[]) => {
    if (drafts.length === 0) return;
    setData((d) => drafts.reduce((acc, draft) => {
      const created = createPaperSet(draft.meta.title, draft.markdown, nextDataTimestamp(acc));
      if (draft.pdf) void putPdf(created.id, draft.pdf.slice(0));
      return upsertSet(acc, created);
    }, d));
    setNotice(`Added ${drafts.length} paper${drafts.length === 1 ? '' : 's'}.`);
  };

  const exportSet = (set: StudySet) => {
    const blob = new Blob([exportSetJson(set)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${set.title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'research-paper'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const answerFor = (setId: string) => (cardId: string, correct: boolean) => {
    setData((d) => withProgress(
      d,
      setId,
      recordAnswer(getProgress(d, setId), cardId, correct, nextDataTimestamp(d)),
    ));
  };

  const starFor = (setId: string) => (cardId: string) => {
    setData((d) => withProgress(
      d,
      setId,
      toggleStar(getProgress(d, setId), cardId, nextDataTimestamp(d)),
    ));
  };

  const bestTimeFor = (setId: string) => (ms: number) => {
    setData((d) => withProgress(
      d,
      setId,
      recordBestMatch(getProgress(d, setId), ms, nextDataTimestamp(d)),
    ));
  };

  const saveMarkdown = (set: StudySet) => (markdown: string) => {
    setData((d) => {
      const current = d.sets.find((candidate) => candidate.id === set.id) ?? set;
      return upsertSet(d, { ...current, markdown, updatedAt: nextDataTimestamp(d) });
    });
  };

  const appendNote = (set: StudySet) => (note: string) => {
    // Append inside the updater against the live copy, so a note written while
    // a re-fetch is in flight cannot clobber the refreshed content.
    setData((d) => {
      const current = d.sets.find((candidate) => candidate.id === set.id) ?? set;
      const markdown = appendPaperNote(current.markdown, note);
      return upsertSet(d, { ...current, markdown, updatedAt: nextDataTimestamp(d) });
    });
    setNotice('Note added. Your study material has been refreshed.');
  };

  const cycleTheme = () => {
    const order: Theme[] = ['auto', 'light', 'dark'];
    setData((d) => ({ ...d, theme: order[(order.indexOf(d.theme) + 1) % order.length] }));
  };

  const paperData: AppData = {
    ...data,
    sets: data.sets.filter((set) => isPaperSet(set.id)),
  };

  const activeSet = route.view === 'set'
    ? paperData.sets.find((s) => s.id === route.setId)
    : undefined;

  useEffect(() => {
    if (route.view === 'set' && !activeSet) navigate('/papers');
  }, [route, activeSet]);

  useEffect(() => {
    if (!activeSet) return;
    const setId = activeSet.id;
    const pmcid = paperFrontMatter(activeSet.markdown).pmcid;
    const token = ++pdfToken.current;
    const controller = new AbortController();
    setPdfSession({ id: setId, status: 'loading', bytes: null });
    void (async () => {
      const local = await getPdf(setId);
      if (pdfToken.current !== token) return;
      if (local) {
        setPdfSession({ id: setId, status: 'ready', bytes: local });
        return;
      }
      if (!pmcid) {
        setPdfSession({ id: setId, status: 'missing', bytes: null });
        return;
      }
      setPdfSession({ id: setId, status: 'checking', bytes: null });
      try {
        const { fetchOpenAccessPdf } = await import('./lib/europepmc');
        const remote = await fetchOpenAccessPdf(pmcid, controller.signal);
        if (pdfToken.current !== token) return;
        if (!remote) {
          setPdfSession({ id: setId, status: 'missing', bytes: null });
          return;
        }
        await putPdf(setId, remote.slice(0)).catch(() => undefined);
        if (pdfToken.current !== token) return;
        setPdfSession({ id: setId, status: 'ready', bytes: remote });
      } catch {
        if (pdfToken.current !== token) return;
        setPdfSession({ id: setId, status: 'missing', bytes: null });
      }
    })();
    return () => controller.abort();
  }, [activeSet?.id]);

  const attachPdf = async (file: File) => {
    if (!activeSet) return;
    const token = ++pdfToken.current;
    const bytes = await file.arrayBuffer();
    try {
      await putPdf(activeSet.id, bytes.slice(0));
    } catch {
      /* still show it for this session */
    }
    if (pdfToken.current !== token) return;
    setPdfSession({ id: activeSet.id, status: 'ready', bytes });
  };

  const pdfBytes = activeSet && pdfSession.id === activeSet.id ? pdfSession.bytes : null;
  const pdfStatus = activeSet && pdfSession.id === activeSet.id ? pdfSession.status : 'loading';

  const themeIcon = data.theme === 'light' ? <Sun size={16} aria-hidden /> : data.theme === 'dark' ? <Moon size={16} aria-hidden /> : <Monitor size={16} aria-hidden />;

  return (
    <div className={`app-shell${route.view === 'set' ? ' app-shell-reader' : ''}`}>
      <header className="app-header">
        <div className="header-inner">
          <button type="button" className="brand" onClick={() => navigate('/papers')}>
            <span className="brand-badge">
              <GraduationCap size={18} aria-hidden />
            </span>
            Research
          </button>
          <nav className="header-nav" aria-label="Sections">
            <button
              type="button"
              className={`header-tab header-tab-papers ${route.view === 'review' ? 'header-tab-active' : ''}`}
              onClick={() => navigate('/papers')}
            >
              Papers
            </button>
          </nav>
          <div className="header-actions">
            <SyncMenu
              status={syncStatus}
              onEnable={() => void enableSync()}
              onSignOut={() => void disableSync()}
              onSwitchAccount={() => void switchSyncAccount()}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={cycleTheme}
              title={`Theme: ${data.theme}`}
              aria-label={`Theme: ${data.theme}. Click to change.`}
            >
              {themeIcon} {data.theme === 'auto' ? 'Auto' : data.theme === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {notice && (
          <div className="notice fade-in" role="status">
            {notice}
          </div>
        )}
        {route.view === 'set' && activeSet ? (
          <SetShell
            key={activeSet.id}
            set={activeSet}
            material={materialFor(activeSet)}
            progress={getProgress(data, activeSet.id)}
            mode={route.mode}
            onNavigate={(mode) => navigate(`/set/${activeSet.id}/${mode}`)}
            onBack={() => navigate('/papers')}
            backLabel="Papers"
            onAnswer={answerFor(activeSet.id)}
            onToggleStar={starFor(activeSet.id)}
            onBestTime={bestTimeFor(activeSet.id)}
            onSaveMarkdown={saveMarkdown(activeSet)}
            onAddNote={appendNote(activeSet)}
            onDelete={() => removeSet(activeSet)}
            onExport={() => exportSet(activeSet)}
            onRefresh={refreshPaper}
            pdfBytes={pdfBytes}
            pdfStatus={pdfStatus}
            onAttachPdf={(file) => void attachPdf(file)}
          />
        ) : (
          <ReviewView
            data={paperData}
            materialFor={materialFor}
            onLookup={lookupPaper}
            onLookupMany={lookupPapers}
            onImportPdf={importPdf}
            onReadReferenceFile={readReferenceFile}
            onSave={savePaper}
            onSaveMany={savePapers}
            onOpen={(set) => navigate(`/set/${set.id}/skim`)}
            onDelete={removeSet}
            onExport={exportSet}
          />
        )}
      </main>

      <footer className="app-footer">
        Papers stay on this device. Turn on Sync only if you want them on your other devices.
      </footer>
    </div>
  );
}
