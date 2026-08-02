import { parseXml, textOf, type XmlElement } from './xml';

/**
 * Just enough ZIP to read one member out of an Office file.
 *
 * The central directory is parsed rather than the local headers because
 * streamed writers leave the sizes out of the local header.
 */
async function readZipEntry(buffer: ArrayBuffer, wanted: string): Promise<string | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Find the end-of-central-directory record, scanning back over any comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 0xffff; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === wanted) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (method !== 8) return null;
      if (typeof DecompressionStream === 'undefined') return null;
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** Paragraph text of a Word document, one line per paragraph. */
export function docxXmlToText(documentXml: string): string {
  const root = parseXml(documentXml);
  if (!root) return '';
  const lines: string[] = [];

  const walk = (node: XmlElement) => {
    for (const child of node.children) {
      if (child.kind !== 'element') continue;
      if (child.local === 'p') {
        const text = textOf(child).replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
        continue; // paragraphs do not nest
      }
      walk(child);
    }
  };
  walk(root);
  return lines.join('\n');
}

export function isReferenceFile(name: string): boolean {
  return /\.(docx|txt|md|markdown|csv|tsv|nbib|ris|json)$/i.test(name);
}

/** Read a reference list file as plain text, including Word documents. */
export async function readReferenceFile(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) {
    const xml = await readZipEntry(await file.arrayBuffer(), 'word/document.xml');
    if (!xml) throw new Error(`Could not read “${file.name}”. Save it as .txt and try again.`);
    return docxXmlToText(xml);
  }
  return file.text();
}
