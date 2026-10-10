// App state: in memory first, mirrored to localStorage as a convenience (SPEC section 9).
// Every storage access is wrapped, so the page works when storage is missing or throws.

import { ENTRY_FIELDS, emptyValues, isValidPeriod, type MonthEntry } from '../input/fields';

export const STORAGE_KEY = 'acen-rap:v1';

export interface AppState {
  solar: boolean;
  /** True once the explainer has been shown, so it starts collapsed next time. */
  explainerSeen: boolean;
  months: MonthEntry[];
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function defaultState(): AppState {
  return { solar: false, explainerSeen: false, months: [] };
}

/** Rebuild state from stored JSON, keeping only known keys and well-formed months. */
export function sanitise(raw: unknown): AppState {
  const state = defaultState();
  if (typeof raw !== 'object' || raw === null) return state;
  const r = raw as Record<string, unknown>;
  state.solar = r.solar === true;
  state.explainerSeen = r.explainerSeen === true;
  if (!Array.isArray(r.months)) return state;

  const seen = new Set<string>();
  for (const item of r.months) {
    if (typeof item !== 'object' || item === null) continue;
    const m = item as Record<string, unknown>;
    if (typeof m.period !== 'string' || !isValidPeriod(m.period) || seen.has(m.period)) continue;
    seen.add(m.period);
    const stored = (typeof m.values === 'object' && m.values !== null ? m.values : {}) as Record<string, unknown>;
    const values = emptyValues();
    for (const k of ENTRY_FIELDS) {
      const v = stored[k];
      if (typeof v === 'string') values[k] = v;
    }
    state.months.push({
      period: m.period,
      values,
      estimatedReading: m.estimatedReading === true,
      meterChanged: m.meterChanged === true,
    });
  }
  return state;
}

/** The browser's localStorage, or null where it is blocked (private windows, sandboxes). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface Store {
  get(): AppState;
  update(change: (state: AppState) => void): void;
  /** Remove the saved key and reset to an empty state. */
  clear(): void;
  subscribe(listener: () => void): void;
}

export function createStore(storage: StorageLike | null): Store {
  let state = defaultState();
  const listeners: (() => void)[] = [];

  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (text) state = sanitise(JSON.parse(text));
  } catch {
    state = defaultState();
  }

  const save = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the in-memory state still works.
    }
  };

  return {
    get: () => state,
    update(change) {
      change(state);
      save();
      for (const l of listeners) l();
    },
    clear() {
      state = defaultState();
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to remove if storage is unavailable.
      }
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.push(listener);
    },
  };
}
