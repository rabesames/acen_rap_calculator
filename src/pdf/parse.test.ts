import { describe, expect, it } from 'vitest';
import { OTHER_DOCUMENT, SCANNED_BILL, SYNTHETIC_BILL, type PdfText } from '../../tests/helpers/syntheticPdf';
import { groupLines, type Line, type TextItem } from './lines';
import { parseBill, parseBillLines, type BillFields } from './parse';

// All figures in this file are invented test inputs, not Meralco rates.

const toItems = (pages: PdfText[][]): TextItem[] =>
  pages.flatMap((page, i) => page.map((t) => ({ str: t.text, page: i + 1, x: t.x, y: t.y })));

const lines = (...texts: string[]): Line[] => texts.map((text, i) => ({ page: 1, y: 700 - i * 20, text }));

const values = (bill: BillFields) => Object.fromEntries(Object.entries(bill.fields).map(([k, v]) => [k, v.text]));

const GEN = 'Generation Charge (PhP/kWh) 412 kWh 8.4120 3,465.74';

describe('groupLines', () => {
  it('joins items on the same row left to right and orders rows top to bottom', () => {
    const got = groupLines([
      { str: '412', page: 1, x: 200, y: 499.2 },
      { str: 'Second row', page: 1, x: 50, y: 480 },
      { str: 'Import Energy', page: 1, x: 50, y: 500 },
      { str: 'Page two', page: 2, x: 50, y: 700 },
      { str: '  ', page: 1, x: 10, y: 500 },
    ]);
    expect(got.map((l) => l.text)).toEqual(['Import Energy 412', 'Second row', 'Page two']);
  });
});

describe('parseBill on the synthetic two-column bill', () => {
  const bill = parseBill(toItems(SYNTHETIC_BILL)) as BillFields;

  it('reads every field', () => {
    expect(bill.kind).toBe('ok');
    expect(bill.period).toBe('2026-04');
    expect(values(bill)).toEqual({
      importKwh: '210',
      genRate: '7.9500',
      genAmount: '1,669.50',
      vatRate: '12.0000',
      vatAmount: '200.34',
      chargesThisPeriod: '2,345.67',
      exportKwh: '180',
      exportRate: '6.1000',
      exportCredit: '1,098.00',
    });
    expect(bill.problems).toEqual({});
    expect(bill.hasExport).toBe(true);
    expect(bill.fields.vatRate?.derived).toBe(false);
  });

  it('shows only the label and the figures it used', () => {
    expect(bill.fields.genRate?.source).toBe('Generation Charge (PhP/kWh) 210 kWh 7.9500 1,669.50');
    expect(bill.fields.vatRate?.source).toBe('Generation Charge 1669.50 12.0000% 200.34');
    expect(bill.periodSource).toBe('Billing Period: 12 Mar 2026 to 11 Apr 2026');
  });

  it('never surfaces identifiers, the total due, the previous balance or past payments', () => {
    const everything = JSON.stringify(bill);
    for (const secret of ['9990001112', '99900011122', '999TEST00001', 'Account', 'Reference', '3,456.78', '1,111.11', '2,222.22']) {
      expect(everything, secret).not.toContain(secret);
    }
  });
});

describe('unsupported documents', () => {
  it('reports a scanned bill as having no text', () => {
    expect(parseBill(toItems(SCANNED_BILL))).toEqual({ kind: 'no-text' });
  });

  it('reports a document that is not a Meralco bill', () => {
    expect(parseBill(toItems(OTHER_DOCUMENT))).toEqual({ kind: 'not-meralco' });
  });
});

