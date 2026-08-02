import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, looksLikeHtml, normalizeHtmlInMarkdown, structuredAbstractParts } from '../src/lib/html-text';
import { parseMarkdown } from '../src/lib/markdown';
import { extractStudyMaterial } from '../src/lib/extract';
import { abstractOnlyMarkdown } from '../src/lib/europepmc';

// The shape PubMed returns for a structured abstract.
const PUBMED_ABSTRACT =
  '<h4>Background</h4>Evidence describing the impact of diabetes mellitus (DM) on the recurrence of ' +
  'tuberculosis is limited.<h4>Methods</h4>This study was nested in 3 cohort studies of tuberculosis (TB) ' +
  'patients with and without DM. Paired isolates underwent whole genome sequencing, comparing ' +
  'recurrence type (endogenous reactivation [&lt;8 SNPs] or exogenous reinfection [≥8 SNPs]) by DM status.' +
  '<h4>Results</h4>Of 1633 enrolled, 236 (14.5%) had confirmed treatment failure; 76 isolate pairs were ' +
  'available. The SNP acquisition rate was 0.43 (95% CI, .25-.64) per 1 person-year.' +
  '<h4>Conclusions</h4>DM did not raise the mutation rate in this cohort.';

describe('looksLikeHtml', () => {
  it('spots real tags and ignores maths that merely uses angle brackets', () => {
    expect(looksLikeHtml('<h4>Background</h4>text')).toBe(true);
    expect(looksLikeHtml('<p>hello</p>')).toBe(true);
    expect(looksLikeHtml('reinfection [<8 SNPs] and p < 0.05 and a > b')).toBe(false);
    expect(looksLikeHtml('plain prose with no markup')).toBe(false);
  });
});

describe('htmlToMarkdown', () => {
  it('turns a PubMed structured abstract into headings and prose', () => {
    const md = htmlToMarkdown(PUBMED_ABSTRACT);
    expect(md).not.toContain('<h4>');
    expect(md).not.toContain('</h4>');
    // Only h4 is present, so the shallowest heading becomes level 2.
    expect(md).toContain('## Background');
    expect(md).toContain('## Methods');
    expect(md).toContain('## Results');
    expect(md).toContain('## Conclusions');
    expect(md).toContain('Evidence describing the impact');
  });

  it('decodes entities, including the ones that look like tags', () => {
    expect(htmlToMarkdown('<p>reactivation [&lt;8 SNPs] &amp; reinfection [&ge;8]</p>')).toContain('[<8 SNPs] & reinfection');
  });

  it('preserves relative heading depth when several levels are present', () => {
    const md = htmlToMarkdown('<h2>Top</h2><p>a</p><h3>Middle</h3><p>b</p><h4>Deep</h4><p>c</p>');
    expect(md).toContain('## Top');
    expect(md).toContain('### Middle');
    expect(md).toContain('#### Deep');
  });

  it('converts inline emphasis, code, sub and superscripts, and links', () => {
    const md = htmlToMarkdown('<p><b>Bold</b> and <i>italic</i> and <code>x</code>, H<sub>2</sub>O, 10<sup>6</sup>, <a href="https://x.test">link</a></p>');
    expect(md).toContain('**Bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('`x`');
    expect(md).toContain('H_2O');
    expect(md).toContain('10^6');
    expect(md).toContain('[link](https://x.test)');
  });

  it('converts lists, ordered and unordered', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
    expect(htmlToMarkdown('<ol><li>first</li><li>second</li></ol>')).toBe('1. first\n2. second');
  });

  it('drops scripts, styles, comments, and unknown tags', () => {
    const md = htmlToMarkdown('<div><script>evil()</script><style>.a{}</style><!-- note --><span>kept</span></div>');
    expect(md).toBe('kept');
  });

  it('turns <br> into a line break', () => {
    expect(htmlToMarkdown('line one<br>line two')).toBe('line one\nline two');
  });
});

