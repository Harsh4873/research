import { describe, expect, it } from 'vitest';
import { jatsToMarkdown, mineAbbreviations, tidyHeading } from '../src/lib/jats';
import { extractStudyMaterial } from '../src/lib/extract';
import { parseMarkdown } from '../src/lib/markdown';

const ARTICLE = `<?xml version="1.0"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front>
    <journal-meta><journal-title>Journal of Testing</journal-title></journal-meta>
    <article-meta>
      <article-id pub-id-type="doi">10.1234/test.2026</article-id>
      <article-id pub-id-type="pmid">99887766</article-id>
      <title-group><article-title>Measuring <italic>Escherichia coli</italic> growth</article-title></title-group>
      <contrib-group>
        <contrib contrib-type="author"><name><surname>Rivera</surname><given-names>Ana</given-names></name></contrib>
        <contrib contrib-type="author"><name><surname>Okafor</surname><given-names>Chidi</given-names></name></contrib>
        <contrib contrib-type="editor"><name><surname>Nope</surname><given-names>Ed</given-names></name></contrib>
      </contrib-group>
      <pub-date pub-type="epub"><year>2026</year></pub-date>
      <permissions><license xlink:href="http://creativecommons.org/licenses/by/4.0/"><license-p>Open Access under CC.</license-p></license></permissions>
      <kwd-group><kwd>growth rate</kwd><kwd>microbiology</kwd></kwd-group>
      <abstract>
        <sec><title>Background</title><p>Growth is hard to measure.</p></sec>
        <sec><title>Results</title><p>We measured it with a new assay.</p></sec>
      </abstract>
    </article-meta>
  </front>
  <body>
    <sec id="s1"><title>INTRODUCTION AND SCOPE</title>
      <p>The optical density (OD) method underpins this work, and the colony forming unit (CFU) count validates it. We cite prior work here<xref ref-type="bibr" rid="b1">1</xref>.</p>
      <sec id="s1a"><title>Prior work</title><p>Earlier studies used <bold>plate counting</bold> and <italic>turbidity</italic>.</p></sec>
    </sec>
    <sec id="s2"><title>Methods</title>
      <p>We applied the formula below.</p>
      <disp-formula id="e1"><label>(1)</label><tex-math>\\mu = \\frac{\\ln(N_t) - \\ln(N_0)}{t}</tex-math></disp-formula>
      <disp-formula id="e2"><label>(2)</label>
        <mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML">
          <mml:mrow><mml:msub><mml:mi>N</mml:mi><mml:mi>t</mml:mi></mml:msub><mml:mo>=</mml:mo><mml:msub><mml:mi>N</mml:mi><mml:mn>0</mml:mn></mml:msub><mml:msup><mml:mi>e</mml:mi><mml:mrow><mml:mi>r</mml:mi><mml:mi>t</mml:mi></mml:mrow></mml:msup></mml:mrow>
        </mml:math>
      </disp-formula>
      <table-wrap id="t1">
        <label>Table 1.</label>
        <caption><p>Media and their doubling times</p></caption>
        <table>
          <thead><tr><th>Medium</th><th>Doubling time</th></tr></thead>
          <tbody>
            <tr><td>LB broth</td><td>20 min</td></tr>
            <tr><td>M9 minimal</td><td>60 min</td></tr>
          </tbody>
        </table>
        <table-wrap-foot><fn><p>Measured at 37 degrees.</p></fn></table-wrap-foot>
      </table-wrap>
      <p><monospace>##Assembly-Data-START##</monospace></p>
    </sec>
    <sec id="s3"><title>Results</title>
      <fig id="f1"><label>Figure 1.</label><caption><title>Growth curves</title><p>Curves for both media over eight hours.</p></caption><graphic xlink:href="fig1.jpg"/></fig>
      <p>Growth in LB broth was faster than in M9 minimal medium.</p>
      <supplementary-material id="sup1">
        <label>Supplementary Table S1</label>
        <caption><p>Raw optical density readings.</p></caption>
        <media xlink:href="supp1.xlsx"/>
      </supplementary-material>
      <list list-type="order"><list-item><p>Prepare media.</p></list-item><list-item><p>Inoculate.</p></list-item></list>
    </sec>
    <sec id="refs" sec-type="ref-list"><title>REFERENCES</title>
      <ref-list>
        <ref id="b1"><element-citation><article-title>An older growth study</article-title><source>Old Journal</source><year>2001</year><name><surname>Klein</surname></name></element-citation></ref>
      </ref-list>
    </sec>
  </body>
  <back>
    <glossary><def-list>
      <def-item><term>OD</term><def><p>optical density</p></def></def-item>
      <def-item><term>CFU</term><def><p>colony forming unit</p></def></def-item>
    </def-list></glossary>
  </back>
</article>`;

