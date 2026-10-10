// All arithmetic for the calculator (SPEC section 6). Pure: no DOM, no storage, no
// rounding. Callers round for display only.

import { CROSSOVER_RATE, DISCOUNT_A, OFFER } from '../offer/offer';
import type {
  CheckResult,
  FieldKey,
  FlaggedMonth,
  HouseholdResult,
  MissingMonth,
  MonthChecks,
  MonthInput,
  MonthResult,
  NetSums,
  Sums,
} from './types';

export const MAX_MONTHS = 12;
const CHECK_MIN_PESOS = 1.0;
const CHECK_FRACTION = 0.005;
/** Rates are entered to 4 decimals, so compare them as whole ten-thousandths. */
const RATE_SCALE = 10000;

/** A month with every required field entered. */
type CompleteMonth = MonthInput & {
  importKwh: number;
  genRate: number;
  genAmount: number;
  vatRate: number;
};

/**
 * Required fields that have not been entered. A month with any of these is left out of
 * the totals. With solar, export kWh is required, and so is the export rate unless
 * export kWh is zero.
 */
export function missingFields(m: MonthInput, solar: boolean): FieldKey[] {
  const missing: FieldKey[] = [];
  if (m.importKwh === null) missing.push('importKwh');
  if (m.genRate === null) missing.push('genRate');
  if (m.genAmount === null) missing.push('genAmount');
  if (m.vatRate === null) missing.push('vatRate');
  if (solar) {
    if (m.exportKwh === null) missing.push('exportKwh');
    if (m.exportRate === null && m.exportKwh !== 0) missing.push('exportRate');
  }
  return missing;
}

function check(expected: number, entered: number): CheckResult {
  const difference = entered - expected;
  const tolerance = Math.max(CHECK_MIN_PESOS, CHECK_FRACTION * Math.abs(expected));
  return { expected, entered, difference, ok: Math.abs(difference) <= tolerance };
}

/** Cross-checks that flag a likely typo or misread. They never block a month. */
export function checkMonth(m: MonthInput): MonthChecks {
  const genAmount =
    m.importKwh !== null && m.genRate !== null && m.genAmount !== null
      ? check(m.importKwh * m.genRate, m.genAmount)
      : null;
  const exportCredit =
    m.exportKwh !== null && m.exportRate !== null && m.exportCredit !== null
      ? check(m.exportKwh * m.exportRate, Math.abs(m.exportCredit))
      : null;
  return { genAmount, exportCredit };
}

/** Strictly above the crossover rate, compared in whole numbers to avoid float drift. */
export function isAboveCrossover(genRate: number): boolean {
  const g = Math.round(genRate * RATE_SCALE);
  const b = Math.round(OFFER.fixedB * RATE_SCALE);
  return g * (100 - OFFER.discountAPercent) > b * 100;
}

function calcWithRates(
  period: string,
  kWh: number,
  G: number,
  V: number,
  x: number,
  E: number | null,
): MonthResult {
  const B = OFFER.fixedB;
  const hasExport = x > 0 && E !== null;
  return {
    period,
    importKwh: kWh,
    genRate: G,
    vatRate: V,
    exportKwh: x,
    exportRate: E,
    expectedGenAmount: kWh * G,
    aBeforeVat: DISCOUNT_A * G * kWh,
    aInclVat: DISCOUNT_A * G * kWh * (1 + V),
    bConservative: (G - B) * kWh,
    bVatOnTop: (G - B) * kWh * (1 + V),
    bVatInside: G * kWh * (1 + V) - B * kWh,
    bBeatsA: isAboveCrossover(G),
    creditsLost: hasExport ? x * E : 0,
    exportShare: hasExport && kWh > 0 ? x / kWh : null,
    breakEvenShareA: hasExport && E > 0 ? (DISCOUNT_A * G) / E : null,
    breakEvenShareB: hasExport && E > 0 ? (G - B) / E : null,
  };
}

/** Savings for one complete month. Export fields are ignored unless solar is on. */
export function calcMonth(m: CompleteMonth, solar: boolean): MonthResult {
  const x = solar ? (m.exportKwh ?? 0) : 0;
  const E = solar ? m.exportRate : null;
  return calcWithRates(m.period, m.importKwh, m.genRate, m.vatRate, x, E);
}

