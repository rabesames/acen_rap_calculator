// Page assembly (SPEC section 7): explainer, your bills, results, share, privacy note.

import { missingFields } from '../calc/calc';
import { toMonthInput, type MonthEntry } from '../input/fields';
import { OPEN_QUESTIONS } from '../offer/offer';
import type { Store } from '../state/store';
import { h } from './dom';
import { buildSummary, summaryText } from '../summary/summary';
import { EXPLAINER } from './explainer';
import { monthCard } from './monthCard';
import { monthForm, type MonthForm } from './monthForm';
import { pdfImport } from './pdfImport';
import { resultsContent } from './results';

/** Build the page. Returns the function that redraws everything that depends on the entries. */
function mountApp(root: HTMLElement, store: Store, remount: () => void): () => void {
  let form: MonthForm | null = null;

  // 1. Explainer
  const explainer = h(
    'details',
    { class: 'section explainer no-print' },
    h('summary', {}, h('h2', {}, EXPLAINER.title)),
    h('ul', {}, ...EXPLAINER.points.map((p) => h('li', {}, p))),
    h('p', { class: 'small' }, EXPLAINER.footer),
  );
  explainer.open = !store.get().explainerSeen;

  // 2. Your bills
  const solarBox = h('input', { type: 'checkbox', id: 'solar' });
  solarBox.checked = store.get().solar;
  solarBox.addEventListener('change', () => {
    store.update((s) => {
      s.solar = solarBox.checked;
    });
    form?.setSolar(solarBox.checked);
    importer.setSolar(solarBox.checked);
  });

  const importer = pdfImport({
    store,
    onSolarTurnedOn() {
      solarBox.checked = true;
      form?.setSolar(true);
      importer.setSolar(true);
    },
  });

  const addButton = h('button', { type: 'button', onclick: () => openForm(null) }, 'Type it in');
  const formHost = h('div', { class: 'form-host' });
  const status = h('p', { class: 'small', 'aria-live': 'polite' });
  const list = h('div', { class: 'cards' });

  const closeForm = () => {
    form = null;
    formHost.replaceChildren();
    addButton.hidden = false;
  };

  function openForm(entry: MonthEntry | null) {
    form = monthForm({
      idPrefix: 'f',
      entry,
      solar: store.get().solar,
      takenPeriods: () =>
        store
          .get()
          .months.map((m) => m.period)
          .filter((p) => p !== entry?.period),
      onCancel: closeForm,
      onSave(saved) {
        store.update((s) => {
          s.months = s.months.filter((m) => m.period !== entry?.period);
          s.months.push(saved);
        });
        closeForm();
        addButton.focus();
      },
    });
    formHost.replaceChildren(form.el);
    addButton.hidden = true;
    form.el.scrollIntoView({ block: 'start' });
    form.focus();
  }

  const renderList = () => {
    const { months, solar } = store.get();
    const sorted = [...months].sort((a, b) => b.period.localeCompare(a.period));
    const counted = sorted.filter((m) => missingFields(toMonthInput(m), solar).length === 0).length;
    status.textContent =
      sorted.length === 0
        ? 'No bills entered yet. Start with your most recent Meralco bill.'
        : `${sorted.length} ${sorted.length === 1 ? 'month' : 'months'} entered, ${counted} counted.`;
    list.replaceChildren(
      ...sorted.map((entry) =>
        monthCard({
          entry,
          solar,
          onEdit: () => openForm(entry),
          onRemove: () =>
            store.update((s) => {
              s.months = s.months.filter((m) => m.period !== entry.period);
            }),
        }),
      ),
    );
  };

  const bills = h(
    'section',
    { class: 'section no-print' },
    h('h2', {}, 'Your bills'),
    h(
      'p',
      {},
      'Add your Meralco bills as PDFs, or type the figures in one month at a time. Either way, you confirm every figure.',
    ),
    h('label', { class: 'check' }, solarBox, 'We have solar with net metering'),
    h(
      'details',
      { class: 'tips' },
      h('summary', {}, 'Tips for reading your bill'),
      h(
        'ul',
        {},
        h(
          'li',
          {},
          'Use "Charges for this billing period", not "Total Amount Due". A "Remaining Balance from previous bill" is an earlier unpaid bill.',
        ),
        h('li', {}, '"Other Charges" such as bill deposit instalments are not energy charges.'),
        h('li', {}, 'Line names can differ slightly between months because bill layouts change.'),
        h('li', {}, 'If a reading was estimated or the meter was changed, tick the box for that month.'),
      ),
    ),
    h('div', { class: 'actions' }, importer.button, addButton),
    importer.host,
    formHost,
    status,
    list,
  );

  importer.acceptDrops(bills);

  // 3. Results
  const results = h('section', { class: 'section results' });
  const renderResults = () => {
    const { months, solar } = store.get();
    results.replaceChildren(...resultsContent(buildSummary(months, solar)));
  };

  // 4. Share
  const shareStatus = h('p', { class: 'small', 'aria-live': 'polite' });
  const copyFallback = h('textarea', { class: 'copy-fallback', readonly: true, rows: '8', 'aria-label': 'Summary text' });
  copyFallback.hidden = true;
  const copySummary = async () => {
    const { months, solar } = store.get();
    const text = summaryText(buildSummary(months, solar));
    try {
      await navigator.clipboard.writeText(text);
      copyFallback.hidden = true;
      shareStatus.textContent = 'Summary copied. Paste it into a message or note.';
    } catch {
      // Clipboard access is blocked in some browsers and embedded pages.
      copyFallback.value = text;
      copyFallback.hidden = false;
      copyFallback.focus();
      copyFallback.select();
      shareStatus.textContent = 'Copying is blocked here. The summary is selected below: copy it by hand.';
    }
  };

  let armed = false;
  const clearButton = h('button', { type: 'button', class: 'danger' }, 'Clear all data');
  clearButton.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clearButton.textContent = 'Tap again to clear everything';
      return;
    }
    store.clear();
    remount();
  });
  clearButton.addEventListener('blur', () => {
    armed = false;
    clearButton.textContent = 'Clear all data';
  });

  const share = h(
    'section',
    { class: 'section no-print' },
    h('h2', {}, 'Share'),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => void copySummary() }, 'Copy summary as text'),
      h('button', { type: 'button', onclick: () => window.print() }, 'Print or save as PDF'),
    ),
    shareStatus,
    copyFallback,
    h('div', { class: 'actions' }, clearButton),
  );

  // 5. Privacy note
  const privacy = h(
    'section',
    { class: 'section no-print' },
    h('h2', {}, 'Privacy'),
    h('p', {}, 'Your entries stay in this browser. Nothing is sent anywhere.'),
    h(
      'p',
      {},
      'Saved entries can disappear if the browser clears site data, so copy or print the summary to keep it.',
    ),
    h('h3', {}, 'Not yet answered by ACEN'),
    h('ol', {}, ...OPEN_QUESTIONS.map((q) => h('li', {}, q))),
  );

  root.replaceChildren(h('h1', {}, 'ACEN RAP Calculator'), explainer, bills, results, share, privacy);
  const render = () => {
    renderList();
    renderResults();
  };
  render();

  if (!store.get().explainerSeen) {
    store.update((s) => {
      s.explainerSeen = true;
    });
  }
  return render;
}

export function startApp(root: HTMLElement, store: Store): void {
  let render: () => void = () => {};
  const mount = () => {
    render = mountApp(root, store, mount);
  };
  store.subscribe(() => render());
  mount();
}
