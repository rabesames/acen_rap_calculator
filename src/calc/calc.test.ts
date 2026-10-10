import { describe, expect, it } from 'vitest';
import vectors from '../../fixtures/calc-vectors.json';
import { CROSSOVER_RATE, DISCOUNT_A, OFFER } from '../offer/offer';
import { calcHousehold, checkMonth, isAboveCrossover, missingFields } from './calc';
import type { MonthInput } from './types';

type Num = Record<string, number>;
interface FixtureMonth {
  period: string;
  importKwh: string;
  genRate: string;
  vatRate: string;
  exportKwh?: string;
  exportRate?: string;
}
interface FixtureCase {
  name: string;
  input: FixtureMonth[];
  expected: {
    months: (Num & { period: string; bBeatsA: boolean })[];
    monthsUsed: number;
    monthsBAboveCrossover: number;
    totals: Num;
    annualised: Num;
    netOfCredits: Num;
    netOfCreditsAnnualised: Num;
    annualisedAtLatestRates: Num;
  };
}

const cases = vectors.cases as unknown as FixtureCase[];
const TOL = vectors.moneyTolerance;
const SHARE_TOL = 0.0001;
const MONEY_KEYS = ['aBeforeVat', 'aInclVat', 'bConservative', 'bVatOnTop', 'bVatInside', 'creditsLost'];
const NET_KEYS = MONEY_KEYS.filter((k) => k !== 'creditsLost');

function month(over: Partial<MonthInput> & { period: string }): MonthInput {
  return {
    importKwh: null,
    genRate: null,
    genAmount: null,
    vatRate: null,
    vatAmount: null,
    chargesThisPeriod: null,
    exportKwh: null,
    exportRate: null,
    exportCredit: null,
    ...over,
  };
}

// The fixtures carry no generation amount (it only feeds the check), so a matching one
// is supplied here to make each month complete.
function fromFixture(m: FixtureMonth): MonthInput {
  const importKwh = Number(m.importKwh);
  const genRate = Number(m.genRate);
  return month({
    period: m.period,
    importKwh,
    genRate,
    genAmount: importKwh * genRate,
    vatRate: Number(m.vatRate),
    exportKwh: m.exportKwh === undefined ? null : Number(m.exportKwh),
    exportRate: m.exportRate === undefined ? null : Number(m.exportRate),
  });
}

function expectClose(actual: number | null | undefined, expected: number, tol: number, label: string) {
  expect(actual, label).not.toBeNull();
  expect(Math.abs((actual as number) - expected), `${label}: got ${actual}, want ${expected}`).toBeLessThanOrEqual(
    tol + 1e-9,
  );
}

describe('offer constants', () => {
  it('match the fixture file', () => {
    expect(DISCOUNT_A).toBe(Number(vectors.offer.discountA));
    expect(OFFER.fixedB).toBe(Number(vectors.offer.fixedB));
    expect(OFFER.termYears).toBe(vectors.offer.termYears);
    expect(CROSSOVER_RATE).toBe(vectors.crossoverRate);
  });
});

