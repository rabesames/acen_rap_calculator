// Entry form for one billing month. Blank fields are allowed (the month is then left
// out of the totals); badly formed numbers and duplicate periods block saving.
// The same form shows a bill read from a PDF in its "please check" state.

import {
  FIELDS,
  MONTH_NAMES,
  emptyValues,
  isValidPeriod,
  parseField,
  periodLabel,
  toMonthInput,
  type EntryField,
  type MonthEntry,
} from '../input/fields';
import { checkMessages } from '../input/messages';
import { h } from './dom';

/** What the PDF reader found, shown beside each field for the user to compare. */
export interface PdfPrefill {
  /** The bill line each pre-filled field came from. */
  sources: Partial<Record<EntryField, { line: string; derived: boolean }>>;
  periodSource: string | null;
  /** Shown above the fields, for example why the solar option was turned on. */
  notices: string[];
}

export interface MonthFormOptions {
  /** Makes element ids unique when several forms are on the page. */
  idPrefix: string;
  /** The month being edited or checked, or null for a new one. Its period may be ''. */
  entry: MonthEntry | null;
  solar: boolean;
  /** Periods already entered, other than the one being edited. */
  takenPeriods: () => string[];
  /** Present when the values came from a PDF and still need checking. */
  pdf?: PdfPrefill;
  onSave(entry: MonthEntry): void;
  onCancel(): void;
}

export interface MonthForm {
  el: HTMLFormElement;
  setSolar(solar: boolean): void;
  focus(): void;
}

const YEARS_BACK = 4;

