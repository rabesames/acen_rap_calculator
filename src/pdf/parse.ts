// Find the SPEC section 5 fields in a bill's text lines. Pure: no DOM, no pdf.js.
//
// Meralco bills are laid out in columns, so one row of text often carries an unrelated
// item from the neighbouring column. Each field is therefore read as a label followed
// immediately by figures of an exact shape (for example kWh, then a 4-decimal rate,
// then an amount). Anything after that shape is ignored, and a label whose figures do
// not fit is left alone. A field is filled only when every place it is printed agrees;
// otherwise it stays empty for the household to type. Nothing here reads names,
// addresses or account, meter or service numbers.

import { MONTH_NAMES, type EntryField } from '../input/fields';
import { groupLines, textLength, type Line, type TextItem } from './lines';

export type Problem = 'not-found' | 'ambiguous';

export interface FieldRead {
  /** The figure as printed, without sign, parentheses, unit or percent sign. */
  text: string;
  /** The label and figures it was read from, for the user to compare with the bill. */
  source: string;
  /** True when worked out from other figures on the bill, not printed. */
  derived: boolean;
}

export interface BillFields {
  kind: 'ok';
  /** YYYY-MM, or null when it could not be read. */
  period: string | null;
  periodSource: string | null;
  fields: Partial<Record<EntryField, FieldRead>>;
  problems: Partial<Record<EntryField | 'period', Problem>>;
  /** True when any export figure was found: the household has net metering. */
  hasExport: boolean;
}

export type BillRead = BillFields | { kind: 'no-text' } | { kind: 'not-meralco' };

const MIN_TEXT_LENGTH = 40;
const IS_MERALCO = /meralco|manila\s+electric/i;

type Kind = 'kwh' | 'rate' | 'money' | 'percent' | 'int' | 'other';

interface Token {
  /** Digits as printed, with thousands separators. */
  text: string;
  value: number;
  kind: Kind;
  /** Offset just past this token in the text it was read from. */
  end: number;
}

const NUMBER_WORD = /^(\(?-?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\)?-?)(%|kwh)?$/i;

const GLUED_NUMBER = /^(\(?-?\d[\d,]*\.\d+\)?-?)(?=[A-Za-z])/;

/**
 * The run of figures that directly follows a label. Currency signs and punctuation are
 * skipped; the run ends at the first word that is neither a figure nor a unit.
 */
function figuresAfter(text: string): Token[] {
  const out: Token[] = [];
  for (const word of text.matchAll(/\S+/g)) {
    const end = word.index + word[0].length;
    const last = out[out.length - 1];
    const match = NUMBER_WORD.exec(word[0]);
    if (match) {
      const clean = match[1].replace(/[()\-]/g, '');
      const plain = clean.replace(/,/g, '');
      const decimals = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0;
      const unit = match[2]?.toLowerCase();
      const kind: Kind =
        unit === 'kwh' ? 'kwh' : unit === '%' ? 'percent' : decimals === 4 ? 'rate' : decimals === 2 ? 'money' : decimals === 0 ? 'int' : 'other';
      out.push({ text: clean, value: Number(plain), kind, end });
    } else if (/^kwh$/i.test(word[0]) && last && last.kind !== 'percent') {
      last.kind = 'kwh';
      last.end = end;
    } else if (word[0] === '%' && last) {
      last.kind = 'percent';
      last.end = end;
    } else if (/[A-Za-z0-9]/.test(word[0])) {
      // pdf.js can join a figure to the next column's text with no space between them
      // ("1,669.50Net"). The figure still counts; the run ends there.
      const glued = GLUED_NUMBER.exec(word[0]);
      if (glued) {
        const plain = glued[1].replace(/[()\-,]/g, '');
        const decimals = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0;
        const kind: Kind = decimals === 4 ? 'rate' : decimals === 2 ? 'money' : decimals === 0 ? 'int' : 'other';
        out.push({ text: glued[1].replace(/[()\-]/g, ''), value: Number(plain), kind, end: word.index + glued[1].length });
      }
      break;
    }
  }
  return out;
}

/** One way a label's figures can be laid out, and which field each figure fills. */
interface Shape {
  kinds: Kind[];
  /** Field for each figure, or null for a figure that is only checked. */
  fields: (EntryField | null)[];
}

interface Rule {
  label: RegExp;
  /** Tried in order; the first shape the figures fit is used. */
  shapes: Shape[];
}