describe('fixtures/calc-vectors.json', () => {
  it('has the five cases', () => {
    expect(cases).toHaveLength(5);
  });

  for (const c of cases) {
    it(c.name, () => {
      const solar = c.input.some((m) => m.exportKwh !== undefined);
      const r = calcHousehold(c.input.map(fromFixture), { solar });
      const e = c.expected;
      const n = e.monthsUsed;

      expect(r.monthsUsed).toBe(n);
      expect(r.missing).toEqual([]);
      expect(r.monthsBAboveCrossover).toBe(e.monthsBAboveCrossover);
      expect(r.months).toHaveLength(e.months.length);

      e.months.forEach((em, i) => {
        const rm = r.months[i];
        const at = `${em.period}`;
        expect(rm.period).toBe(em.period);
        expect(rm.bBeatsA, `${at} bBeatsA`).toBe(em.bBeatsA);
        expectClose(rm.expectedGenAmount, em.expectedGenAmount, TOL, `${at} expectedGenAmount`);
        for (const k of MONEY_KEYS) expectClose(rm[k as keyof typeof rm] as number, em[k], TOL, `${at} ${k}`);
        if ('exportShare' in em) {
          expectClose(rm.exportShare, em.exportShare, SHARE_TOL, `${at} exportShare`);
          expectClose(rm.breakEvenShareA, em.breakEvenShareA, SHARE_TOL, `${at} breakEvenShareA`);
          expectClose(rm.breakEvenShareB, em.breakEvenShareB, SHARE_TOL, `${at} breakEvenShareB`);
        } else {
          expect(rm.exportShare).toBeNull();
        }
      });

      // Fixture totals are sums of centavo-rounded months; annualised figures are
      // those totals x 12 / months, so the tolerance scales the same way.
      const totalTol = TOL * n;
      const annualTol = totalTol * (12 / n);
      const totals = r.totals as unknown as Num;
      const net = r.netOfCredits as unknown as Num;
      const annualised = r.annualised as unknown as Num;
      const netAnnualised = r.netOfCreditsAnnualised as unknown as Num;
      const atLatest = r.annualisedAtLatestRates as unknown as Num;

      expectClose(r.totalImportKwh, e.totals.importKwh, 1e-9, 'totals importKwh');
      for (const k of MONEY_KEYS) {
        expectClose(totals[k], e.totals[k], totalTol, `totals ${k}`);
        expectClose(annualised[k], e.annualised[k], annualTol, `annualised ${k}`);
        expectClose(atLatest[k], e.annualisedAtLatestRates[k], annualTol, `annualisedAtLatestRates ${k}`);
      }
      for (const k of NET_KEYS) {
        expectClose(net[k], e.netOfCredits[k], totalTol, `netOfCredits ${k}`);
        expectClose(netAnnualised[k], e.netOfCreditsAnnualised[k], annualTol, `netOfCreditsAnnualised ${k}`);
      }
    });
  }
});

describe('crossover', () => {
  it('is strict: exactly at the crossover does not count as above', () => {
    expect(isAboveCrossover(7.8125)).toBe(false);
    expect(isAboveCrossover(7.8126)).toBe(true);
    expect(isAboveCrossover(7.8124)).toBe(false);
  });
});

describe('missing data', () => {
  const full = { importKwh: 100, genRate: 7, genAmount: 700, vatRate: 0.12 };

  it('names each missing required field', () => {
    expect(missingFields(month({ period: '2026-01' }), false)).toEqual([
      'importKwh',
      'genRate',
      'genAmount',
      'vatRate',
    ]);
    expect(missingFields(month({ period: '2026-01', ...full }), false)).toEqual([]);
  });

  it('requires export fields only with solar, and no export rate when nothing was exported', () => {
    const m = month({ period: '2026-01', ...full });
    expect(missingFields(m, true)).toEqual(['exportKwh', 'exportRate']);
    expect(missingFields({ ...m, exportKwh: 0 }, true)).toEqual([]);
    expect(missingFields({ ...m, exportKwh: 5 }, true)).toEqual(['exportRate']);
  });

  it('leaves an incomplete month out of the totals and lists it', () => {
    const r = calcHousehold(
      [month({ period: '2026-01', ...full }), month({ period: '2026-02', ...full, vatRate: null })],
      { solar: false },
    );
    expect(r.monthsUsed).toBe(1);
    expect(r.months.map((m) => m.period)).toEqual(['2026-01']);
    expect(r.missing).toEqual([{ period: '2026-02', fields: ['vatRate'] }]);
    expect(r.annualiseFactor).toBe(12);
    expect(r.totalImportKwh).toBe(100);
  });

  it('gives no annual figures when no month is complete', () => {
    const r = calcHousehold([month({ period: '2026-01' })], { solar: false });
    expect(r.monthsUsed).toBe(0);
    expect(r.annualised).toBeNull();
    expect(r.netOfCreditsAnnualised).toBeNull();
    expect(r.annualisedAtLatestRates).toBeNull();
  });

  it('ignores export fields when solar is off', () => {
    const r = calcHousehold([month({ period: '2026-01', ...full, exportKwh: 50, exportRate: 6 })], {
      solar: false,
    });
    expect(r.totals.creditsLost).toBe(0);
    expect(r.months[0].exportShare).toBeNull();
  });

  it('leaves out "at latest rates" when the latest month has no export rate to apply', () => {
    const r = calcHousehold(
      [
        month({ period: '2026-01', ...full, exportKwh: 20, exportRate: 6 }),
        month({ period: '2026-02', ...full, exportKwh: 0 }),
      ],
      { solar: true },
    );
    expect(r.monthsUsed).toBe(2);
    expect(r.totals.creditsLost).toBe(120);
    expect(r.annualisedAtLatestRates).toBeNull();
    expect(r.latestRatesPeriod).toBeNull();
  });
});