describe('normalizeHtmlInMarkdown', () => {
  it('leaves ordinary markdown untouched', () => {
    const md = '# Title\n\n- **Term**: definition\n';
    expect(normalizeHtmlInMarkdown(md)).toBe(md);
  });

  it('does not rewrite HTML shown inside a fenced code block', () => {
    const md = '# Doc\n\n```html\n<h4>Example</h4>\n```\n';
    expect(normalizeHtmlInMarkdown(md)).toContain('<h4>Example</h4>');
  });

  it('converts HTML outside code fences', () => {
    const md = '```\n<b>kept</b>\n```\n\n<h4>Converted</h4>Body text here.';
    const out = normalizeHtmlInMarkdown(md);
    expect(out).toContain('<b>kept</b>');
    expect(out).toContain('## Converted');
  });
});

describe('the markdown parser handles HTML in stored documents', () => {
  it('renders a pasted PubMed abstract as real sections, not literal tags', () => {
    const doc = parseMarkdown(`# A paper\n\n${PUBMED_ABSTRACT}\n`);
    const headings = doc.blocks.filter((b) => b.type === 'heading').map((b) => (b as { text: string }).text);
    expect(headings).toContain('Background');
    expect(headings).toContain('Methods');
    expect(headings).toContain('Results');
    const text = doc.blocks.map((b) => ('text' in b ? b.text : '')).join(' ');
    expect(text).not.toContain('<h4>');
  });

  it('builds study material from it, with no tags left in the cards', () => {
    const material = extractStudyMaterial(`# A paper\n\n${PUBMED_ABSTRACT}\n`);
    const everything = [
      ...material.terms.map((t) => `${t.term} ${t.definition}`),
      ...material.clozes.map((c) => `${c.prompt} ${c.answer}`),
      ...material.outline.map((o) => o.title),
    ].join(' ');
    expect(everything).not.toMatch(/<\/?h[1-6]>/);
    expect(material.outline.map((o) => o.title)).toContain('Methods');
  });
});

describe('structuredAbstractParts', () => {
  it('splits an HTML-labelled abstract', () => {
    const parts = structuredAbstractParts(PUBMED_ABSTRACT);
    expect(parts.map((p) => p.label)).toEqual(['Background', 'Methods', 'Results', 'Conclusions']);
    expect(parts[0].body).toContain('Evidence describing');
    // No tags survive, though a decoded "<8 SNPs" legitimately keeps its "<".
    expect(parts.every((p) => !/<\/?[a-z]/i.test(p.body))).toBe(true);
    expect(parts[1].body).toContain('[<8 SNPs]');
  });

  it('splits a run-in capitalised abstract', () => {
    const parts = structuredAbstractParts(
      'BACKGROUND: Something is unclear. METHODS: We did a study of it. RESULTS: It worked well.',
    );
    expect(parts.map((p) => p.label)).toEqual(['Background', 'Methods', 'Results']);
  });

  it('returns nothing for an unstructured abstract', () => {
    expect(structuredAbstractParts('A single flowing paragraph with no labelled sections at all.')).toEqual([]);
  });
});

describe('abstract-only paper markdown', () => {
  const conversion = abstractOnlyMarkdown(
    { title: 'A paper', authors: ['Rivera A'], journal: 'J Test', year: '2022', pmid: '34984435', keywords: [] },
    PUBMED_ABSTRACT,
    'PubMed abstract',
  );

  it('never carries HTML through to the stored markdown', () => {
    expect(conversion.markdown).not.toMatch(/<\/?[a-z]+>/i);
  });

  it('renders the labelled sections as study bullets', () => {
    expect(conversion.markdown).toContain('- **Background**: Evidence describing');
    expect(conversion.markdown).toContain('- **Methods**:');
    expect(conversion.markdown).toContain('- **Conclusions**:');
  });

  it('produces clean cards from those bullets', () => {
    const material = extractStudyMaterial(conversion.markdown);
    const background = material.terms.find((t) => t.term === 'Background');
    expect(background?.definition).toContain('Evidence describing');
    expect(background?.definition).not.toContain('<');
  });
});
