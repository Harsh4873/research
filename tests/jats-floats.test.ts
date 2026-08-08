import { describe, expect, it } from 'vitest';
import { jatsToMarkdown, tableGrid } from '../src/lib/jats';
import { parseXml, findDescendant } from '../src/lib/xml';
import { parseMarkdown } from '../src/lib/markdown';
import { buildPaperViews } from '../src/lib/paper-view';

function article(body: string, pmc = '<article-id pub-id-type="pmcid">PMC7654321</article-id>'): string {
  return `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front><article-meta>
    ${pmc}
    <title-group><article-title>Spans and artwork</article-title></title-group>
    <pub-date pub-type="epub"><year>2026</year></pub-date>
  </article-meta></front>
  <body><sec id="s1"><title>Results</title>${body}</sec></body>
</article>`;
}

function gridOf(xml: string) {
  const root = parseXml(xml);
  if (!root) throw new Error('no document');
  const table = root.local === 'table' ? root : findDescendant(root, 'table');
  if (!table) throw new Error('no table');
  return tableGrid(table);
}

describe('table layout', () => {
  it('repeats a cell across every column it spans', () => {
    const { head, body } = gridOf(`<table>
      <thead><tr><th>Cohort</th><th colspan="2">Outcome</th></tr></thead>
      <tbody><tr><td>A</td><td>1</td><td>2</td></tr></tbody>
    </table>`);
    expect(head).toEqual([['Cohort', 'Outcome', 'Outcome']]);
    expect(body).toEqual([['A', '1', '2']]);
  });

  it('carries a row-spanning cell down, keeping later rows in their columns', () => {
    const { body } = gridOf(`<table><tbody>
      <tr><td rowspan="3">Group 1</td><td>first</td><td>x</td></tr>
      <tr><td>second</td><td>y</td></tr>
      <tr><td>third</td><td>z</td></tr>
      <tr><td>Group 2</td><td>fourth</td><td>w</td></tr>
    </tbody></table>`);
    expect(body).toEqual([
      ['Group 1', 'first', 'x'],
      ['Group 1', 'second', 'y'],
      ['Group 1', 'third', 'z'],
      ['Group 2', 'fourth', 'w'],
    ]);
  });

  it('spans exactly as many rows as it says, no more', () => {
    const { body } = gridOf(`<table><tbody>
      <tr><td rowspan="2">held</td><td>a</td></tr>
      <tr><td>b</td></tr>
      <tr><td>free</td><td>c</td></tr>
    </tbody></table>`);
    expect(body).toEqual([['held', 'a'], ['held', 'b'], ['free', 'c']]);
  });

  it('handles a cell that spans in both directions at once', () => {
    const { body } = gridOf(`<table><tbody>
      <tr><td rowspan="2" colspan="2">corner</td><td>a</td></tr>
      <tr><td>b</td></tr>
    </tbody></table>`);
    expect(body).toEqual([['corner', 'corner', 'a'], ['corner', 'corner', 'b']]);
  });

  it('flattens a two-row header into one, under the right columns', () => {
    const md = jatsToMarkdown(
      article(`<table-wrap id="t1"><label>Table 1</label><caption><p>Timings.</p></caption><table>
        <thead>
          <tr><th rowspan="2">Measure</th><th colspan="3">Time point</th></tr>
          <tr><th>0 month</th><th>3 <sup>rd</sup> month</th><th>6 <sup>th</sup> month</th></tr>
        </thead>
        <tbody><tr><td>Interviews</td><td>yes</td><td>no</td><td>no</td></tr></tbody>
      </table></table-wrap>`),
    );
    expect(md?.markdown).toContain('| Measure | Time point — 0 month | Time point — 3rd month | Time point — 6th month |');
    expect(md?.markdown).toContain('| Interviews | yes | no | no |');
  });

  it('links a table the source did not make machine-readable', () => {
    const md = jatsToMarkdown(
      article('<table-wrap id="t9"><label>Table 9</label><caption><p>Only a picture.</p></caption><graphic xlink:href="t9.jpg"/></table-wrap>'),
    );
    expect(md?.markdown).toContain('not in the machine-readable full text');
    expect(md?.markdown).toContain('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/table/t9/');
  });
});

describe('figure artwork', () => {
  const withFigure = article(
    `<fig id="f1"><label>Figure 1</label><caption><p>ROC curves for each model.</p></caption>` +
      `<alternatives><graphic xlink:href="paper-g001.jpg"/></alternatives></fig>`,
  );

  it('carries the published image through as a markdown image', () => {
    const md = jatsToMarkdown(withFigure);
    expect(md?.markdown).toContain('![Figure 1](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/bin/paper-g001.jpg)');
    expect(md?.markdown).toContain('ROC curves for each model.');
    expect(md?.counts.figures).toBe(1);
  });

  it('keeps the caption out of the image and the image out of the caption', () => {
    const views = buildPaperViews(parseMarkdown(jatsToMarkdown(withFigure)!.markdown), 'PMC7654321');
    expect(views.figures).toHaveLength(1);
    expect(views.figures[0].image).toBe('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/bin/paper-g001.jpg');
    expect(views.figures[0].caption).toBe('ROC curves for each model.');
  });

  it('adds an extension when the source references the file without one', () => {
    const md = jatsToMarkdown(
      article('<fig id="f2"><label>Figure 2</label><graphic xlink:href="nihms-1234-f0002"/></fig>'),
    );
    expect(md?.markdown).toContain('/bin/nihms-1234-f0002.jpg)');
  });

  it('falls back to a link when the article is not in PMC', () => {
    const md = jatsToMarkdown(article('<fig id="f3"><label>Figure 3</label><caption><p>No id.</p></caption><graphic xlink:href="a.jpg"/></fig>', ''));
    expect(md?.markdown).not.toContain('![');
    expect(md?.markdown).toContain('Figure 3');
  });
});

describe('PMC identifiers across feeds', () => {
  it.each([
    ['pmcid', '<article-id pub-id-type="pmcid">PMC5551212</article-id>'],
    ['pmc', '<article-id pub-id-type="pmc">5551212</article-id>'],
    ['pmcaid', '<article-id pub-id-type="pmcaid">5551212</article-id>'],
  ])('reads the id written as %s', (_label, tag) => {
    expect(jatsToMarkdown(article('<p>Body.</p>', tag))?.meta.pmcid).toBe('PMC5551212');
  });
});
