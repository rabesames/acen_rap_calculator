import { describe, expect, it } from 'vitest';
import { missingFields } from '../calc/calc';
import { emptyValues, isValidPeriod, parseField, periodLabel, toMonthInput, type MonthEntry } from './fields';
import { checkMessages } from './messages';

function entry(values: Partial<MonthEntry['values']>, period = '2026-01'): MonthEntry {
  return { period, values: { ...emptyValues(), ...values }, estimatedReading: false, meterChanged: false };
}

describe('parseField', () => {
  it('treats blank as not entered, without an error', () => {
    expect(parseField('kwh', '')).toEqual({ value: null, error: null, warning: null });
    expect(parseField('rate', '   ')).toEqual({ value: null, error: null, warning: null });
  });

  it('reads plain numbers, thousands separators and spaces', () => {
    expect(parseField('kwh', '412').value).toBe(412);
    expect(parseField('money', '3,465.74').value).toBe(3465.74);
    expect(parseField('money', ' 1 234.5 ').value).toBe(1234.5);
    expect(parseField('kwh', '0').value).toBe(0);
    expect(parseField('money', '.5').value).toBe(0.5);
  });

  it('rejects text and negatives', () => {
    expect(parseField('kwh', 'abc').error).toBe('Enter numbers only.');
    expect(parseField('money', '12.3.4').error).toBe('Enter numbers only.');
    expect(parseField('kwh', '-5').error).toBe('This cannot be negative.');
    expect(parseField('money', '(5)').error).toBe('This cannot be negative.');
    expect(parseField('kwh', '-5').value).toBeNull();
  });

  it('allows rates up to 4 decimals only', () => {
    expect(parseField('rate', '8.4120').value).toBe(8.412);
    expect(parseField('rate', '8.41205').error).toBe('Use at most 4 decimal places.');
  });

  it('stores VAT typed as a percentage as a fraction', () => {
    expect(parseField('percent', '12').value).toBe(0.12);
    expect(parseField('percent', '10.85').value).toBeCloseTo(0.1085, 12);
    expect(parseField('percent', '0').value).toBe(0);
    expect(parseField('percent', '101').error).not.toBeNull();
  });

  it('warns, without blocking, when VAT looks like a fraction', () => {
    const p = parseField('percent', '0.12');
    expect(p.error).toBeNull();
    expect(p.warning).not.toBeNull();
    expect(p.value).toBeCloseTo(0.0012, 12);
  });

  it('accepts the export credit with either sign and stores it positive', () => {
    for (const text of ['300.50', '-300.50', '300.50-', '(300.50)']) {
      expect(parseField('signedMoney', text).value, text).toBe(300.5);
    }
  });
});

describe('period', () => {
  it('validates YYYY-MM', () => {
    expect(isValidPeriod('2026-03')).toBe(true);
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(isValidPeriod('2026-3')).toBe(false);
    expect(isValidPeriod('-')).toBe(false);
  });

  it('labels a period', () => {
    expect(periodLabel('2026-03')).toBe('March 2026');
  });
});

describe('toMonthInput', () => {
  it('turns typed text into numbers and leaves blanks as null', () => {
    const m = toMonthInput(entry({ importKwh: '412', genRate: '8.4120', genAmount: '3,465.74', vatRate: '12' }));
    expect(m.importKwh).toBe(412);
    expect(m.genRate).toBe(8.412);
    expect(m.genAmount).toBe(3465.74);
    expect(m.vatRate).toBe(0.12);
    expect(m.vatAmount).toBeNull();
    expect(m.exportKwh).toBeNull();
    expect(missingFields(m, false)).toEqual([]);
  });

  it('counts a blank required field as missing', () => {
    const m = toMonthInput(entry({ importKwh: '412', genRate: '8.4120', vatRate: '12' }));
    expect(missingFields(m, false)).toEqual(['genAmount']);
  });
});

describe('checkMessages', () => {
  it('is quiet when the amount matches and warns when it does not', () => {
    const good = toMonthInput(entry({ importKwh: '100', genRate: '7', genAmount: '700' }));
    const bad = toMonthInput(entry({ importKwh: '100', genRate: '7', genAmount: '770' }));
    expect(checkMessages(good, false)).toEqual([]);
    expect(checkMessages(bad, false)).toHaveLength(1);
  });

  it('checks the export credit only with solar on', () => {
    const m = toMonthInput(entry({ exportKwh: '50', exportRate: '6', exportCredit: '-250' }));
    expect(checkMessages(m, false)).toEqual([]);
    expect(checkMessages(m, true)).toHaveLength(1);
  });
});
