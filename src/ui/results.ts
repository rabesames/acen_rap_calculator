// Results section: the summary in the order set by SPEC section 8.

import { ATTRIBUTION, type Summary } from '../summary/summary';
import { h } from './dom';
import { EXPLAINER } from './explainer';

export function resultsContent(s: Summary): HTMLElement[] {
  // The explainer comes first in every summary. On screen it is already at the top of
  // the page, so this copy only appears in print.
  const explainer = h(
    'div',
    { class: 'print-only' },
    h('h2', {}, EXPLAINER.title),
    h('ul', {}, ...EXPLAINER.points.map((p) => h('li', {}, p))),
    h('p', { class: 'small' }, EXPLAINER.footer),
  );

  if (s.result.monthsUsed === 0) {
    return [
      h('h2', {}, 'Results'),
      h(
        'p',
        {},
        s.result.missing.length > 0
          ? 'No month is complete yet. Fill in the missing figures above to see a result.'
          : 'Add at least one month from your bills to see a result.',
      ),
    ];
  }

  const { header, rows } = s.monthly;
  return [
    explainer,
    h('h2', {}, 'Results'),
    h('p', { class: `verdict verdict-${s.verdict.kind}` }, s.verdict.sentences.join(' ')),
    h('h3', {}, 'Summary'),
    h(
      'table',
      { class: 'summary-table' },
      h('tbody', {}, ...s.rows.map(([label, value]) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, value)))),
    ),
    h('h3', {}, 'Month by month'),
    h(
      'div',
      { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Month by month table' },
      h(
        'table',
        { class: 'monthly-table' },
        h('thead', {}, h('tr', {}, ...header.map((text) => h('th', { scope: 'col' }, text)))),
        h(
          'tbody',
          {},
          ...rows.map((row) =>
            h('tr', {}, ...row.map((cell, i) => (i === 0 ? h('th', { scope: 'row' }, cell) : h('td', {}, cell)))),
          ),
        ),
      ),
    ),
    h('p', { class: 'small' }, 'Savings are in pesos, rounded. A minus sign means worse off than staying with Meralco.'),
    h('h3', {}, 'Assumptions'),
    h('ul', {}, ...s.assumptions.map((a) => h('li', {}, a))),
    h('h3', {}, 'Caveats'),
    h('ul', {}, ...s.caveats.map((c) => h('li', {}, c))),
    h('p', { class: 'small attribution' }, ATTRIBUTION),
  ];
}
