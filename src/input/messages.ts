// Wording for the cross-check warnings (SPEC section 6). Pure: no DOM.

import { checkMonth } from '../calc/calc';
import type { MonthInput } from '../calc/types';

const pesos = (n: number) => `P${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Warnings for figures that do not agree with each other. Empty when all is well. */
export function checkMessages(m: MonthInput, solar: boolean): string[] {
  const checks = checkMonth(m);
  const out: string[] = [];
  if (checks.genAmount && !checks.genAmount.ok) {
    out.push(
      `Generation amount does not match: import kWh x generation rate is about ${pesos(checks.genAmount.expected)}, ` +
        `but ${pesos(checks.genAmount.entered)} was entered. Compare these three figures with the bill.`,
    );
  }
  if (solar && checks.exportCredit && !checks.exportCredit.ok) {
    out.push(
      `Export credit does not match: export kWh x export rate is about ${pesos(checks.exportCredit.expected)}, ` +
        `but ${pesos(checks.exportCredit.entered)} was entered. Compare these three figures with the bill.`,
    );
  }
  return out;
}
