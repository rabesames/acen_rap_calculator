// The household summary (SPEC section 8) as plain data, so the page and the copied
// text are built from the same content. Pure: no DOM. No identifiers.

import { calcHousehold } from '../calc/calc';
import type { HouseholdResult } from '../calc/types';
import { missingLabels, periodLabel, toMonthInput, type MonthEntry } from '../input/fields';
import { CROSSOVER_RATE, OFFER } from '../offer/offer';
import { EXPLAINER } from '../ui/explainer';
import { formatKwh, formatOfferRate, formatPesos, formatShare } from './format';
import { verdict, type Verdict } from './verdict';

export const ATTRIBUTION =
  'Calculated with a tool a neighbor built with Claude, from figures this household entered from its own bills.';

export interface Summary {
  result: HouseholdResult;
  verdict: Verdict;
  /** Label and value pairs for the summary table. Empty when no month is complete. */
  rows: [string, string][];
  monthly: { header: string[]; rows: string[][] };
  assumptions: string[];
  caveats: string[];
}

function list(periods: string[]): string {
  return periods.map(periodLabel).join(', ');
}

export function buildSummary(entries: MonthEntry[], solar: boolean): Summary {
  const result = calcHousehold(entries.map(toMonthInput), { solar });
  const v = verdict(result, solar);
  const n = result.monthsUsed;
  const enteredRate = new Map(entries.map((e) => [e.period, e.values]));
  const fixedB = formatOfferRate(OFFER.fixedB);

  const rows: [string, string][] = [];
  if (n > 0) {
    const t = result.totals;
    const first = result.months[0].period;
    const last = result.months[n - 1].period;
    const bLow = Math.min(t.bVatOnTop, t.bVatInside);
    const bHigh = Math.max(t.bVatOnTop, t.bVatInside);
    const span = n === 1 ? 'this month' : `these ${n} months`;

    rows.push(['Months covered', n === 1 ? `1 (${periodLabel(first)})` : `${n} (${periodLabel(first)} to ${periodLabel(last)})`]);
    rows.push(['Total import', `${formatKwh(result.totalImportKwh)} kWh`]);
    rows.push([
      `Saving under Option A, ${span}`,
      `${formatPesos(t.aBeforeVat)} before VAT (${formatPesos(t.aInclVat)} with VAT)`,
    ]);
    rows.push([
      `Saving under Option B, ${span}`,
      `${formatPesos(t.bConservative)} (${formatPesos(bLow)} to ${formatPesos(bHigh)} depending on VAT)`,
    ]);
    rows.push([
      `Months with a generation rate above ${formatOfferRate(CROSSOVER_RATE)}`,
      `${result.monthsBAboveCrossover} of ${n}`,
    ]);
    if (solar) rows.push([`Export credits lost, ${span}`, formatPesos(t.creditsLost)]);

    const net = result.netOfCreditsAnnualised!;
    rows.push(['Net effect per year, Option A', formatPesos(net.aBeforeVat)]);
    rows.push(['Net effect per year, Option B', formatPesos(net.bConservative)]);

    const latest = result.netOfCreditsAnnualisedAtLatestRates;
    if (latest && result.latestRatesPeriod && n > 1) {
      rows.push([
        `Per year at ${periodLabel(result.latestRatesPeriod)} rates`,
        `Option A ${formatPesos(latest.aBeforeVat)}, Option B ${formatPesos(latest.bConservative)}`,
      ]);
    }
  }

  const header = ['Month', 'Import kWh', 'Generation rate', 'Saving, Option A', 'Saving, Option B'];
  if (solar) header.push('Export credit lost');
  const monthRows = result.months.map((m) => {
    const row = [
      periodLabel(m.period),
      formatKwh(m.importKwh),
      enteredRate.get(m.period)?.genRate ?? '',
      formatPesos(m.aBeforeVat),
      formatPesos(m.bConservative),
    ];
    if (solar) row.push(formatPesos(m.creditsLost));
    return row;
  });

  const assumptions: string[] = [];
  if (n > 0) {
    assumptions.push(
      `VAT: Option A is shown before VAT. The main Option B figure ignores VAT, because ACEN has not yet said whether VAT is included in the ${fixedB} or added on top; the range covers both cases, using the VAT rate on each bill.`,
    );
    assumptions.push(
      "Only the generation charge is assumed to change. Meralco's other charges are assumed to stay the same, which is still to be confirmed with ACEN.",
    );
    if (n < 12) {
      assumptions.push(
        `Yearly figures are the ${n === 1 ? 'one month' : `${n} months`} entered multiplied by 12/${n}. This ignores seasonal swings.`,
      );
    } else {
      assumptions.push('Yearly figures are the sum of 12 months.');
    }
    if (result.olderThanWindow.length > 0) {
      assumptions.push(`Only the most recent 12 months are used. Left out: ${list(result.olderThanWindow)}.`);
    }
    if (solar && result.annualisedAtLatestRates === null) {
      assumptions.push(
        'No figure at the latest rates is shown, because the latest bill has no export rate to apply to earlier months.',
      );
    }
    const lastMonth = result.months[n - 1];
    const totalExport = result.months.reduce((sum, m) => sum + m.exportKwh, 0);
    if (solar && lastMonth.breakEvenShareA !== null && lastMonth.breakEvenShareB !== null && result.totalImportKwh > 0) {
      const bPart =
        lastMonth.breakEvenShareB > 0
          ? `Option B once exports pass ${formatShare(lastMonth.breakEvenShareB)}`
          : `Option B at any level of export, because that month's generation rate is not above ${fixedB}`;
      assumptions.push(
        `Solar: at ${periodLabel(lastMonth.period)} rates, Option A loses money once exports pass ${formatShare(lastMonth.breakEvenShareA)} of imports, and ${bPart}. This household exported ${formatShare(totalExport / result.totalImportKwh)} of what it imported.`,
      );
    }
    assumptions.push('Savings scale with consumption, so they change if this household expects to use more or less power.');
  }
  for (const m of result.missing) {
    assumptions.push(`${periodLabel(m.period)} is left out because a figure is missing: ${missingLabels(m.fields).join('; ')}.`);
  }
  for (const f of result.flagged) {
    const what = [f.estimatedReading && 'estimated reading', f.meterChanged && 'meter changed'].filter(Boolean).join(', ');
    assumptions.push(`${periodLabel(f.period)} is flagged: ${what}.`);
  }

  const caveats = [`The renewal rate after the ${OFFER.termYears} years is not known.`];
  if (solar) {
    caveats.push('ACEN has not yet said whether net metering is restored if a solar household returns to Meralco.');
  }
  caveats.push("ACEN's written contract governs.");

  return { result, verdict: v, rows, monthly: { header, rows: monthRows }, assumptions, caveats };
}

