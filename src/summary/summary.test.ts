import { describe, expect, it } from 'vitest';
import vectors from '../../fixtures/calc-vectors.json';
import { emptyValues, type MonthEntry } from '../input/fields';
import { EXPLAINER } from '../ui/explainer';
import { formatKwh, formatOfferRate, formatPesos, formatShare, roundPesos } from './format';
import { ATTRIBUTION, buildSummary, summaryText } from './summary';
import { ESTIMATE_LINE } from './verdict';

interface FixtureMonth {
  period: string;
  importKwh: string;
  genRate: string;
  vatRate: string;
  exportKwh?: string;
  exportRate?: string;
}

// Fixture months as a household would type them: VAT as a percentage, and a generation
// amount that matches kWh x rate.
function entries(name: string): { months: MonthEntry[]; solar: boolean } {
  const c = vectors.cases.find((x) => x.name === name)!;
  const input = c.input as FixtureMonth[];
  const months = input.map((m) => ({
    period: m.period,
    values: {
      ...emptyValues(),
      importKwh: m.importKwh,
      genRate: m.genRate,
      genAmount: String(Number(m.importKwh) * Number(m.genRate)),
      vatRate: String(Number((Number(m.vatRate) * 100).toFixed(4))),
      exportKwh: m.exportKwh ?? '',
      exportRate: m.exportRate ?? '',
    },
    estimatedReading: false,
    meterChanged: false,
  }));
  return { months, solar: input.some((m) => m.exportKwh !== undefined) };
}

const summaryFor = (name: string) => {
  const { months, solar } = entries(name);
  return buildSummary(months, solar);
};

describe('display rounding', () => {
  it('rounds to the nearest 10 under 1,000 and the nearest 100 from 1,000 up', () => {
    expect(roundPesos(693.15)).toBe(690);
    expect(roundPesos(996)).toBe(1000);
    expect(roundPesos(1000)).toBe(1000);
    expect(roundPesos(7154.88)).toBe(7200);
    expect(roundPesos(-122.85)).toBe(-120);
    expect(roundPesos(-1355.4)).toBe(-1400);
    expect(Object.is(roundPesos(-2), 0)).toBe(true);
  });

  it('formats pesos, kWh, shares and offer rates', () => {
    expect(formatPesos(7154.88)).toBe('P7,200');
    expect(formatPesos(-122.85)).toBe('-P120');
    expect(formatPesos(0)).toBe('P0');
    expect(formatKwh(1255.4)).toBe('1,255');
    expect(formatShare(0.2607)).toBe('26%');
    expect(formatOfferRate(7.8125)).toBe('P7.81');
  });
});

describe('verdict', () => {
  it('gives no verdict without a complete month', () => {
    const s = buildSummary([], false);
    expect(s.verdict).toEqual({ kind: 'none', sentences: [] });
    expect(s.rows).toEqual([]);
  });

  it('names Option A when it leads, and says it cannot cost more than Meralco', () => {
    const v = summaryFor('no-solar-mixed-rates').verdict;
    expect(v.kind).toBe('a');
    expect(v.sentences[0]).toContain('Option A (20% off)');
    expect(v.sentences[0]).toContain('P7,200 a year');
    expect(v.sentences[1]).toBe('Option A can never cost more than Meralco.');
  });

  it('names Option B when it leads, with the crossover rate and the VAT question', () => {
    const v = summaryFor('solar-light-export').verdict;
    expect(v.kind).toBe('b');
    expect(v.sentences[0]).toContain('Option B (fixed P6.25 per kWh)');
    expect(v.sentences[1]).toContain('staying above P7.81');
    expect(v.sentences[1]).toContain('VAT');
  });

  it('says to stay with Meralco when a solar home loses under both options', () => {
    const v = summaryFor('solar-heavy-export').verdict;
    expect(v.kind).toBe('stay');
    expect(v.sentences[0]).toBe('On these bills, this household looks better off staying with Meralco.');
  });

  it('says the options are close when they are within 10%', () => {
    const v = summaryFor('edge-rate-at-crossover').verdict;
    expect(v.kind).toBe('close');
    expect(v.sentences[1]).toContain('known price for 2 years');
    expect(v.sentences[1]).toContain('cannot turn negative');
  });

  it('always ends with the estimate line', () => {
    for (const c of vectors.cases) {
      const v = summaryFor(c.name).verdict;
      expect(v.sentences[v.sentences.length - 1], c.name).toBe(ESTIMATE_LINE);
    }
  });
});

