// Runs the real pdf.js on synthetic PDFs. Under Node there is no Worker, so this covers
// the main-thread fallback path; the worker path is covered by the browser test.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BillFileError, looksLikePdf, readPdfText } from '../src/pdf/extract';
import { parseBill, type BillFields } from '../src/pdf/parse';
import { summarise } from './helpers/summarise';
import { OTHER_DOCUMENT, SCANNED_BILL, SYNTHETIC_BILL, makePdf } from './helpers/syntheticPdf';

const noPassword = async () => null;

describe('readPdfText', () => {
  it('reads the synthetic bill end to end on the main thread', async () => {
    const { items, mode } = await readPdfText(makePdf(SYNTHETIC_BILL), noPassword);
    expect(mode).toBe('main-thread');
    const bill = parseBill(items) as BillFields;
    expect(bill.kind).toBe('ok');
    expect(bill.period).toBe('2026-04');
    expect(bill.fields.genRate?.text).toBe('7.9500');
    expect(bill.fields.genAmount?.text).toBe('1,669.50');
    expect(bill.fields.vatRate?.text).toBe('12.0000');
    expect(bill.fields.importKwh?.text).toBe('210');
    expect(bill.fields.exportCredit?.text).toBe('1,098.00');
    expect(bill.problems).toEqual({});
  });

  it('gives the manual-entry outcome for a scanned PDF', async () => {
    const { items } = await readPdfText(makePdf(SCANNED_BILL), noPassword);
    expect(parseBill(items)).toEqual({ kind: 'no-text' });
  });

  it('gives the manual-entry outcome for a PDF that is not a Meralco bill', async () => {
    const { items } = await readPdfText(makePdf(OTHER_DOCUMENT), noPassword);
    expect(parseBill(items)).toEqual({ kind: 'not-meralco' });
  });

  it('rejects a file that is not a PDF', async () => {
    const bytes = new TextEncoder().encode('just some text, not a PDF');
    expect(looksLikePdf(bytes)).toBe(false);
    await expect(readPdfText(bytes, noPassword)).rejects.toMatchObject({ kind: 'not-pdf' });
  });

  it('rejects a damaged PDF', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nthis is not a real document');
    await expect(readPdfText(bytes, noPassword)).rejects.toBeInstanceOf(BillFileError);
  });
});

// Local only: the real PDFs in fixtures/bills/ are git-ignored. Where they are present,
// each must read the same from the PDF as from its redacted fixture, which shows that
// redaction did not change what the parser sees.
describe('real bill PDFs (local only)', () => {
  const dir = 'fixtures/bills';
  const pdfs = existsSync(dir) ? readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.pdf')) : [];
  const fixtures = import.meta.glob<{ expected: { period?: string } | null }>('../fixtures/bill-text/*.json', {
    eager: true,
    import: 'default',
  });
  const byPeriod = new Map(Object.values(fixtures).map((f) => [f.expected?.period, f.expected]));

  it.skipIf(pdfs.length === 0)('reads each PDF the same as its redacted fixture', async () => {
    let matched = 0;
    for (const name of pdfs) {
      const { items } = await readPdfText(new Uint8Array(readFileSync(`${dir}/${name}`)), noPassword);
      const got = summarise(parseBill(items));
      expect(got.kind).toBe('ok');
      const period = 'period' in got ? got.period : null;
      expect(period, 'billing period could not be read from one of the PDFs').not.toBeNull();
      expect(got).toEqual(byPeriod.get(period ?? undefined));
      matched++;
    }
    expect(matched).toBe(pdfs.length);
  });
});
