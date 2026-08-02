/**
 * A small well-formed-XML parser.
 *
 * JATS full text is well-formed XML, so a focused parser is enough — and it
 * keeps parsing identical in the browser and in Node tests without pulling in
 * a DOM implementation or a dependency.
 */

export interface XmlText {
  kind: 'text';
  text: string;
}

export interface XmlElement {
  kind: 'element';
  /** Tag name including any namespace prefix, e.g. `mml:math`. */
  name: string;
  /** Tag name with the namespace prefix stripped, e.g. `math`. */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlText | XmlElement;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  times: '×',
  minus: '−',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Delta: 'Δ',
  Sigma: 'Σ',
  Omega: 'Ω',
  le: '≤',
  ge: '≥',
  ne: '≠',
  approx: '≈',
  infin: '∞',
  prime: '′',
  sup2: '²',
  sup3: '³',
  frac12: '½',
  rarr: '→',
  larr: '←',
  harr: '↔',
  bull: '•',
  dagger: '†',
  Dagger: '‡',
  sect: '§',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon >= 0 ? name.slice(colon + 1) : name;
}

/** Parse a well-formed XML document into a node tree. Returns the root element. */
export function parseXml(source: string): XmlElement | null {
  const stack: XmlElement[] = [];
  const root: XmlElement = { kind: 'element', name: '#document', local: '#document', attrs: {}, children: [] };
  stack.push(root);
  let i = 0;
  const len = source.length;

  const appendText = (raw: string) => {
    if (!raw) return;
    const parent = stack[stack.length - 1];
    parent.children.push({ kind: 'text', text: decodeEntities(raw) });
  };

  while (i < len) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      appendText(source.slice(i));
      break;
    }
    if (lt > i) appendText(source.slice(i, lt));

    // Comments, CDATA, doctype, processing instructions.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      const body = source.slice(lt + 9, end < 0 ? len : end);
      const parent = stack[stack.length - 1];
      parent.children.push({ kind: 'text', text: body });
      i = end < 0 ? len : end + 3;
      continue;
    }
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      i = end < 0 ? len : end + 2;
      continue;
    }
    if (source.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset.
      let depth = 0;
      let j = lt + 2;
      for (; j < len; j++) {
        const ch = source[j];
        if (ch === '[') depth += 1;
        else if (ch === ']') depth -= 1;
        else if (ch === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }

    // Closing tag.
    if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt);
      const name = source.slice(lt + 2, end < 0 ? len : end).trim();
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if (stack[depth].name === name) {
          stack.length = depth;
          break;
        }
      }
      i = end < 0 ? len : end + 1;
      continue;
    }

    // Opening tag: find the '>' that closes it, skipping quoted attribute values.
    let j = lt + 1;
    let quote: string | null = null;
    for (; j < len; j++) {
      const ch = source[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    const rawTag = source.slice(lt + 1, j);
    i = j + 1;

    const selfClosing = rawTag.endsWith('/');
    const tagBody = selfClosing ? rawTag.slice(0, -1) : rawTag;
    const nameMatch = tagBody.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const attrs: Record<string, string> = {};
    const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let attrMatch: RegExpExecArray | null;
    const attrSource = tagBody.slice(nameMatch[0].length);
    while ((attrMatch = attrRe.exec(attrSource))) {
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
      attrs[attrMatch[1]] = decodeEntities(value);
    }

    const element: XmlElement = { kind: 'element', name, local: localName(name), attrs, children: [] };
    stack[stack.length - 1].children.push(element);
    if (!selfClosing) stack.push(element);
  }

  return root.children.find((node): node is XmlElement => node.kind === 'element') ?? null;
}

export function isElement(node: XmlNode): node is XmlElement {
  return node.kind === 'element';
}

/** Direct element children, optionally filtered by local name. */
export function childElements(node: XmlElement, local?: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of node.children) {
    if (child.kind === 'element' && (!local || child.local === local)) out.push(child);
  }
  return out;
}

export function firstChild(node: XmlElement, local: string): XmlElement | undefined {
  return childElements(node, local)[0];
}

/** Depth-first search for the first descendant with the given local name. */
export function findDescendant(node: XmlElement, local: string): XmlElement | undefined {
  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    if (child.local === local) return child;
    const nested = findDescendant(child, local);
    if (nested) return nested;
  }
  return undefined;
}

/** All descendants with the given local name, in document order. */
export function findDescendants(node: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (current: XmlElement) => {
    for (const child of current.children) {
      if (child.kind !== 'element') continue;
      if (child.local === local) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** Concatenated text of a node and all its descendants, whitespace-collapsed. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return '';
  if (node.kind === 'text') return node.text;
  let out = '';
  for (const child of node.children) out += textOf(child);
  return out;
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function textContent(node: XmlNode | undefined): string {
  return collapse(textOf(node));
}