/** The whole summary as plain text, for copying into a message. */
export function summaryText(s: Summary): string {
  const out: string[] = [];
  out.push(EXPLAINER.title.toUpperCase(), ...EXPLAINER.points.map((p) => `- ${p}`), '', EXPLAINER.footer, '');

  out.push('VERDICT');
  out.push(s.verdict.sentences.length > 0 ? s.verdict.sentences.join(' ') : 'No complete months yet, so there is no result.');
  out.push('');

  if (s.rows.length > 0) {
    out.push('SUMMARY', ...s.rows.map(([label, value]) => `${label}: ${value}`), '');
    out.push('MONTH BY MONTH');
    for (const row of s.monthly.rows) {
      const [month, kwh, rate, a, b, credit] = row;
      const parts = [`${kwh} kWh`, `generation rate ${rate}`, `Option A ${a}`, `Option B ${b}`];
      if (credit !== undefined) parts.push(`export credit lost ${credit}`);
      out.push(`${month}: ${parts.join(', ')}`);
    }
    out.push('');
  }

  if (s.assumptions.length > 0) out.push('ASSUMPTIONS', ...s.assumptions.map((a) => `- ${a}`), '');
  out.push('CAVEATS', ...s.caveats.map((c) => `- ${c}`), '');
  out.push(ATTRIBUTION);
  return out.join('\n');
}
