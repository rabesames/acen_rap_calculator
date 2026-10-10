import type { BillRead } from '../../src/pdf/parse';

/** The parser's result without the source previews, in the shape stored in fixtures. */
export function summarise(read: BillRead) {
  if (read.kind !== 'ok') return read;
  return {
    kind: read.kind,
    period: read.period,
    fields: Object.fromEntries(
      Object.entries(read.fields).map(([key, f]) => [key, f.derived ? `${f.text} (derived)` : f.text]),
    ),
    problems: read.problems,
    hasExport: read.hasExport,
  };
}