describe('generation charge line', () => {
  it('gives import kWh, rate and amount', () => {
    expect(values(parseBillLines(lines(GEN)))).toEqual({ importKwh: '412', genRate: '8.4120', genAmount: '3,465.74' });
  });

  it('ignores an item from the neighbouring column on the same row', () => {
    const bill = parseBillLines(lines(`${GEN} Net Metering Export Energy -967.50`));
    expect(values(bill)).toMatchObject({ importKwh: '412', genRate: '8.4120', genAmount: '3,465.74', exportCredit: '967.50' });
    expect(bill.fields.genAmount?.source).toBe(GEN);
  });

  it('still reads the amount when the next column is joined to it without a space', () => {
    const bill = parseBillLines(lines(`${GEN}Net Metering Export Energy -967.50`));
    expect(values(bill)).toMatchObject({ importKwh: '412', genRate: '8.4120', genAmount: '3,465.74' });
    expect(bill.fields.genAmount?.source).toBe(GEN);
  });

  it('is read when it sits to the right of another column', () => {
    const bill = parseBillLines(lines(`12 Feb-11 Mar 2026 20 Mar 2026 Online 2,222.22 ${GEN}`));
    expect(values(bill)).toEqual({ importKwh: '412', genRate: '8.4120', genAmount: '3,465.74' });
  });

  it('is read without a kWh column', () => {
    const bill = parseBillLines(lines('Generation Charge (PhP/kWh) 8.4120 3,465.74'));
    expect(values(bill)).toEqual({ genRate: '8.4120', genAmount: '3,465.74' });
    expect(bill.problems.importKwh).toBe('not-found');
  });

  it('is not taken from the subtotal line or a page-1 summary', () => {
    const bill = parseBillLines(lines('Generation 59.42% 3,465.74', 'Generation 3,465.74'));
    expect(bill.problems.genRate).toBe('not-found');
    expect(bill.problems.genAmount).toBe('not-found');
  });
});

describe('never guess', () => {
  it('leaves fields empty when the figures do not have the expected shape', () => {
    const bill = parseBillLines(lines('Generation Charge (PhP/kWh) 8.4120 7.1055 3,465.74'));
    expect(bill.fields).toEqual({});
    expect(bill.problems.genRate).toBe('not-found');
  });

  it('leaves a field empty when two places disagree, and accepts two that agree', () => {
    expect(parseBillLines(lines(GEN, 'Import Energy 388 kWh')).problems.importKwh).toBe('ambiguous');
    expect(values(parseBillLines(lines(GEN, 'Import Energy 412 kWh'))).importKwh).toBe('412');
  });

  it('does not read a figure separated from its label by other words', () => {
    const bill = parseBillLines(
      lines('Export Energy (see other bills due for payment) 999 kWh', 'Charges for this billing period see page 2 500.00'),
    );
    expect(bill.fields).toEqual({});
    expect(bill.hasExport).toBe(false);
  });

  it('skips a currency sign between the label and the figure', () => {
    expect(values(parseBillLines(lines('Charges for this billing period ₱ 2,345.67'))).chargesThisPeriod).toBe('2,345.67');
  });

  it('never uses Total Amount Due or Remaining Balance', () => {
    const bill = parseBillLines(lines('Total Amount Due 9,999.99', 'Remaining Balance from previous bill 888.88'));
    expect(bill.fields).toEqual({});
  });

  it('does not report export problems for a bill with no export figures', () => {
    const bill = parseBillLines(lines(GEN));
    expect(bill.hasExport).toBe(false);
    expect(bill.problems.exportKwh).toBeUndefined();
  });
});

