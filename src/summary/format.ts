// Display rounding (SPEC section 8). Rounding happens here only, never in the calc.

/** Nearest 10 under P1,000, nearest 100 from P1,000 up. */
export function roundPesos(n: number): number {
  const step = Math.abs(n) < 1000 ? 10 : 100;
  const rounded = Math.round(n / step) * step;
  return rounded === 0 ? 0 : rounded;
}

/** "P1,200", "-P120". */
export function formatPesos(n: number): string {
  const r = roundPesos(n);
  return `${r < 0 ? '-' : ''}P${Math.abs(r).toLocaleString('en-US')}`;
}

/** kWh as a whole number. */
export function formatKwh(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** A share such as 0.2607 as "26%". */
export function formatShare(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** A rate from the offer, to the centavo: 7.8125 becomes "P7.81". */
export function formatOfferRate(n: number): string {
  return `P${n.toFixed(2)}`;
}
