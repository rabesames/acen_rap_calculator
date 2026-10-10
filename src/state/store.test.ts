import { describe, expect, it } from 'vitest';
import { emptyValues } from '../input/fields';
import { STORAGE_KEY, createStore, sanitise, type StorageLike } from './store';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const month = (period: string) => ({
  period,
  values: { ...emptyValues(), importKwh: '412' },
  estimatedReading: false,
  meterChanged: true,
});

describe('store', () => {
  it('starts empty and saves under the versioned key', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    expect(store.get().months).toEqual([]);
    store.update((s) => {
      s.solar = true;
      s.months.push(month('2026-01'));
    });
    expect(Object.keys(storage.data)).toEqual([STORAGE_KEY]);

    const reloaded = createStore(storage);
    expect(reloaded.get().solar).toBe(true);
    expect(reloaded.get().months).toEqual([month('2026-01')]);
  });

  it('notifies subscribers on update and clear', () => {
    const store = createStore(memoryStorage());
    let calls = 0;
    store.subscribe(() => calls++);
    store.update((s) => {
      s.solar = true;
    });
    store.clear();
    expect(calls).toBe(2);
  });

  it('clear removes the key and resets the state', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    store.update((s) => s.months.push(month('2026-01')));
    store.clear();
    expect(storage.data).toEqual({});
    expect(store.get()).toEqual({ solar: false, explainerSeen: false, months: [] });
  });

  it('works with no storage at all', () => {
    const store = createStore(null);
    store.update((s) => s.months.push(month('2026-01')));
    expect(store.get().months).toHaveLength(1);
    store.clear();
    expect(store.get().months).toEqual([]);
  });

  it('works when every storage call throws', () => {
    const store = createStore(throwingStorage);
    store.update((s) => s.months.push(month('2026-01')));
    expect(store.get().months).toHaveLength(1);
    store.clear();
    expect(store.get().months).toEqual([]);
  });

  it('falls back to an empty state on unreadable saved data', () => {
    expect(createStore(memoryStorage({ [STORAGE_KEY]: '{not json' })).get().months).toEqual([]);
    expect(createStore(memoryStorage({ [STORAGE_KEY]: '"text"' })).get().months).toEqual([]);
  });
});

describe('sanitise', () => {
  it('keeps only known fields and drops malformed or duplicate months', () => {
    const state = sanitise({
      solar: 'yes',
      name: 'someone',
      months: [
        { period: '2026-01', values: { importKwh: '412', accountNumber: '123', genRate: 8 }, name: 'x' },
        { period: '2026-01', values: {} },
        { period: 'January', values: {} },
        null,
      ],
    });
    expect(state.solar).toBe(false);
    expect(Object.keys(state)).toEqual(['solar', 'explainerSeen', 'months']);
    expect(state.months).toHaveLength(1);
    expect(state.months[0].values).toEqual({ ...emptyValues(), importKwh: '412' });
    expect(Object.keys(state.months[0])).toEqual(['period', 'values', 'estimatedReading', 'meterChanged']);
  });
});
