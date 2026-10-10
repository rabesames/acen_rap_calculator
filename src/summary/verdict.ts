// Verdict rules (SPEC section 8). Deterministic, worded as an estimate, never as advice.

import type { HouseholdResult } from '../calc/types';
import { CROSSOVER_RATE, OFFER } from '../offer/offer';
import { formatOfferRate, formatPesos } from './format';

export type VerdictKind = 'none' | 'stay' | 'no-saving' | 'close' | 'a' | 'b';

export interface Verdict {
  kind: VerdictKind;
  /** Empty when there is no verdict yet. */
  sentences: string[];
}

export const ESTIMATE_LINE = 'This is an estimate to help you decide, not advice.';
const CLOSE_FRACTION = 0.1;

const OPTION_A = `Option A (${OFFER.discountAPercent}% off)`;
const OPTION_B = `Option B (fixed ${formatOfferRate(OFFER.fixedB)} per kWh)`;

/**
 * Compares Option A before VAT with Option B's conservative figure, both per year and
 * net of lost export credits.
 */
export function verdict(result: HouseholdResult, solar: boolean): Verdict {
  const net = result.netOfCreditsAnnualised;
  if (result.monthsUsed === 0 || net === null) return { kind: 'none', sentences: [] };

  const a = net.aBeforeVat;
  const b = net.bConservative;
  const done = (kind: VerdictKind, ...sentences: string[]): Verdict => ({
    kind,
    sentences: [...sentences, ESTIMATE_LINE],
  });

  if (solar && a < 0 && b < 0) {
    return done('stay', 'On these bills, this household looks better off staying with Meralco.');
  }
  if (a <= 0 && b <= 0) {
    return done('no-saving', 'On these bills, neither option shows a saving for this household.');
  }

  if (Math.abs(a - b) <= CLOSE_FRACTION * Math.max(Math.abs(a), Math.abs(b))) {
    return done(
      'close',
      `On these bills, the two options come out close for this household: about ${formatPesos(a)} a year under Option A and about ${formatPesos(b)} a year under Option B.`,
      `Option B is a known price for ${OFFER.termYears} years; Option A is a ${a < b ? 'smaller saving' : 'saving'} that cannot turn negative.`,
    );
  }

  if (b > a) {
    return done(
      'b',
      `On these bills, ${OPTION_B} looks better for this household, at about ${formatPesos(b)} a year.`,
      `This depends on Meralco's generation rate staying above ${formatOfferRate(CROSSOVER_RATE)} and on whether VAT is added to the ${formatOfferRate(OFFER.fixedB)}, which ACEN has not yet answered.`,
    );
  }

  return done(
    'a',
    `On these bills, ${OPTION_A} looks better for this household, at about ${formatPesos(a)} a year.`,
    solar
      ? "Option A's price can never be higher than Meralco's generation charge, but the export credits are still lost."
      : 'Option A can never cost more than Meralco.',
  );
}