const converted = jatsToMarkdown(ARTICLE, { sourceNote: 'unit test' })!;
const md = converted.markdown;

describe('jatsToMarkdown metadata', () => {
  it('reads title, authors, journal, year, ids, licence, and keywords', () => {
    expect(converted.meta.title).toBe('Measuring *Escherichia coli* growth');
    expect(converted.meta.authors).toEqual(['Ana Rivera', 'Chidi Okafor']); // the editor is excluded
    expect(converted.meta.journal).toBe('Journal of Testing');
    expect(converted.meta.year).toBe('2026');
    expect(converted.meta.doi).toBe('10.1234/test.2026');
    expect(converted.meta.pmid).toBe('99887766');
    expect(converted.meta.license).toBe('CC BY');
    expect(converted.meta.keywords).toEqual(['growth rate', 'microbiology']);
  });

  it('writes front matter that the markdown parser can read back', () => {
    const parsed = parseMarkdown(md);
    expect(parsed.meta?.journal).toBe('Journal of Testing');
    expect(parsed.meta?.pmid).toBe('99887766');
    expect(parsed.meta?.source).toBe('unit test');
    expect(parsed.title).toContain('Escherichia coli');
  });

  it('keeps the citation line free of bold so it cannot become a blank card', () => {
    const citation = md.split('\n').find((line) => line.startsWith('> '))!;
    expect(citation).toContain('Journal of Testing');
    expect(citation).toContain('PMID 99887766');
    expect(citation).not.toContain('**');
  });
});