const RULES: Rule[] = [
  {
    // Rate Components: kWh, price per kWh, amount.
    label: /generation\s+charge\s*\(\s*php\s*\/\s*kwh\s*\)/i,
    shapes: [
      { kinds: ['kwh', 'rate', 'money'], fields: ['importKwh', 'genRate', 'genAmount'] },
      { kinds: ['rate', 'money'], fields: ['genRate', 'genAmount'] },
    ],
  },
  {
    label: /import\s+energy/i,
    shapes: [{ kinds: ['kwh'], fields: ['importKwh'] }],
  },
  {
    label: /charges\s+for\s+this\s+billing\s+period/i,
    shapes: [{ kinds: ['money'], fields: ['chargesThisPeriod'] }],
  },
  {
    // Net metering line in the bill computation: kWh, price per kWh, amount.
    label: /nm\s*-?\s*export\s+energy\s*kwh\s*(\(\s*php\s*\/\s*kwh\s*\))?/i,
    shapes: [
      { kinds: ['kwh', 'rate', 'money'], fields: ['exportKwh', 'exportRate', 'exportCredit'] },
      { kinds: ['rate'], fields: ['exportRate'] },
    ],
  },
  {
    // Metering Information row: previous reading, current reading, multiplier, kWh, rate.
    label: /export\s+kwh/i,
    shapes: [
      { kinds: ['int', 'int', 'int', 'kwh', 'rate'], fields: [null, null, null, 'exportKwh', 'exportRate'] },
      { kinds: ['kwh', 'rate'], fields: ['exportKwh', 'exportRate'] },
    ],
  },
  {
    label: /net\s+metering\s+export\s+energy/i,
    shapes: [{ kinds: ['money'], fields: ['exportCredit'] }],
  },
  {
    label: /export\s+energy/i,
    shapes: [
      { kinds: ['kwh', 'rate'], fields: ['exportKwh', 'exportRate'] },
      { kinds: ['kwh'], fields: ['exportKwh'] },
    ],
  },
];