describe('summary', () => {
  it('builds the summary rows from the totals', () => {
    const rows = new Map(summaryFor('no-solar-mixed-rates').rows);
    expect(rows.get('Months covered')).toBe('3 (January 2026 to March 2026)');
    expect(rows.get('Total import')).toBe('1,255 kWh');
    expect(rows.get('Saving under Option A, these 3 months')).toBe('P1,800 before VAT (P2,000 with VAT)');
    expect(rows.get('Saving under Option B, these 3 months')).toBe('P1,100 (P1,200 to P2,200 depending on VAT)');
    expect(rows.get('Months with a generation rate above P7.81')).toBe('1 of 3');
    expect(rows.get('Net effect per year, Option A')).toBe('P7,200');
    expect(rows.get('Net effect per year, Option B')).toBe('P4,400');
    expect(rows.get('Per year at March 2026 rates')).toBe('Option A P6,000, Option B -P1,400');
    expect([...rows.keys()].some((k) => k.includes('Export'))).toBe(false);
  });

  it('shows the generation rate as entered and keeps a negative month', () => {
    const { header, rows } = summaryFor('no-solar-mixed-rates').monthly;
    expect(header).toHaveLength(5);
    expect(rows[0]).toEqual(['January 2026', '412', '8.4120', 'P690', 'P890']);
    expect(rows[2]).toEqual(['March 2026', '455', '5.9800', 'P540', '-P120']);
  });

  it('adds export credits and the solar caveat for a solar home', () => {
    const s = summaryFor('solar-heavy-export');
    expect(s.monthly.header).toHaveLength(6);
    expect(new Map(s.rows).get('Export credits lost, these 2 months')).toBe('P2,100');
    expect(new Map(s.rows).get('Net effect per year, Option A')).toBe('-P7,800');
    expect(s.caveats.some((c) => c.includes('net metering'))).toBe(true);
    expect(s.assumptions.some((a) => a.startsWith('Solar:'))).toBe(true);
  });

  it('lists annualising, missing and flagged months in the assumptions', () => {
    const { months } = entries('no-solar-mixed-rates');
    months[1].values.vatRate = '';
    months[0].meterChanged = true;
    const s = buildSummary(months, false);
    expect(s.result.monthsUsed).toBe(2);
    expect(s.assumptions.some((a) => a.includes('multiplied by 12/2') && a.includes('seasonal'))).toBe(true);
    expect(s.assumptions).toContain('February 2026 is left out because a figure is missing: VAT rate on generation, %.');
    expect(s.assumptions).toContain('January 2026 is flagged: meter changed.');
  });

  it('always says the written contract governs', () => {
    for (const c of vectors.cases) {
      expect(summaryFor(c.name).caveats, c.name).toContain("ACEN's written contract governs.");
    }
  });
});

describe('summary text', () => {
  it('follows the SPEC section 8 order', () => {
    const text = summaryText(summaryFor('solar-light-export'));
    const order = [EXPLAINER.title.toUpperCase(), EXPLAINER.footer, 'VERDICT', 'SUMMARY', 'MONTH BY MONTH', 'ASSUMPTIONS', 'CAVEATS', ATTRIBUTION];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.endsWith(ATTRIBUTION)).toBe(true);
    for (const point of EXPLAINER.points) expect(text).toContain(`- ${point}`);
  });

  it('still gives the explainer and caveats when nothing is entered', () => {
    const text = summaryText(buildSummary([], false));
    expect(text).toContain('No complete months yet');
    expect(text).not.toContain('SUMMARY');
    expect(text).toContain("ACEN's written contract governs.");
  });
});
