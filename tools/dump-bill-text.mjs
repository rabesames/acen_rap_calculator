// Turns the bill PDFs in fixtures/bills/ (git-ignored) into redacted text-layout
// fixtures in fixtures/bill-text/ (SPEC section 5A). Run from the repo root:
//
//   node tools/dump-bill-text.mjs
//
// Redaction is a whitelist. An item's text is kept only if it is one of the bill's
// printed labels listed below, or a plain figure sitting on the same row as one of
// those labels. Everything else, including names, addresses, account, meter, service
// and reference numbers, becomes "REDACTED". Long digit runs are never kept.
// A person must still read each fixture before it is committed.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const IN_DIR = 'fixtures/bills';
const OUT_DIR = 'fixtures/bill-text';
const Y_TOLERANCE = 2;

const KEEP_LABELS = [
  /^manila electric company$/i,
  /^billing period:?$/i,
  /^billing period: \d{1,2} [a-z]{3,9} \d{4} to \d{1,2} [a-z]{3,9} \d{4}$/i,
  /^how your bill was computed$/i,
  /^metering information$/i,
  /^rate components$/i,
  /^(base|price|amount|multi|registered|rate\/kwh)$/i,
  /^generation charge( ?\(php\/kwh\))?$/i,
  /^power act reduction$/i,
  /^value added tax$/i,
  /^import energy$/i,
  /^export energy$/i,
  /^export kwh$/i,
  /^net export energy: [\d,.]+ kwh$/i,
  /^net metering export energy$/i,
  /^nm-export energy kwh ?\(php\/kwh\)$/i,
  /^charges for this billing period$/i,
  /^total amount due$/i,
  /^remaining balance from previous bill$/i,
];
const FIGURE = /^[^A-Za-z0-9]*\(?-?[\d,]*\.?\d+\)?-?\s*(%|kWh)?$/;
const LONG_DIGITS = /\d{9,}/;

const isLabel = (text) => !LONG_DIGITS.test(text) && KEEP_LABELS.some((re) => re.test(text.trim()));
const isFigure = (text) => !LONG_DIGITS.test(text) && FIGURE.test(text.trim());

async function readItems(file) {
  const data = new Uint8Array(readFileSync(file));
  const task = pdfjs.getDocument({ data, verbosity: 0, useSystemFonts: false, disableFontFace: true });
  const doc = await task.promise;
  const items = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      items.push({ str: item.str, page: n, x: Math.round(item.transform[4] * 10) / 10, y: Math.round(item.transform[5] * 10) / 10 });
    }
  }
  await task.destroy();
  return items;
}

function redact(items) {
  // A figure is kept only when a kept label shares its row.
  const labelRows = items.filter((it) => isLabel(it.str));
  const onLabelRow = (it) => labelRows.some((l) => l.page === it.page && Math.abs(l.y - it.y) <= Y_TOLERANCE);
  return items.map((it) => {
    const keep = isLabel(it.str) || (isFigure(it.str) && onLabelRow(it));
    // The peso sign has no usable text mapping in these PDFs, so it is dropped.
    return { ...it, str: keep ? it.str.replace(/[^\x20-\x7E]/g, '').trim() : 'REDACTED' };
  });
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function periodOf(items) {
  for (const it of items) {
    const m = /^billing period: .* to \d{1,2} ([a-z]{3})[a-z]* (\d{4})$/i.exec(it.str.trim());
    if (m && MONTHS.includes(m[1].toLowerCase())) {
      return `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

mkdirSync(OUT_DIR, { recursive: true });
const pdfs = readdirSync(IN_DIR).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
if (pdfs.length === 0) console.log(`No PDFs in ${IN_DIR}.`);

let unnamed = 0;
for (const name of pdfs) {
  let items;
  try {
    items = await readItems(path.join(IN_DIR, name));
  } catch (error) {
    console.log(`Skipped one file that could not be opened (${error.name}).`);
    continue;
  }
  // The output name comes from the billing period, never from the PDF's file name.
  const period = periodOf(items);
  const outName = period ? `bill-${period}.json` : `bill-unknown-${++unnamed}.json`;
  const outPath = path.join(OUT_DIR, outName);
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  const redacted = redact(items);
  const fixture = {
    _readme:
      'Redacted text layout of one real bill. Identifiers are replaced by REDACTED. Check this file by eye before committing it. The figures are real bill figures: never use them as defaults or placeholders in the UI.',
    checkedByAPerson: previous.checkedByAPerson === true,
    expected: previous.expected ?? null,
    items: redacted,
  };
  const body = JSON.stringify(fixture, null, 1).replace(/\{\n\s+"str": ("(?:[^"\\]|\\.)*"),\n\s+"page": (\d+),\n\s+"x": ([\d.]+),\n\s+"y": ([\d.]+)\n\s+\}/g, '{ "str": $1, "page": $2, "x": $3, "y": $4 }');
  writeFileSync(outPath, body + '\n');
  const kept = redacted.filter((it) => it.str !== 'REDACTED').length;
  console.log(`${outName}: ${redacted.length} items, ${kept} kept, ${redacted.length - kept} redacted`);
}
console.log('Next: "npm run bills:expected" to fill in the expected fields, then check each file by eye.');
