import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternativeLike;
}

interface RecognitionResultListLike {
  readonly length: number;
  [index: number]: RecognitionResultLike;
}

interface RecognitionEventLike {
  results: RecognitionResultListLike;
}

interface RecognitionErrorLike {
  error?: string;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function speechError(code?: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone access is blocked. Allow it in your browser settings and try again.';
  if (code === 'audio-capture') return 'No microphone was found.';
  if (code === 'network') return 'Dictation could not reach the browser speech service.';
  if (code === 'no-speech') return 'No speech was detected. Try again when you are ready.';
  return 'Dictation stopped unexpectedly. You can keep typing or try again.';
}

function joinTranscript(base: string, transcript: string): string {
  if (!base) return transcript.trimStart();
  if (!transcript) return base;
  return `${base.trimEnd()} ${transcript.trimStart()}`;
}

/** Browser-native speech recognition wired to a controlled text field. */
export function useSpeechInput(value: string, onChange: (value: string) => void) {
  const recognitionRef = useRef<RecognitionLike>();
  const baseRef = useRef('');
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  valueRef.current = value;
  onChangeRef.current = onChange;

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition || recognitionRef.current) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    baseRef.current = valueRef.current;
    setError(undefined);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';
        if (result?.isFinal) finalText += `${transcript} `;
        else interimText += transcript;
      }
      onChangeRef.current(joinTranscript(baseRef.current, `${finalText}${interimText}`));
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') setError(speechError(event.error));
    };
    recognition.onend = () => {
      recognitionRef.current = undefined;
      setListening(false);
    };
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = undefined;
      setError('Dictation could not start. You can keep typing or try again.');
    }
  }, []);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported: Boolean(recognitionConstructor()), listening, error, start, stop };
}