describe('VAT on generation', () => {
  it('reads the printed rate and amount, whatever the rate is', () => {
    const bill = parseBillLines(lines(GEN, 'VALUE ADDED TAX', 'Generation Charge 3465.74 10.8500% 376.03'));
    expect(bill.fields.vatRate).toEqual({ text: '10.8500', source: 'Generation Charge 3465.74 10.8500% 376.03', derived: false });
    expect(bill.fields.vatAmount?.text).toBe('376.03');
  });

  it('does not take the Rate Components line for the VAT line', () => {
    const bill = parseBillLines(lines(GEN));
    expect(bill.problems.vatRate).toBe('not-found');
    expect(bill.problems.vatAmount).toBe('not-found');
  });

  it('leaves VAT empty when its base is not the generation amount', () => {
    const bill = parseBillLines(lines(GEN, 'Generation Charge 9999.99 10.8500% 376.03'));
    expect(bill.problems.vatRate).toBe('ambiguous');
    expect(bill.problems.vatAmount).toBe('ambiguous');
    expect(bill.fields.vatRate).toBeUndefined();
  });

  it('works the rate out when only the VAT amount is printed, and says so', () => {
    const bill = parseBillLines(lines(GEN, 'Generation Charge 376.03'));
    expect(bill.fields.vatRate).toEqual({ text: '10.85', source: 'Generation Charge 376.03', derived: true });
  });
});

describe('export fields', () => {
  it('reads all three from the NM-Export line', () => {
    const bill = parseBillLines(lines('NM-Export Energy kWh(PhP/kWh) 150 kWh -6.4500 -967.50'));
    expect(values(bill)).toEqual({ exportKwh: '150', exportRate: '6.4500', exportCredit: '967.50' });
    expect(bill.hasExport).toBe(true);
  });

  it('reads kWh and rate from the metering row, skipping the readings', () => {
    const bill = parseBillLines(lines('Export kWh 7634 7784 1 150 kWh -6.4500'));
    expect(values(bill)).toEqual({ exportKwh: '150', exportRate: '6.4500' });
    expect(bill.problems.exportCredit).toBe('not-found');
  });

  it('accepts the credit in parentheses or with a trailing minus', () => {
    expect(values(parseBillLines(lines('Net Metering Export Energy (967.50)'))).exportCredit).toBe('967.50');
    expect(values(parseBillLines(lines('Net Metering Export Energy 967.50-'))).exportCredit).toBe('967.50');
  });

  it('leaves a field empty when the places it is printed disagree', () => {
    const bill = parseBillLines(lines('NM-Export Energy kWh(PhP/kWh) 150 kWh -6.4500 -967.50', 'Net Export Energy: 151 kWh'));
    expect(bill.problems.exportKwh).toBe('ambiguous');
    expect(values(bill)).toEqual({ exportRate: '6.4500', exportCredit: '967.50' });
  });
});

describe('billing period', () => {
  const period = (...texts: string[]) => parseBillLines(lines(...texts));

  it('takes the month the period ends in', () => {
    expect(period('Billing Period: 12 Jan 2026 to 11 Feb 2026').period).toBe('2026-02');
    expect(period('Billing Period: 29 Dec 2025 to 28 Jan 2026').period).toBe('2026-01');
    expect(period('Billing Period January 12, 2026 - February 11, 2026').period).toBe('2026-02');
    expect(period('Billing Period: March 2026').period).toBe('2026-03');
  });

  it('shows only the label and the dates, not the rest of the row', () => {
    const bill = period('Bill Reference No.: 99900011122 Billing Period: 12 Jan 2026 to 11 Feb 2026 Print Seq. 123456');
    expect(bill.periodSource).toBe('Billing Period: 12 Jan 2026 to 11 Feb 2026');
  });

  it('ignores a label that is a column heading, and dates that belong to something else', () => {
    const bill = period('Billing Period Bill Date', '9990001112 09 Sep 2026', 'Billing Period Posting Date Amount Paid');
    expect(bill.problems.period).toBe('not-found');
  });

  it('accepts numeric dates only when day and month cannot be confused', () => {
    expect(period('Billing Period 01/13/2026 - 02/14/2026').period).toBe('2026-02');
    expect(period('Billing Period 01/12/2026 - 02/11/2026').problems.period).toBe('ambiguous');
  });

  it('is left empty when pages disagree', () => {
    expect(period('Billing Period: 12 Jan 2026 to 11 Feb 2026', 'Billing Period: 12 Feb 2026 to 11 Mar 2026').problems.period).toBe('ambiguous');
  });
});
