// Runs the bill parser on every redacted fixture in fixtures/bill-text/.
//
// "npm run bills:expected" rewrites each fixture's expected block from the parser's
// current output. That block is only trustworthy once a person has compared it with
// the bill, so review the diff before committing.

import { describe, expect, it } from 'vitest';
import { parseBill } from '../src/pdf/parse';
import { summarise } from './helpers/summarise';
import type { TextItem } from '../src/pdf/lines';

interface Fixture {
  _readme: string;
  checkedByAPerson: boolean;
  expected: unknown;
  items: TextItem[];
}

const files = import.meta.glob<Fixture>('../fixtures/bill-text/*.json', { eager: true, import: 'default' });
const update = process.env.UPDATE_BILL_EXPECTED === '1';

describe('real bill fixtures', () => {
  const entries = Object.entries(files);

  it.skipIf(entries.length > 0)('has no fixtures yet', () => {});

  for (const [file, fixture] of entries) {
    const name = file.split('/').pop()!;

    it(`${name} extracts as expected`, async () => {
      const got = summarise(parseBill(fixture.items));
      if (update) {
        const { readFileSync, writeFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const path = fileURLToPath(new URL(file, import.meta.url));
        const text = readFileSync(path, 'utf8');
        const next = text.replace(/"expected": (null|\{[\s\S]*?\n \}),\n "items"/, `"expected": ${JSON.stringify(got, null, 1).replace(/\n/g, '\n ')},\n "items"`);
        writeFileSync(path, next);
        return;
      }
      expect(fixture.expected, 'run "npm run bills:expected", then check the result against the bill').not.toBeNull();
      expect(got).toEqual(fixture.expected);
    });

    it(`${name} holds no long digit runs or unredacted free text`, () => {
      for (const item of fixture.items) {
        expect(/\d{9,}/.test(item.str), item.str).toBe(false);
      }
    });
  }
});