const SUM_KEYS = [
  'aBeforeVat',
  'aInclVat',
  'bConservative',
  'bVatOnTop',
  'bVatInside',
  'creditsLost',
] as const;

function sum(rows: MonthResult[]): Sums {
  const out: Sums = {
    aBeforeVat: 0,
    aInclVat: 0,
    bConservative: 0,
    bVatOnTop: 0,
    bVatInside: 0,
    creditsLost: 0,
  };
  for (const r of rows) for (const k of SUM_KEYS) out[k] += r[k];
  return out;
}

function scale(s: Sums, factor: number): Sums {
  return {
    aBeforeVat: s.aBeforeVat * factor,
    aInclVat: s.aInclVat * factor,
    bConservative: s.bConservative * factor,
    bVatOnTop: s.bVatOnTop * factor,
    bVatInside: s.bVatInside * factor,
    creditsLost: s.creditsLost * factor,
  };
}

function net(s: Sums): NetSums {
  return {
    aBeforeVat: s.aBeforeVat - s.creditsLost,
    aInclVat: s.aInclVat - s.creditsLost,
    bConservative: s.bConservative - s.creditsLost,
    bVatOnTop: s.bVatOnTop - s.creditsLost,
    bVatInside: s.bVatInside - s.creditsLost,
  };
}

/**
 * Totals for a household. Months with a missing required field are left out and
 * listed. With more than 12 complete months, the most recent 12 are used. Periods
 * are expected to be unique.
 */
export function calcHousehold(inputs: MonthInput[], opts: { solar: boolean }): HouseholdResult {
  const { solar } = opts;
  const sorted = [...inputs].sort((a, b) => a.period.localeCompare(b.period));

  const missing: MissingMonth[] = [];
  const complete: CompleteMonth[] = [];
  for (const m of sorted) {
    const fields = missingFields(m, solar);
    if (fields.length > 0) missing.push({ period: m.period, fields });
    else complete.push(m as CompleteMonth);
  }

  const used = complete.slice(-MAX_MONTHS);
  const olderThanWindow = complete.slice(0, -MAX_MONTHS).map((m) => m.period);
  const months = used.map((m) => calcMonth(m, solar));
  const n = months.length;

  const flagged: FlaggedMonth[] = used
    .filter((m) => m.estimatedReading || m.meterChanged)
    .map((m) => ({
      period: m.period,
      estimatedReading: !!m.estimatedReading,
      meterChanged: !!m.meterChanged,
    }));

  const totals = sum(months);
  const netOfCredits = net(totals);
  const monthsBAboveCrossover = months.filter((r) => r.bBeatsA).length;
  const base = {
    months,
    monthsUsed: n,
    missing,
    olderThanWindow,
    flagged,
    monthsBAboveCrossover,
    monthsBAtOrBelowCrossover: n - monthsBAboveCrossover,
    totalImportKwh: months.reduce((t, r) => t + r.importKwh, 0),
    totals,
    netOfCredits,
  };

  if (n === 0) {
    return {
      ...base,
      annualiseFactor: null,
      annualised: null,
      netOfCreditsAnnualised: null,
      annualisedAtLatestRates: null,
      netOfCreditsAnnualisedAtLatestRates: null,
      latestRatesPeriod: null,
    };
  }

  const factor = MAX_MONTHS / n;
  const annualised = scale(totals, factor);

  // "At latest rates": the most recent month's G, V and E on every month's kWh.
  // If any month exported and the latest month has no export rate, there is no E to
  // apply, so the figure is left out instead of being filled in.
  const last = months[n - 1];
  const anyExport = months.some((r) => r.exportKwh > 0);
  let annualisedAtLatestRates: Sums | null = null;
  if (!anyExport || last.exportRate !== null) {
    const atLatest = months.map((r) =>
      calcWithRates(r.period, r.importKwh, last.genRate, last.vatRate, r.exportKwh, last.exportRate),
    );
    annualisedAtLatestRates = scale(sum(atLatest), factor);
  }

  return {
    ...base,
    annualiseFactor: factor,
    annualised,
    netOfCreditsAnnualised: net(annualised),
    annualisedAtLatestRates,
    netOfCreditsAnnualisedAtLatestRates: annualisedAtLatestRates && net(annualisedAtLatestRates),
    latestRatesPeriod: annualisedAtLatestRates ? last.period : null,
  };
}

export { CROSSOVER_RATE };
