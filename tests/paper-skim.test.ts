import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/lib/markdown';
import { buildPaperBrief, scoreSkimSentence, summarizeSection } from '../src/lib/paper-skim';
import { buildPaperViews } from '../src/lib/paper-view';
import { classifySectionRole, explodeInlineSections, explodeToLines, skipFromSkim } from '../src/lib/section-split';

const TOY_LINES = [
  'A toy assay for counting colonies on agar plates',
  'Jane Q Public',
  'Abstract',
  'We count colonies with a simple grid so a student can practice log-scale thinking without a real biosafety lab. The grid is eight by eight and each cell is one plate sector.',
  '1 Introduction',
  'Tuberculosis papers often hide behind CFU plots. This toy paper uses a made-up strain name ToyRv so the deck can ask what the abstract claimed.',
  '2 Methods',
  'Plates were split into sixty-four cells. Counts were log10 transformed before a paired comparison on the toy strain.',
  '3 Results',
  'The knockout was two logs lower than wild type after the drug pulse, which is the same story as a classic essentiality call.',
  '4 Discussion',
  'A student should be able to say the abstract back: a grid count, a log drop, and why that is not a p-value by itself.',
  'References',
  'Someone, A. (2019) Fake citation that should not become a recall card.',
];

describe('explodeInlineSections', () => {
  it('splits mashed PDF prose onto known headings', () => {
    const mashed = TOY_LINES.join(' ');
    const exploded = explodeInlineSections(mashed);
    expect(exploded).toMatch(/Abstract\s+/);
    expect(exploded).toMatch(/1 Introduction/);
    expect(exploded).toMatch(/2 Methods/);
    expect(explodeToLines(mashed)).toEqual(
      expect.arrayContaining(['Abstract', '1 Introduction', '2 Methods', '3 Results', '4 Discussion', 'References']),
    );
  });

  it('does not split ordinary methods prose', () => {
    const prose = 'These methods were compared with the standard assay on the same plates.';
    expect(explodeInlineSections(prose)).toBe(prose);
  });

  it('keeps a heading that already sits on its own line', () => {
    expect(explodeToLines('Abstract')).toEqual(['Abstract']);
  });
});

describe('section roles', () => {
  it('classifies IMRAD headings, including numbered ones', () => {
    expect(classifySectionRole('Abstract')).toBe('abstract');
    expect(classifySectionRole('1 Introduction')).toBe('intro');
    expect(classifySectionRole('Materials and Methods')).toBe('methods');
    expect(classifySectionRole('3 Results')).toBe('results');
    expect(classifySectionRole('Discussion')).toBe('discussion');
    expect(classifySectionRole('Conclusions')).toBe('conclusion');
    expect(classifySectionRole('References')).toBe('apparatus');
  });

  it('drops publishing apparatus from skim', () => {
    expect(skipFromSkim('References')).toBe(true);
    expect(skipFromSkim('Acknowledgements')).toBe(true);
    expect(skipFromSkim('Glossary')).toBe(true);
    expect(skipFromSkim('Results')).toBe(false);
  });
});

describe('conclusive gist scoring', () => {
  it('prefers the finding over the organisational opener', () => {
    const organised = scoreSkimSentence(
      'This paper is organized as follows. Section 2 reviews related work.',
      'intro',
      'Introduction',
    );
    const asked = scoreSkimSentence(
      'We asked whether treatment raises survival compared with placebo in this cohort.',
      'intro',
      'Introduction',
    );
    expect(asked).toBeGreaterThan(organised);
    expect(organised).toBeLessThan(0);

    const section = summarizeSection(
      'Introduction',
      [
        'This paper is organized as follows. Section 2 reviews related work.',
        'We asked whether treatment raises survival compared with placebo in this cohort.',
      ].join(' '),
    );
    expect(section.gist).toContain('asked whether treatment');
    expect(section.gist).not.toMatch(/organized as follows/i);
    expect(section.aim).toContain('asked whether');
  });

  it('picks the quantified result, not the setup sentence', () => {
    const section = summarizeSection(
      'Results',
      [
        'To assess this question we performed several analyses of the primary endpoint.',
        'Survival was 18% higher in the treatment arm (p < 0.001).',
      ].join(' '),
    );
    expect(section.gist).toContain('18%');
    expect(section.finding).toContain('18%');
    expect(section.numbers.join(' ')).toMatch(/18%/);
  });

  it('uses design and sample size for methods', () => {
    const section = summarizeSection(
      'Methods',
      'Ethics approval was obtained from the local board. We enrolled 240 participants over 18 months at three sites and compared treatment with placebo.',
    );
    expect(section.gist).toMatch(/enrolled 240|placebo/i);
  });
});

describe('paper brief', () => {
  const md = [
    '# A study of things',
    '',
    '## Abstract',
    '',
    'Background: Recurrence of tuberculosis is common. Methods: We nested this analysis in three cohorts. Results: We found that treatment raised survival by 18% compared with placebo. Conclusions: The treatment is effective in this population.',
    '',
    '## Introduction',
    '',
    'This paper is organized as follows. We asked whether treatment raises survival compared with placebo.',
    '',
    '## Methods',
    '',
    'We enrolled 240 participants over 18 months at three sites and measured outcomes every 4 weeks.',
    '',
    '## Results',
    '',
    'To assess this we ran several models. Survival was significantly higher in the treatment arm (p < 0.001).',
    '',
    '## Discussion',
    '',
    'Taken together, these findings support wider use of the treatment. A limitation is that further work is needed in older adults.',
    '',
    '## References',
    '',
    '1. Klein A. An older study. Old Journal. 2001.',
  ].join('\n');

  const views = buildPaperViews(parseMarkdown(md));

  it('builds a four-slot brief from IMRAD, not the first sentences', () => {
    expect(views.brief.asked).toMatch(/asked whether treatment/i);
    expect(views.brief.did).toMatch(/enrolled 240/i);
    expect(views.brief.found).toMatch(/survival/i);
    expect(views.brief.caveat).toMatch(/limitation|further work/i);
    expect(views.brief.verdict.length).toBeGreaterThan(20);
    expect(views.brief.verdict).not.toMatch(/organized as follows/i);
  });

  it('keeps section order and skips the reference list', () => {
    const titles = views.skim.map((s) => s.title);
    expect(titles).toContain('Methods');
    expect(titles.indexOf('Methods')).toBeLessThan(titles.indexOf('Results'));
    expect(titles).not.toContain('References');
    expect(titles).not.toContain('A study of things');
  });

  it('gists a structured abstract instead of leaving it blank', () => {
    const abstract = views.skim.find((s) => s.title === 'Abstract')!;
    expect(abstract.gist).toMatch(/18%|effective/i);
    expect(abstract.role).toBe('abstract');
  });

  it('does not mine claims from the reference list', () => {
    expect(views.claims.some((c) => c.section === 'References')).toBe(false);
  });
});

describe('buildPaperBrief', () => {
  it('returns empty strings when there is nothing to say', () => {
    const brief = buildPaperBrief([]);
    expect(brief).toEqual({ verdict: '', asked: '', did: '', found: '', caveat: '' });
  });
});