export function monthForm(opts: MonthFormOptions): MonthForm {
  let solar = opts.solar;
  const editing = opts.entry;
  const pdf = opts.pdf;
  const id = (name: string) => `${opts.idPrefix}-${name}`;
  const startPeriod = editing && isValidPeriod(editing.period) ? editing.period : null;
  const inputs = {} as Record<EntryField, HTMLInputElement>;
  const notes = {} as Record<EntryField, HTMLElement>;

  // Period
  const monthSelect = h(
    'select',
    { id: id('month'), 'aria-describedby': id('period-note') },
    h('option', { value: '' }, 'Month'),
  );
  MONTH_NAMES.forEach((name, i) => monthSelect.append(h('option', { value: String(i + 1).padStart(2, '0') }, name)));
  const yearSelect = h(
    'select',
    { id: id('year'), 'aria-label': 'Year', 'aria-describedby': id('period-note') },
    h('option', { value: '' }, 'Year'),
  );
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear + 1; y >= thisYear - YEARS_BACK; y--) years.push(y);
  const startYear = startPeriod ? Number(startPeriod.slice(0, 4)) : null;
  if (startYear !== null && !years.includes(startYear)) years.push(startYear);
  years.sort((a, b) => b - a).forEach((y) => yearSelect.append(h('option', { value: String(y) }, String(y))));
  if (startPeriod) {
    yearSelect.value = startPeriod.slice(0, 4);
    monthSelect.value = startPeriod.slice(5);
  }
  const periodNote = h('p', { id: id('period-note'), class: 'field-note', role: 'alert' });
  const saveButton = h('button', { type: 'submit', class: 'primary' }, '');

  const period = () => `${yearSelect.value}-${monthSelect.value}`;
  const isTaken = () => isValidPeriod(period()) && opts.takenPeriods().includes(period());
  const periodError = (): string | null => {
    if (!isValidPeriod(period())) return 'Choose the billing month and year.';
    // A bill read from a PDF may replace a month already entered, once the user agrees.
    if (!pdf && isTaken()) return `${periodLabel(period())} is already entered. Edit that month instead.`;
    return null;
  };
  const saveLabel = () => {
    if (!pdf) return startPeriod ? 'Save changes' : 'Save month';
    return isTaken() ? `Replace ${periodLabel(period())} with these figures` : 'Confirm these figures';
  };
  const showPeriod = (force: boolean) => {
    const complete = monthSelect.value !== '' && yearSelect.value !== '';
    const error = force || complete ? periodError() : null;
    const warning =
      !error && pdf && isTaken() ? `${periodLabel(period())} is already entered. Confirming will replace it.` : '';
    periodNote.textContent = error ?? warning;
    periodNote.className = error ? 'field-note error' : warning ? 'field-note warn' : 'field-note';
    saveButton.textContent = saveLabel();
    return error;
  };
  monthSelect.addEventListener('change', () => showPeriod(false));
  yearSelect.addEventListener('change', () => showPeriod(false));

  // Number fields
  const checksBox = h('div', { class: 'checks', 'aria-live': 'polite' });
  const current = (): MonthEntry => {
    const values = emptyValues();
    for (const f of FIELDS) values[f.key] = inputs[f.key].value.trim();
    return {
      period: period(),
      values,
      estimatedReading: estimated.checked,
      meterChanged: meterChanged.checked,
    };
  };
  const showField = (key: EntryField): boolean => {
    const def = FIELDS.find((f) => f.key === key)!;
    const parsed = parseField(def.kind, inputs[key].value);
    const text = parsed.error ?? parsed.warning ?? '';
    notes[key].textContent = text;
    notes[key].className = parsed.error ? 'field-note error' : parsed.warning ? 'field-note warn' : 'field-note';
    inputs[key].setAttribute('aria-invalid', parsed.error ? 'true' : 'false');
    return parsed.error === null;
  };
  const showChecks = () => {
    checksBox.replaceChildren(
      ...checkMessages(toMonthInput(current()), solar).map((msg) => h('p', { class: 'note warn' }, msg)),
    );
  };

  const sourceNote = (label: string, line: string) =>
    h(
      'details',
      { class: 'source' },
      h('summary', {}, `${label}. Show the line`),
      h('p', { class: 'source-line' }, line),
    );

  const fieldRow = (key: EntryField) => {
    const def = FIELDS.find((f) => f.key === key)!;
    const input = h('input', {
      id: id(key),
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      'aria-describedby': `${id(key)}-hint ${id(key)}-note`,
    });
    input.value = editing?.values[key] ?? '';
    const source = pdf?.sources[key];
    const unread = !!pdf && !source && !def.optional && input.value === '';
    if (unread) input.classList.add('unread');
    input.addEventListener('input', () => {
      showField(key);
      showChecks();
    });
    inputs[key] = input;
    notes[key] = h('p', { id: `${id(key)}-note`, class: 'field-note', role: 'alert' });
    return h(
      'div',
      { class: 'field' },
      h('label', { for: id(key) }, def.label, def.optional ? h('span', { class: 'optional' }, ' (optional)') : null),
      input,
      source ? sourceNote(source.derived ? 'Worked out from the bill' : 'Read from the PDF', source.line) : null,
      unread ? h('p', { class: 'field-note warn' }, 'Could not read this from the PDF. Type it from the bill.') : null,
      h('p', { id: `${id(key)}-hint`, class: 'hint' }, def.hint),
      notes[key],
    );
  };

  const baseFields = FIELDS.filter((f) => !f.solar).map((f) => fieldRow(f.key));
  const solarFields = h(
    'fieldset',
    { class: 'solar-fields' },
    h('legend', {}, 'Solar and net metering'),
    ...FIELDS.filter((f) => f.solar).map((f) => fieldRow(f.key)),
  );
  solarFields.hidden = !solar;

  const estimated = h('input', { type: 'checkbox', id: id('estimated') });
  estimated.checked = editing?.estimatedReading ?? false;
  const meterChanged = h('input', { type: 'checkbox', id: id('meter') });
  meterChanged.checked = editing?.meterChanged ?? false;

  const formNote = h('p', { class: 'field-note error', role: 'alert' });

  const heading = pdf
    ? h('div', { class: 'card-head' }, h('h3', {}, 'Bill read from PDF'), h('span', { class: 'pill warn' }, 'Please check'))
    : h('h3', {}, startPeriod ? `Edit ${periodLabel(startPeriod)}` : 'Add a month');

  const el = h(
    'form',
    { class: pdf ? 'card form please-check' : 'card form', novalidate: true },
    heading,
    pdf
      ? h(
          'p',
          { class: 'small' },
          'Compare every figure with your bill and correct anything that is wrong. Nothing counts until you confirm.',
        )
      : null,
    ...(pdf?.notices ?? []).map((text) => h('p', { class: 'note' }, text)),
    h(
      'div',
      { class: 'field' },
      h('label', { for: id('month') }, 'Billing period'),
      h('div', { class: 'period' }, monthSelect, yearSelect),
      pdf?.periodSource ? sourceNote('Read from the PDF', pdf.periodSource) : null,
      pdf && !startPeriod
        ? h('p', { class: 'field-note warn' }, 'Could not read this from the PDF. Choose it from the bill.')
        : null,
      h('p', { class: 'hint' }, 'Page 1, top left.'),
      periodNote,
    ),
    ...baseFields,
    solarFields,
    h(
      'fieldset',
      { class: 'flags' },
      h('legend', {}, 'Anything unusual about this bill?'),
      h('label', { class: 'check' }, estimated, 'Estimated reading'),
      h('label', { class: 'check' }, meterChanged, 'Meter changed'),
    ),
    checksBox,
    formNote,
    h(
      'div',
      { class: 'actions' },
      saveButton,
      h('button', { type: 'button', onclick: () => opts.onCancel() }, pdf ? 'Skip this bill' : 'Cancel'),
    ),
  );

  el.addEventListener('submit', (event) => {
    event.preventDefault();
    formNote.textContent = '';
    if (showPeriod(true)) {
      monthSelect.focus();
      return;
    }
    const visible = FIELDS.filter((f) => solar || !f.solar);
    const bad = visible.filter((f) => !showField(f.key));
    if (bad.length > 0) {
      formNote.textContent = 'Fix the highlighted fields, or clear them to leave them blank.';
      inputs[bad[0].key].focus();
      return;
    }
    opts.onSave(current());
  });

  showPeriod(false);
  if (editing) showChecks();

  return {
    el,
    setSolar(next) {
      solar = next;
      solarFields.hidden = !solar;
      showChecks();
    },
    focus() {
      monthSelect.focus();
    },
  };
}
