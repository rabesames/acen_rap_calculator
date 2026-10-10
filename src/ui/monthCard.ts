// One saved month: the figures as entered, whether it counts, and any check warnings.

import { missingFields } from '../calc/calc';
import { FIELDS, missingLabels, periodLabel, toMonthInput, type MonthEntry } from '../input/fields';
import { checkMessages } from '../input/messages';
import { h } from './dom';

export interface MonthCardOptions {
  entry: MonthEntry;
  solar: boolean;
  onEdit(): void;
  onRemove(): void;
}

export function monthCard(opts: MonthCardOptions): HTMLElement {
  const { entry, solar } = opts;
  const input = toMonthInput(entry);
  const missing = missingFields(input, solar);
  const complete = missing.length === 0;

  const rows = FIELDS.filter((f) => (solar || !f.solar) && entry.values[f.key] !== '').map((f) =>
    h('div', { class: 'row' }, h('dt', {}, f.label), h('dd', {}, entry.values[f.key])),
  );

  const flags = [entry.estimatedReading && 'estimated reading', entry.meterChanged && 'meter changed'].filter(
    (x): x is string => !!x,
  );

  let armed = false;
  const removeButton = h('button', { type: 'button', class: 'danger' }, 'Remove');
  removeButton.addEventListener('click', () => {
    if (armed) return opts.onRemove();
    armed = true;
    removeButton.textContent = 'Tap again to remove';
  });
  removeButton.addEventListener('blur', () => {
    armed = false;
    removeButton.textContent = 'Remove';
  });

  return h(
    'article',
    { class: complete ? 'card' : 'card incomplete' },
    h(
      'header',
      { class: 'card-head' },
      h('h3', {}, periodLabel(entry.period)),
      h('span', { class: complete ? 'pill ok' : 'pill warn' }, complete ? 'Counted' : 'Not counted'),
    ),
    rows.length > 0 ? h('dl', {}, ...rows) : null,
    !complete &&
      h('p', { class: 'note warn' }, `Left out of the totals. Missing: ${missingLabels(missing).join('; ')}.`),
    ...checkMessages(input, solar).map((msg) => h('p', { class: 'note warn' }, msg)),
    flags.length > 0 && h('p', { class: 'note' }, `Flagged: ${flags.join(', ')}.`),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', onclick: () => opts.onEdit() }, 'Edit'),
      removeButton,
    ),
  );
}
