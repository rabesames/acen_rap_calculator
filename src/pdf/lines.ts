// Turn positioned PDF text items into reading-order lines (SPEC section 5A). Pure.

export interface TextItem {
  str: string;
  /** 1-based page number. */
  page: number;
  x: number;
  /** PDF coordinates: larger y is higher on the page. */
  y: number;
}

export interface Line {
  page: number;
  y: number;
  text: string;
}

const Y_TOLERANCE = 2;

/** Group items into lines by y within a small tolerance, ordered left to right. */
export function groupLines(items: TextItem[], tolerance = Y_TOLERANCE): Line[] {
  const sorted = items
    .filter((it) => it.str.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const groups: TextItem[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    if (current && current[0].page === item.page && Math.abs(current[0].y - item.y) <= tolerance) {
      current.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map((group) => ({
    page: group[0].page,
    y: group[0].y,
    text: group
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/** Rough size of the text layer, used to spot scanned bills. */
export function textLength(items: TextItem[]): number {
  return items.reduce((n, it) => n + it.str.replace(/\s/g, '').length, 0);
}
