import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findItemSpan, findQuotePage, pageText } from '../lib/locate-quote';

type PdfjsApi = {
  getDocument: (src: { data: ArrayBuffer; useSystemFonts?: boolean }) => { promise: Promise<PDFDocumentProxy> };
  Util: { transform: (m1: unknown, m2: unknown) => number[] };
};

export interface LocateRequest {
  text: string;
  id: number;
}

interface Box {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PdfPaneProps {
  bytes: ArrayBuffer;
  locate: LocateRequest | null;
}

export function PdfPane({ bytes, locate }: PdfPaneProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfjsApi | null>(null);
  const [pageTexts, setPageTexts] = useState<string[] | null>(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setError(null);
    setPageTexts(null);
    setDoc(null);
    void (async () => {
      try {
        const { loadPdfjs } = await import('../lib/pdf-import');
        const lib = await loadPdfjs();
        if (cancelled) return;
        const task = lib.getDocument({ data: bytes.slice(0), useSystemFonts: true });
        const next = await task.promise;
        if (cancelled) {
          await next.destroy();
          return;
        }
        loaded = next;
        setPdfjs(lib as PdfjsApi);
        setDoc(next);
      } catch {
        if (!cancelled) setError('This PDF could not be opened.');
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void (async () => {
      const texts: string[] = [];
      for (let number = 1; number <= doc.numPages; number += 1) {
        if (cancelled) return;
        const page = await doc.getPage(number);
        const content = await page.getTextContent();
        const parts: string[] = [];
        for (const item of content.items) {
          if (item && typeof item === 'object' && 'str' in item && item.str) parts.push(item.str);
        }
        texts.push(pageText(parts));
      }
      if (!cancelled) setPageTexts(texts);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !doc) return;
    let cancelled = false;
    const fit = () => {
      void doc.getPage(1).then((page) => {
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const width = Math.max(280, scroller.clientWidth - 32);
        setScale(Math.min(1.8, Math.max(0.7, width / base.width)));
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(scroller);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [doc]);

  const pageIndex = locate && pageTexts ? findQuotePage(pageTexts, locate.text) : -1;

  useEffect(() => {
    if (!locate || !pageTexts) return;
    setMiss(pageIndex < 0);
    if (pageIndex < 0) return;
    const scroller = scrollerRef.current;
    const page = scroller?.querySelector<HTMLElement>(`[data-page="${pageIndex + 1}"]`);
    page?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [locate, pageTexts, pageIndex]);

  if (error) {
    return <p className="doc-status">{error}</p>;
  }
  if (!doc || !pdfjs) {
    return <p className="doc-status">Opening the PDF…</p>;
  }

  return (
    <div className="pdf-stack" ref={scrollerRef}>
      {miss && (
        <p className="locate-miss" role="status">
          That line isn’t in the PDF text.
        </p>
      )}
      {Array.from({ length: doc.numPages }, (_, index) => (
        <PdfPage
          key={index + 1}
          doc={doc}
          pdfjs={pdfjs}
          pageNumber={index + 1}
          scale={scale}
          quote={locate && pageIndex === index ? locate.text : null}
          locateId={locate?.id ?? 0}
          root={scrollerRef}
        />
      ))}
    </div>
  );
}

function PdfPage({
  doc,
  pdfjs,
  pageNumber,
  scale,
  quote,
  locateId,
  root,
}: {
  doc: PDFDocumentProxy;
  pdfjs: PdfjsApi;
  pageNumber: number;
  scale: number;
  quote: string | null;
  locateId: number;
  root: RefObject<HTMLDivElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [show, setShow] = useState(pageNumber <= 2);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [span, setSpan] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (quote) setShow(true);
  }, [quote, locateId]);

  useEffect(() => {
    let cancelled = false;
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  useEffect(() => {
    const element = wrapRef.current;
    const scroller = root.current;
    if (!element || !scroller || show) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShow(true);
      },
      { root: scroller, rootMargin: '700px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, show, size]);

  useEffect(() => {
    if (!show || !size) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      task = renderTask;
      try {
        await renderTask.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      const content = await page.getTextContent();
      const placed: Box[] = [];
      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item) || !item.str) continue;
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || ('height' in item ? Number(item.height) : 0) || 8;
        placed.push({
          str: item.str,
          left: tx[4],
          top: tx[5] - fontHeight,
          width: Math.max(item.width * scale, 1),
          height: fontHeight,
        });
      }
      if (cancelled) return;
      setBoxes(placed);
      setSpan(quote ? findItemSpan(placed.map((box) => box.str), quote) : null);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale, show, size, pdfjs, quote, locateId]);

  useEffect(() => {
    if (!span) return;
    wrapRef.current?.querySelector('.pdf-mark')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [span, locateId]);

  return (
    <div
      ref={wrapRef}
      className="pdf-page"
      data-page={pageNumber}
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      {show && <canvas ref={canvasRef} />}
      {span &&
        boxes.slice(span.start, span.end + 1).map((box, index) => (
          <span
            key={index}
            className="pdf-mark"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          />
        ))}
      <span className="pdf-page-num">{pageNumber}</span>
    </div>
  );
}
