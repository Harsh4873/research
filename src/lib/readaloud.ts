import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Block } from '../model';

/** A chunk of text to speak, tied to the top-level block it belongs to. */
export interface SpeechSegment {
  blockIndex: number;
  text: string;
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=["'“(\[A-Z0-9])/;

/** Split prose into sentence-sized pieces so utterances stay short. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts = clean.split(SENTENCE_SPLIT);
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Very long clauses (no terminal punctuation) get chopped on separators.
    if (trimmed.length > 240) {
      let buffer = '';
      for (const piece of trimmed.split(/(?<=[,;:—-])\s+/)) {
        if ((buffer + piece).length > 240 && buffer) {
          out.push(buffer.trim());
          buffer = '';
        }
        buffer += `${piece} `;
      }
      if (buffer.trim()) out.push(buffer.trim());
    } else {
      out.push(trimmed);
    }
  }
  return out;
}

function readableTable(header: string[], rows: string[][]): string {
  const lines: string[] = [];
  const twoCol = header.length === 2;
  for (const row of rows) {
    if (twoCol) {
      const [a, b] = row;
      if (a && b) lines.push(`${a}: ${b}.`);
      else if (a) lines.push(`${a}.`);
    } else {
      lines.push(`${row.filter(Boolean).join(', ')}.`);
    }
  }
  return lines.join(' ');
}

function collectListText(list: Extract<Block, { type: 'list' }>, out: string[]) {
  for (const item of list.items) {
    if (item.text.trim()) out.push(item.text.trim());
    if (item.children) collectListText(item.children, out);
  }
}

/**
 * Flatten parsed blocks into ordered, speakable segments. Code and rules are
 * skipped; each segment records the index of the top-level block it came from
 * so the reader can highlight what is being spoken.
 */
export function speakableSegments(blocks: Block[]): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  const push = (blockIndex: number, text: string) => {
    for (const sentence of splitSentences(text)) segments.push({ blockIndex, text: sentence });
  };

  blocks.forEach((block, blockIndex) => {
    switch (block.type) {
      case 'heading':
        if (block.text.trim()) segments.push({ blockIndex, text: block.text.trim() });
        break;
      case 'para':
        push(blockIndex, block.text);
        break;
      case 'list': {
        const items: string[] = [];
        collectListText(block, items);
        for (const item of items) push(blockIndex, item);
        break;
      }
      case 'quote': {
        const inner = speakableSegments(block.blocks);
        for (const seg of inner) segments.push({ blockIndex, text: seg.text });
        break;
      }
      case 'table': {
        const text = readableTable(block.header, block.rows);
        if (text) push(blockIndex, text);
        break;
      }
      default:
        break;
    }
  });

  return segments;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export type ReadStatus = 'idle' | 'playing' | 'paused';

export interface ReadAloudControls {
  supported: boolean;
  status: ReadStatus;
  /** Index into the source blocks currently being spoken, or -1. */
  activeBlock: number;
  /** 0–1 progress across all segments. */
  progress: number;
  rate: number;
  toggle: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const lang = (navigator.language || 'en-US').toLowerCase();
  const byLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = byLang.length > 0 ? byLang : voices;
  // Prefer a natural-sounding local default when the platform exposes one.
  return (
    pool.find((v) => v.default) ??
    pool.find((v) => /natural|premium|enhanced|google|samantha|siri/i.test(v.name)) ??
    pool[0]
  );
}

/**
 * Read a list of segments aloud with play/pause/stop and a live speed control.
 * Utterances are queued one sentence at a time to dodge the long-utterance
 * cutoff bug in Chromium and to keep the active-block highlight responsive.
 */
export function useReadAloud(segments: SpeechSegment[]): ReadAloudControls {
  const supported = useMemo(speechSupported, []);
  const [status, setStatus] = useState<ReadStatus>('idle');
  const [pointer, setPointer] = useState(-1);
  const [rate, setRateState] = useState(1);

  const segmentsRef = useRef(segments);
  const pointerRef = useRef(-1);
  const rateRef = useRef(1);
  const statusRef = useRef<ReadStatus>('idle');
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const guardRef = useRef(0);

  segmentsRef.current = segments;
  rateRef.current = rate;
  statusRef.current = status;

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, [supported]);

  const setActive = useCallback((index: number) => {
    pointerRef.current = index;
    setPointer(index);
  }, []);

  const hardStop = useCallback(() => {
    guardRef.current += 1; // invalidate any in-flight utterance callbacks
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speakFrom = useCallback(
    (startIndex: number) => {
      if (!supported) return;
      const all = segmentsRef.current;
      if (startIndex >= all.length) {
        setStatus('idle');
        statusRef.current = 'idle';
        setActive(-1);
        return;
      }
      hardStop();
      const token = guardRef.current;
      setStatus('playing');
      statusRef.current = 'playing';

      const speakAt = (index: number) => {
        if (token !== guardRef.current) return;
        if (index >= segmentsRef.current.length) {
          setStatus('idle');
          statusRef.current = 'idle';
          setActive(-1);
          return;
        }
        setActive(index);
        const utterance = new SpeechSynthesisUtterance(segmentsRef.current[index].text);
        utterance.rate = rateRef.current;
        if (voiceRef.current) {
          utterance.voice = voiceRef.current;
          utterance.lang = voiceRef.current.lang;
        } else {
          utterance.lang = navigator.language || 'en-US';
        }
        utterance.onend = () => {
          if (token !== guardRef.current) return;
          speakAt(index + 1);
        };
        utterance.onerror = () => {
          if (token !== guardRef.current) return;
          speakAt(index + 1);
        };
        window.speechSynthesis.speak(utterance);
      };

      speakAt(startIndex);
    },
    [supported, hardStop, setActive],
  );

  const stop = useCallback(() => {
    hardStop();
    setStatus('idle');
    statusRef.current = 'idle';
    setActive(-1);
  }, [hardStop, setActive]);

  const toggle = useCallback(() => {
    if (!supported || segmentsRef.current.length === 0) return;
    if (statusRef.current === 'playing') {
      window.speechSynthesis.pause();
      setStatus('paused');
      statusRef.current = 'paused';
    } else if (statusRef.current === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      statusRef.current = 'playing';
    } else {
      speakFrom(0);
    }
  }, [supported, speakFrom]);

  const setRate = useCallback(
    (next: number) => {
      const clamped = Math.min(2, Math.max(0.5, next));
      setRateState(clamped);
      rateRef.current = clamped;
      // Apply immediately by restarting the current sentence at the new rate.
      if (statusRef.current === 'playing' || statusRef.current === 'paused') {
        speakFrom(Math.max(0, pointerRef.current));
      }
    },
    [speakFrom],
  );

  // Tear down on unmount and if the segment list changes out from under us.
  useEffect(() => () => hardStop(), [hardStop]);
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  const activeBlock = pointer >= 0 && pointer < segments.length ? segments[pointer].blockIndex : -1;
  const progress = segments.length > 0 && pointer >= 0 ? (pointer + 1) / segments.length : 0;

  return { supported, status, activeBlock, progress, rate, toggle, stop, setRate };
}
