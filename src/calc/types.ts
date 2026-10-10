// Types for the calc module. Field keys follow SPEC section 5.
// There are deliberately no fields for name, address, account, meter or service ID.

/** One billing month as entered by the household. null means not entered. */
export interface MonthInput {
  /** Billing period, YYYY-MM. */
  period: string;
  importKwh: number | null;
  /** Generation charge rate, PhP/kWh, from the bill. */
  genRate: number | null;
  genAmount: number | null;
  /** VAT rate on generation as a fraction (0.12 for 12%). */
  vatRate: number | null;
  vatAmount: number | null;
  chargesThisPeriod: number | null;
  exportKwh: number | null;
  exportRate: number | null;
  /** Stored positive; either sign is accepted. */
  exportCredit: number | null;
  estimatedReading?: boolean;
  meterChanged?: boolean;
}

export type FieldKey =
  | 'importKwh'
  | 'genRate'
  | 'genAmount'
  | 'vatRate'
  | 'exportKwh'
  | 'exportRate';

export interface CheckResult {
  expected: number;
  entered: number;
  difference: number;
  ok: boolean;
}

/** Cross-checks from SPEC section 6. null when the fields needed are not all entered. */
export interface MonthChecks {
  genAmount: CheckResult | null;
  exportCredit: CheckResult | null;
}

/** Savings per month, in PhP at full precision. Positive means cheaper than Meralco. */
export interface MonthResult {
  period: string;
  importKwh: number;
  genRate: number;
  vatRate: number;
  exportKwh: number;
  exportRate: number | null;
  expectedGenAmount: number;
  aBeforeVat: number;
  aInclVat: number;
  bConservative: number;
  bVatOnTop: number;
  bVatInside: number;
  /** True only when the generation rate is strictly above the crossover rate. */
  bBeatsA: boolean;
  creditsLost: number;
  /** Export kWh / import kWh. null without exports or without imports. */
  exportShare: number | null;
  breakEvenShareA: number | null;
  breakEvenShareB: number | null;
}

export interface Sums {
  aBeforeVat: number;
  aInclVat: number;
  bConservative: number;
  bVatOnTop: number;
  bVatInside: number;
  creditsLost: number;
}

export type NetSums = Omit<Sums, 'creditsLost'>;

export interface MissingMonth {
  period: string;
  fields: FieldKey[];
}

export interface FlaggedMonth {
  period: string;
  estimatedReading: boolean;
  meterChanged: boolean;
}

export interface HouseholdResult {
  /** Months used in the totals, oldest first. */
  months: MonthResult[];
  monthsUsed: number;
  /** Months left out because a required field is missing. */
  missing: MissingMonth[];
  /** Complete months left out because more than 12 were entered. */
  olderThanWindow: string[];
  flagged: FlaggedMonth[];
  monthsBAboveCrossover: number;
  monthsBAtOrBelowCrossover: number;
  totalImportKwh: number;
  totals: Sums;
  netOfCredits: NetSums;
  /** 12 / monthsUsed. null when no complete months. */
  annualiseFactor: number | null;
  annualised: Sums | null;
  netOfCreditsAnnualised: NetSums | null;
  /** Latest month's rates applied to every month's kWh, annualised. */
  annualisedAtLatestRates: Sums | null;
  netOfCreditsAnnualisedAtLatestRates: NetSums | null;
  /** Period whose rates were used for the "at latest rates" figures. */
  latestRatesPeriod: string | null;
}