describe('jatsToMarkdown structure', () => {
  it('renders a structured abstract as labelled bullets', () => {
    expect(md).toContain('## Abstract');
    expect(md).toContain('- **Background**: Growth is hard to measure.');
    expect(md).toContain('- **Results**: We measured it with a new assay.');
  });

  it('tidies shouty headings and nests subsections one level deeper', () => {
    expect(md).toContain('## Introduction and Scope');
    expect(md).toContain('### Prior work');
  });

  it('drops citation markers but keeps inline emphasis', () => {
    expect(md).toContain('We cite prior work here.');
    expect(md).toContain('**plate counting**');
    expect(md).toContain('*turbidity*');
  });

  it('converts tables to GFM with caption headings and footnotes', () => {
    expect(md).toContain('#### Table 1. Media and their doubling times');
    expect(md).toContain('| Medium | Doubling time |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| LB broth | 20 min |');
    expect(md).toContain('_Measured at 37 degrees._');
  });

  it('renders LaTeX and MathML equations as math blocks', () => {
    expect(md).toContain('#### Equation 1');
    expect(md).toContain('```math');
    expect(md).toContain('\\mu = \\frac{\\ln(N_t) - \\ln(N_0)}{t}');
    expect(md).toContain('#### Equation 2');
    // MathML is linearised: N_t = N_0 e^(rt)
    expect(md).toMatch(/N_t\s*=\s*N_0\s*e\^\(rt\)/);
  });

  it('keeps figure captions as study text', () => {
    expect(md).toContain('#### Figure 1. Growth curves');
    expect(md).toContain('Curves for both media over eight hours.');
  });

  it('collects supplementary material into its own section', () => {
    expect(md).toContain('## Supplementary material');
    expect(md).toContain('**Supplementary Table S1**');
    expect(md).toContain('supp1.xlsx');
  });

  it('emits the glossary from a def-list', () => {
    expect(md).toContain('## Glossary');
    expect(md).toContain('- **OD**: optical density');
    expect(md).toContain('- **CFU**: colony forming unit');
  });

  it('renders references once, from a reference section inside the body', () => {
    expect(md).toContain('## References');
    expect(md).toContain('An older growth study');
    expect(md.match(/## References/g)).toHaveLength(1);
    expect(md).not.toContain('## REFERENCES');
    expect(converted.counts.references).toBe(1);
  });

  it('puts monospace data listings in a code block instead of prose', () => {
    expect(md).toContain('```\n##Assembly-Data-START##\n```');
  });

  it('converts ordered lists', () => {
    expect(md).toContain('1. Prepare media.');
    expect(md).toContain('2. Inoculate.');
  });

  it('counts what it extracted', () => {
    expect(converted.counts).toMatchObject({ tables: 1, figures: 1, equations: 2, supplements: 1 });
    expect(converted.counts.sections).toBeGreaterThanOrEqual(4);
  });

  it('returns null for input that is not XML', () => {
    expect(jatsToMarkdown('not xml at all')).toBeNull();
  });
});

describe('the converted markdown feeds the study engine', () => {
  const material = extractStudyMaterial(md);

  it('produces term cards from the glossary and the table', () => {
    const terms = new Map(material.terms.map((t) => [t.term, t]));
    expect(terms.get('OD')?.definition).toBe('optical density');
    expect(terms.get('LB broth')?.definition).toContain('20 min');
  });

  it('produces fill-in-the-blank cards', () => {
    expect(material.clozes.length).toBeGreaterThan(0);
  });

  it('never turns the citation line into a card', () => {
    expect(material.terms.some((t) => t.term.includes('Journal of Testing'))).toBe(false);
    expect(material.clozes.some((c) => c.answer === 'Journal of Testing')).toBe(false);
  });
});

describe('equations published only as images', () => {
  const imageOnly = jatsToMarkdown(`<article><front><article-meta>
      <title-group><article-title>Image maths</article-title></title-group></article-meta></front>
    <body><sec><title>Model</title>
      <p>The model is defined below.</p>
      <disp-formula id="e1"><label>1</label><graphic xlink:href="eq1.gif"/></disp-formula>
      <disp-formula id="e2"><label>2</label><graphic xlink:href="eq2.gif"/></disp-formula>
      <p>Where <inline-formula><inline-graphic xlink:href="i1.gif"/></inline-formula> is the rate.</p>
    </sec></body></article>`)!;

  it('does not mistake the equation label for the formula', () => {
    expect(imageOnly.markdown).not.toContain('```math\n1\n```');
    expect(imageOnly.markdown).not.toContain('#### Equation 1');
    expect(imageOnly.counts.equations).toBe(0);
  });

  it('explains once that the formulas are images', () => {
    expect(imageOnly.markdown).toContain('## Equations');
    expect(imageOnly.markdown).toContain('2 display equations as images');
    expect(imageOnly.markdown.match(/## Equations/g)).toHaveLength(1);
  });

  it('keeps the surrounding prose readable', () => {
    expect(imageOnly.markdown).toContain('The model is defined below.');
    expect(imageOnly.markdown).toContain('Where  is the rate.'.replace('  ', ' ')); // inline image drops out
  });
});

describe('helpers', () => {
  it('tidyHeading only rewrites all-caps titles', () => {
    expect(tidyHeading('MATERIALS AND METHODS')).toBe('Materials and Methods');
    expect(tidyHeading('Results and discussion')).toBe('Results and discussion');
    expect(tidyHeading('DNA')).toBe('Dna'); // acronym-only headings are rare; readability wins
  });

  it('mines abbreviations only when the initials match', () => {
    const mined = mineAbbreviations(
      'The optical density (OD) rose. The colony forming unit (CFU) count fell. Unrelated words (XYZ) here.',
    );
    expect(mined).toContain('- **OD**: optical density');
    expect(mined).toContain('- **CFU**: colony forming unit');
    expect(mined.join(' ')).not.toContain('XYZ');
  });
});

describe('abbreviation mining', () => {
  it('handles acronyms nested inside the expansion', () => {
    const mined = mineAbbreviations('We sequenced the 16S ribosomal RNA (rRNA) gene from each sample.');
    expect(mined).toContain('- **rRNA**: ribosomal RNA');
  });

  it('matches the shortest trailing phrase, not the whole sentence fragment', () => {
    const mined = mineAbbreviations('This supports a strong environmental filtering (EF) model.');
    expect(mined).toContain('- **EF**: environmental filtering');
  });

  it('ignores ordinary parentheticals and self-referential pairs', () => {
    const mined = mineAbbreviations('The samples were warm (they had been stored badly) and old (2019).');
    expect(mined).toEqual([]);
  });
});