describe('more than 12 months', () => {
  it('uses the most recent 12 and reports the rest', () => {
    const inputs: MonthInput[] = [];
    for (let i = 0; i < 14; i++) {
      const year = 2025 + Math.floor(i / 12);
      const mm = String((i % 12) + 1).padStart(2, '0');
      inputs.push(month({ period: `${year}-${mm}`, importKwh: 100 + i, genRate: 7, genAmount: 7 * (100 + i), vatRate: 0.12 }));
    }
    const r = calcHousehold([...inputs].reverse(), { solar: false });
    expect(r.monthsUsed).toBe(12);
    expect(r.olderThanWindow).toEqual(['2025-01', '2025-02']);
    expect(r.months[0].period).toBe('2025-03');
    expect(r.months[11].period).toBe('2026-02');
    expect(r.annualiseFactor).toBe(1);
    expect(r.latestRatesPeriod).toBe('2026-02');
  });
});

describe('flags', () => {
  it('lists flagged months that are used', () => {
    const r = calcHousehold(
      [month({ period: '2026-01', importKwh: 1, genRate: 7, genAmount: 7, vatRate: 0.12, estimatedReading: true })],
      { solar: false },
    );
    expect(r.flagged).toEqual([{ period: '2026-01', estimatedReading: true, meterChanged: false }]);
  });
});

describe('checks', () => {
  const base = month({ period: '2026-01', importKwh: 100, genRate: 7 });

  it('passes within P1.00 and fails beyond it on a small amount', () => {
    const small = month({ period: '2026-01', importKwh: 10, genRate: 7 });
    expect(checkMonth({ ...small, genAmount: 71 }).genAmount?.ok).toBe(true);
    expect(checkMonth({ ...small, genAmount: 71.01 }).genAmount?.ok).toBe(false);
    expect(checkMonth({ ...small, genAmount: 68.99 }).genAmount?.ok).toBe(false);
  });

  it('uses 0.5% once that is larger than P1.00', () => {
    const big = month({ period: '2026-01', importKwh: 1000, genRate: 7 });
    expect(checkMonth({ ...big, genAmount: 7035 }).genAmount?.ok).toBe(true);
    expect(checkMonth({ ...big, genAmount: 7036 }).genAmount?.ok).toBe(false);
  });

  it('is not run when a field is missing', () => {
    expect(checkMonth(base).genAmount).toBeNull();
    expect(checkMonth(base).exportCredit).toBeNull();
  });

  it('accepts the export credit with either sign', () => {
    const m = { ...base, exportKwh: 50, exportRate: 6 };
    expect(checkMonth({ ...m, exportCredit: -300 }).exportCredit?.ok).toBe(true);
    expect(checkMonth({ ...m, exportCredit: 300 }).exportCredit?.ok).toBe(true);
    expect(checkMonth({ ...m, exportCredit: 250 }).exportCredit?.ok).toBe(false);
  });
});
