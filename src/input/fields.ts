// Field definitions and text-to-number parsing for the entry form (SPEC section 5).
// Pure: no DOM. Entries keep the text the household typed so rates show "as entered".

import type { FieldKey, MonthInput } from '../calc/types';

export type EntryField =
  | 'importKwh'
  | 'genRate'
  | 'genAmount'
  | 'vatRate'
  | 'vatAmount'
  | 'chargesThisPeriod'
  | 'exportKwh'
  | 'exportRate'
  | 'exportCredit';

export type FieldKind = 'kwh' | 'rate' | 'money' | 'percent' | 'signedMoney';

export interface FieldDef {
  key: EntryField;
  label: string;
  /** Where to find it on the bill. */
  hint: string;
  kind: FieldKind;
  /** Shown only when the household has solar with net metering. */
  solar: boolean;
  optional: boolean;
}

export const FIELDS: readonly FieldDef[] = [
  {
    key: 'importKwh',
    label: 'Import energy, kWh',
    hint: 'Page 1 "Import Energy", or "Registered" kWh in Metering Information. Without solar this is the kWh consumed.',
    kind: 'kwh',
    solar: false,
    optional: false,
  },
  {
    key: 'genRate',
    label: 'Generation charge rate, PhP/kWh',
    hint: 'Page 2, Rate Components, "Generation Charge (PhP/kWh)", Price column.',
    kind: 'rate',
    solar: false,
    optional: false,
  },
  {
    key: 'genAmount',
    label: 'Generation amount, PhP',
    hint: 'Same line, Amount column. Used to check the two figures above.',
    kind: 'money',
    solar: false,
    optional: false,
  },
  {
    key: 'vatRate',
    label: 'VAT rate on generation, %',
    hint: 'Page 2, under VALUE ADDED TAX, "Generation Charge" line. Enter the percentage printed on your bill.',
    kind: 'percent',
    solar: false,
    optional: false,
  },
  {
    key: 'vatAmount',
    label: 'VAT amount on generation, PhP',
    hint: 'Same line as the VAT rate.',
    kind: 'money',
    solar: false,
    optional: true,
  },
  {
    key: 'chargesThisPeriod',
    label: 'Charges for this billing period, PhP',
    hint: 'Page 1, Bill Computation Summary. Not "Total Amount Due".',
    kind: 'money',
    solar: false,
    optional: true,
  },
  {
    key: 'exportKwh',
    label: 'Export energy, kWh',
    hint: 'Page 1 "Export Energy", or "Export kWh" row in Metering Information. Enter 0 if nothing was exported.',
    kind: 'kwh',
    solar: true,
    optional: false,
  },
  {
    key: 'exportRate',
    label: 'Export rate, PhP/kWh',
    hint: '"Rate/kWh" on the Export row, or "NM-Export Energy kWh" Price. Not needed when export is 0.',
    kind: 'rate',
    solar: true,
    optional: false,
  },
  {
    key: 'exportCredit',
    label: 'Export credit, PhP',
    hint: '"Net Metering Export Energy", shown as a negative amount. Either sign is fine.',
    kind: 'signedMoney',
    solar: true,
    optional: true,
  },
];

export const FIELD_LABELS: Record<EntryField, string> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f.label]),
) as Record<EntryField, string>;

export const ENTRY_FIELDS: readonly EntryField[] = FIELDS.map((f) => f.key);

/** One billing month as typed. Values are the household's own text, '' when blank. */
export interface MonthEntry {
  period: string;
  values: Record<EntryField, string>;
  estimatedReading: boolean;
  meterChanged: boolean;
}

export function emptyValues(): Record<EntryField, string> {
  return Object.fromEntries(ENTRY_FIELDS.map((k) => [k, ''])) as Record<EntryField, string>;
}

export interface ParsedField {
  /** null when blank or not a usable number. */
  value: number | null;
  error: string | null;
  /** A hint that the entry is unusual. It does not block saving. */
  warning: string | null;
}

const MAX_RATE_DECIMALS = 4;
const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;

/**
 * Parse one field's text. Blank is allowed (value null, no error). Thousands separators
 * and spaces are ignored. Only the export credit may carry a minus sign or parentheses,
 * and it is stored positive. VAT is typed as a percentage and returned as a fraction.
 */
export function parseField(kind: FieldKind, text: string): ParsedField {
  let t = text.replace(/[\s,]/g, '');
  if (t === '') return { value: null, error: null, warning: null };

  if (kind === 'signedMoney') {
    t = t.replace(/^\((.*)\)$/, '$1').replace(/^-/, '').replace(/-$/, '');
  }
  if (!PLAIN_NUMBER.test(t)) {
    const error = /^-|-$|^\(.*\)$/.test(t) ? 'This cannot be negative.' : 'Enter numbers only.';
    return { value: null, error, warning: null };
  }

  const decimals = t.includes('.') ? t.length - t.indexOf('.') - 1 : 0;
  if (kind === 'rate' && decimals > MAX_RATE_DECIMALS) {
    return { value: null, error: `Use at most ${MAX_RATE_DECIMALS} decimal places.`, warning: null };
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, error: 'Enter numbers only.', warning: null };

  if (kind === 'percent') {
    if (n > 100) return { value: null, error: 'A percentage cannot be more than 100.', warning: null };
    const warning =
      n > 0 && n < 1 ? 'This looks like a fraction. Enter the percentage as printed on the bill.' : null;
    return { value: n / 100, error: null, warning };
  }
  return { value: n, error: null, warning: null };
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(period: string): boolean {
  return PERIOD.test(period);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export { MONTH_NAMES };

/** "2026-03" to "March 2026". */
export function periodLabel(period: string): string {
  if (!isValidPeriod(period)) return period;
  return `${MONTH_NAMES[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;
}

/** Numbers for the calc module. A field that does not parse counts as not entered. */
export function toMonthInput(entry: MonthEntry): MonthInput {
  const num = (key: EntryField): number | null => {
    const def = FIELDS.find((f) => f.key === key)!;
    return parseField(def.kind, entry.values[key] ?? '').value;
  };
  return {
    period: entry.period,
    importKwh: num('importKwh'),
    genRate: num('genRate'),
    genAmount: num('genAmount'),
    vatRate: num('vatRate'),
    vatAmount: num('vatAmount'),
    chargesThisPeriod: num('chargesThisPeriod'),
    exportKwh: num('exportKwh'),
    exportRate: num('exportRate'),
    exportCredit: num('exportCredit'),
    estimatedReading: entry.estimatedReading,
    meterChanged: entry.meterChanged,
  };
}

export function missingLabels(fields: FieldKey[]): string[] {
  return fields.map((f) => FIELD_LABELS[f]);
}
