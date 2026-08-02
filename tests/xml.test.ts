import { describe, expect, it } from 'vitest';
import {
  childElements,
  decodeEntities,
  findDescendant,
  findDescendants,
  firstChild,
  parseXml,
  textContent,
} from '../src/lib/xml';

describe('decodeEntities', () => {
  it('decodes named, decimal, and hex entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#65;&#x42; &alpha;')).toBe('a & b <c> AB α');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&notreal; &amp;')).toBe('&notreal; &');
  });
});

describe('parseXml', () => {
  it('parses nested elements, attributes, and text', () => {
    const root = parseXml('<article id="a1"><front><title>Hello</title></front></article>')!;
    expect(root.local).toBe('article');
    expect(root.attrs.id).toBe('a1');
    expect(textContent(findDescendant(root, 'title'))).toBe('Hello');
  });

  it('handles self-closing tags, comments, CDATA, doctypes, and processing instructions', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE article PUBLIC "x" "y"[<!ENTITY z "1">]>
      <root><!-- skip me --><empty/><data><![CDATA[raw <not> parsed]]></data><?php ignore ?></root>`;
    const root = parseXml(xml)!;
    expect(root.local).toBe('root');
    expect(childElements(root).map((el) => el.local)).toEqual(['empty', 'data']);
    expect(textContent(findDescendant(root, 'data'))).toBe('raw <not> parsed');
  });

  it('keeps namespace prefixes but exposes the local name', () => {
    const root = parseXml('<article><mml:math xmlns:mml="x"><mml:mi>n</mml:mi></mml:math></article>')!;
    const math = findDescendant(root, 'math')!;
    expect(math.name).toBe('mml:math');
    expect(math.local).toBe('math');
  });

  it('reads attributes in single quotes, double quotes, and unquoted', () => {
    const root = parseXml(`<t a="1" b='2' c=3 d="with > gt" />`)!;
    expect(root.attrs).toMatchObject({ a: '1', b: '2', c: '3', d: 'with > gt' });
  });

  it('recovers from a stray closing tag without losing later content', () => {
    const root = parseXml('<root><p>one</p></nope><p>two</p></root>')!;
    expect(childElements(root, 'p').map((p) => textContent(p))).toEqual(['one', 'two']);
  });

  it('finds descendants in document order and direct children separately', () => {
    const root = parseXml('<a><b><c>1</c></b><c>2</c></a>')!;
    expect(findDescendants(root, 'c').map((c) => textContent(c))).toEqual(['1', '2']);
    expect(childElements(root, 'c')).toHaveLength(1);
    expect(firstChild(root, 'b')).toBeDefined();
  });

  it('returns null for input with no element', () => {
    expect(parseXml('   ')).toBeNull();
  });
});
