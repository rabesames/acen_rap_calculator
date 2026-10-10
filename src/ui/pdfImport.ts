// "Add bills from PDF" (SPEC section 5A). Each PDF is read on this device, turned into
// a "please check" form, and then discarded. A draft lives in memory only: nothing from
// a PDF is stored until the household confirms the figures.

import { emptyValues, type MonthEntry } from '../input/fields';
import { BillFileError, readPdfText, type ReadFailure } from '../pdf/extract';
import { parseBill, type BillFields, type BillRead } from '../pdf/parse';
import type { Store } from '../state/store';
import { h } from './dom';
import { monthForm, type MonthForm, type PdfPrefill } from './monthForm';

export interface PdfImportOptions {
  store: Store;
  /** Called after a bill with export figures turned the solar option on. */
  onSolarTurnedOn(): void;
}

export interface PdfImport {
  button: HTMLElement;
  /** Messages, the password prompt and the "please check" forms. */
  host: HTMLElement;
  setSolar(solar: boolean): void;
  /** Lets the page accept files dropped onto an element. */
  acceptDrops(target: HTMLElement): void;
}

const TYPE_IT_IN = 'Type that month in instead.';

const FAILURE_TEXT: Record<ReadFailure | Exclude<BillRead['kind'], 'ok'>, string> = {
  'not-pdf': `is not a PDF file. ${TYPE_IT_IN}`,
  unreadable: `could not be opened. ${TYPE_IT_IN}`,
  'password-cancelled': 'was skipped because no password was given.',
  'no-text': `looks like a scan or a photo, which cannot be read here. ${TYPE_IT_IN}`,
  'not-meralco': `does not look like a Meralco bill. ${TYPE_IT_IN}`,
};

export function pdfImport(opts: PdfImportOptions): PdfImport {
  const { store } = opts;
  const forms = new Set<MonthForm>();
  let nextId = 1;
  let busy = false;

  const fileInput = h('input', { type: 'file', accept: 'application/pdf', multiple: true, class: 'visually-hidden', tabindex: '-1' });
  const pickButton = h('button', { type: 'button', class: 'primary' }, 'Add bills from PDF');
  pickButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    void handleFiles(files);
  });

  const messages = h('div', { class: 'pdf-messages', 'aria-live': 'polite' });
  const passwordHost = h('div', {});
  const drafts = h('div', { class: 'cards' });

  const say = (text: string, warn: boolean) => messages.append(h('p', { class: warn ? 'note warn' : 'note' }, text));

  /** Ask for a PDF password in the page. The password is passed on and never kept. */
  const askPassword = (name: string) => (wrong: boolean) =>
    new Promise<string | null>((resolve) => {
      const input = h('input', { type: 'password', id: 'pdf-password', autocomplete: 'off' });
      const finish = (value: string | null) => {
        input.value = '';
        passwordHost.replaceChildren();
        resolve(value);
      };
      const form = h(
        'form',
        { class: 'card form', novalidate: true },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'pdf-password' }, `${name} is password-protected. Enter its password.`),
          input,
          h('p', { class: wrong ? 'field-note error' : 'hint' }, wrong ? 'That password did not work. Try again.' : 'The password is used once to open the file and is not saved.'),
        ),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'submit', class: 'primary' }, 'Open'),
          h('button', { type: 'button', onclick: () => finish(null) }, 'Skip this bill'),
        ),
      );
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        finish(input.value);
      });
      passwordHost.replaceChildren(form);
      input.focus();
    });

  const addDraft = (bill: BillFields, solarTurnedOn: boolean) => {
    const values = emptyValues();
    const sources: PdfPrefill['sources'] = {};
    for (const [key, read] of Object.entries(bill.fields) as [keyof typeof values, NonNullable<BillFields['fields'][keyof typeof values]>][]) {
      values[key] = read.text;
      sources[key] = { line: read.source, derived: read.derived };
    }
    const entry: MonthEntry = { period: bill.period ?? '', values, estimatedReading: false, meterChanged: false };
    const notices = solarTurnedOn
      ? ['Export figures were found on this bill, so "We have solar with net metering" was turned on.']
      : [];

    const remove = () => {
      forms.delete(form);
      form.el.remove();
    };
    const form: MonthForm = monthForm({
      idPrefix: `pdf${nextId++}`,
      entry,
      solar: store.get().solar,
      takenPeriods: () => store.get().months.map((m) => m.period),
      pdf: { sources, periodSource: bill.periodSource, notices },
      onCancel: remove,
      onSave(saved) {
        remove();
        store.update((s) => {
          s.months = s.months.filter((m) => m.period !== saved.period);
          s.months.push(saved);
        });
      },
    });
    forms.add(form);
    drafts.append(form.el);
  };

  async function handleFiles(files: File[]) {
    if (busy || files.length === 0) return;
    busy = true;
    pickButton.disabled = true;
    pickButton.textContent = 'Reading...';
    messages.replaceChildren();

    for (let i = 0; i < files.length; i++) {
      // File names can contain account numbers, so bills are referred to by position.
      const name = files.length === 1 ? 'This file' : `File ${i + 1} of ${files.length}`;
      try {
        const bytes = new Uint8Array(await files[i].arrayBuffer());
        const { items } = await readPdfText(bytes, askPassword(name));
        const bill = parseBill(items);
        if (bill.kind !== 'ok') {
          say(`${name} ${FAILURE_TEXT[bill.kind]}`, true);
          continue;
        }
        if (bill.period === null && Object.keys(bill.fields).length === 0) {
          say(`${name}: none of the figures could be read. ${TYPE_IT_IN}`, true);
          continue;
        }
        const solarTurnedOn = bill.hasExport && !store.get().solar;
        if (solarTurnedOn) {
          store.update((s) => {
            s.solar = true;
          });
          opts.onSolarTurnedOn();
        }
        addDraft(bill, solarTurnedOn);
        say(`${name} was read. Check the figures below against the bill, then confirm.`, false);
      } catch (error) {
        const kind = error instanceof BillFileError ? error.kind : 'unreadable';
        say(`${name} ${FAILURE_TEXT[kind]}`, true);
      }
    }

    busy = false;
    pickButton.disabled = false;
    pickButton.textContent = 'Add bills from PDF';
  }

  return {
    button: h('div', { class: 'pdf-button' }, pickButton, fileInput),
    host: h(
      'div',
      {},
      h(
        'p',
        { class: 'small' },
        h('span', { class: 'pill warn' }, 'Beta'),
        ' PDF reading is new and can misread a bill. The PDF is read on this device and is not kept or sent anywhere.',
      ),
      messages,
      passwordHost,
      drafts,
    ),
    setSolar(solar) {
      for (const form of forms) form.setSolar(solar);
    },
    acceptDrops(target) {
      target.addEventListener('dragover', (event) => event.preventDefault());
      target.addEventListener('drop', (event) => {
        event.preventDefault();
        void handleFiles([...((event as DragEvent).dataTransfer?.files ?? [])]);
      });
    },
  };
}