/** VAT on generation: the "Generation Charge" line that has no "(PhP/kWh)". */
const VAT_LABEL = /generation\s+charge(?!\s*\()/i;
const VAT_SHAPES: Kind[][] = [['money', 'percent', 'money'], ['percent', 'money'], ['money']];

const EXPORT_FIELDS: EntryField[] = ['exportKwh', 'exportRate', 'exportCredit'];
const MONEY_TOLERANCE = 0.011;

/** Long digit runs are not any field this tool reads, so they are never shown. */
function mask(source: string): string {
  return source.replace(/\d{9,}/g, '***').slice(0, 140);
}

interface Hit {
  tokens: Token[];
  /** Source text covering the label and the first n figures. */
  source(n: number): string;
}

function hits(lines: Line[], label: RegExp): Hit[] {
  const out: Hit[] = [];
  const global = new RegExp(label.source, 'gi');
  for (const line of lines) {
    for (const match of line.text.matchAll(global)) {
      const start = match.index + match[0].length;
      const tokens = figuresAfter(line.text.slice(start));
      out.push({
        tokens,
        source: (n) => mask(line.text.slice(match.index, start + (n > 0 ? tokens[n - 1].end : 0))),
      });
    }
  }
  return out;
}

const fits = (tokens: Token[], kinds: Kind[]) =>
  tokens.length >= kinds.length && kinds.every((kind, i) => tokens[i].kind === kind);

const MONTH_INDEX = new Map<string, number>();
MONTH_NAMES.forEach((name, i) => {
  MONTH_INDEX.set(name.toLowerCase(), i + 1);
  MONTH_INDEX.set(name.slice(0, 3).toLowerCase(), i + 1);
});
MONTH_INDEX.set('sept', 9);

const DATE_SOURCE =
  '(?:(\\d{1,2})\\s+([A-Za-z]{3,9})\\.?,?\\s+(\\d{4})|([A-Za-z]{3,9})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})|([A-Za-z]{3,9})\\.?\\s+(\\d{4}))';
/** "Billing Period" followed directly by a date or a date range. */
const PERIOD = new RegExp(`billing\\s+period\\s*:?\\s*${DATE_SOURCE}(?:\\s*(?:to|until|-|\\u2013)\\s*${DATE_SOURCE})?`, 'gi');

/** Year and month of one date match (11 capture groups), or null when unclear. */
function yearMonth(g: (string | undefined)[]): { year: number; month: number } | null {
  if (g[6] !== undefined) {
    // Numeric dates are only usable when day and month cannot be confused.
    const a = Number(g[6]);
    const b = Number(g[7]);
    const year = Number(g[8]);
    if (a > 12 && b >= 1 && b <= 12) return { year, month: b };
    if (b > 12 && a >= 1 && a <= 12) return { year, month: a };
    return null;
  }
  const name = (g[1] ?? g[3] ?? g[9] ?? '').toLowerCase();
  const year = Number(g[2] ?? g[5] ?? g[10]);
  const month = MONTH_INDEX.get(name);
  return month === undefined ? null : { year, month };
}

/** The billing month is taken as the month the billing period ends in. */
function readPeriod(lines: Line[]): { period: string; source: string } | Problem {
  const found = new Map<string, string>();
  let unclear = false;
  for (const line of lines) {
    for (const match of line.text.matchAll(PERIOD)) {
      const groups = match.slice(1);
      const hasEnd = groups.slice(11).some((g) => g !== undefined);
      const end = yearMonth(hasEnd ? groups.slice(11) : groups.slice(0, 11));
      if (end === null) unclear = true;
      else found.set(`${end.year}-${String(end.month).padStart(2, '0')}`, mask(match[0]));
    }
  }
  if (found.size > 1 || (found.size === 0 && unclear)) return 'ambiguous';
  if (found.size === 0) return 'not-found';
  const [[period, source]] = [...found];
  return { period, source };
}

export function parseBillLines(lines: Line[]): BillFields {
  const candidates = new Map<EntryField, { token: Token; source: string }[]>();
  const add = (field: EntryField, token: Token, source: string) => {
    candidates.set(field, [...(candidates.get(field) ?? []), { token, source }]);
  };

  for (const rule of RULES) {
    for (const hit of hits(lines, rule.label)) {
      const shape = rule.shapes.find((s) => fits(hit.tokens, s.kinds));
      if (!shape) continue;
      const source = hit.source(shape.kinds.length);
      shape.fields.forEach((field, i) => {
        if (field) add(field, hit.tokens[i], source);
      });
    }
  }

  const fields: BillFields['fields'] = {};
  const problems: BillFields['problems'] = {};

  /** Every place a field is printed must agree, or it is left empty. */
  const settle = (field: EntryField) => {
    const list = candidates.get(field) ?? [];
    if (list.length === 0) problems[field] = 'not-found';
    else if (list.some((c) => c.token.value !== list[0].token.value)) problems[field] = 'ambiguous';
    else fields[field] = { text: list[0].token.text, source: list[0].source, derived: false };
  };

  for (const field of ['importKwh', 'genRate', 'genAmount', 'chargesThisPeriod'] as const) settle(field);

  // VAT on generation. Where the line prints its base, it must be the generation amount.
  const genAmount = fields.genAmount ? Number(fields.genAmount.text.replace(/,/g, '')) : null;
  let derivedRate: FieldRead | null = null;
  let baseMismatch = false;
  for (const hit of hits(lines, VAT_LABEL)) {
    const kinds = VAT_SHAPES.find((k) => fits(hit.tokens, k));
    if (!kinds) continue;
    const source = hit.source(kinds.length);
    const amount = hit.tokens[kinds.length - 1];
    if (kinds.length === 3 && genAmount !== null && Math.abs(hit.tokens[0].value - genAmount) > MONEY_TOLERANCE) {
      baseMismatch = true;
      continue;
    }
    add('vatAmount', amount, source);
    const percent = hit.tokens[kinds.indexOf('percent')];
    if (percent) {
      add('vatRate', percent, source);
    } else if (genAmount !== null && genAmount > 0) {
      // Only the VAT amount is printed: work the rate out from the bill's own figures.
      derivedRate = { text: String(Number(((amount.value / genAmount) * 100).toFixed(2))), source, derived: true };
    }
  }
  if (baseMismatch) {
    problems.vatRate = 'ambiguous';
    problems.vatAmount = 'ambiguous';
  } else {
    settle('vatAmount');
    settle('vatRate');
    if (problems.vatRate === 'not-found' && derivedRate && fields.vatAmount) {
      delete problems.vatRate;
      fields.vatRate = derivedRate;
    }
  }

  const hasExport = EXPORT_FIELDS.some((field) => candidates.has(field));
  if (hasExport) EXPORT_FIELDS.forEach(settle);

  const period = readPeriod(lines);
  if (typeof period === 'string') problems.period = period;

  return {
    kind: 'ok',
    period: typeof period === 'string' ? null : period.period,
    periodSource: typeof period === 'string' ? null : period.source,
    fields,
    problems,
    hasExport,
  };
}

/** From raw text items to fields, or the reason the bill cannot be read. */
export function parseBill(items: TextItem[]): BillRead {
  if (textLength(items) < MIN_TEXT_LENGTH) return { kind: 'no-text' };
  const lines = groupLines(items);
  if (!lines.some((line) => IS_MERALCO.test(line.text))) return { kind: 'not-meralco' };
  return parseBillLines(lines);
}
