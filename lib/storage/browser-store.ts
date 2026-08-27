import { emptyAppState, type AppState } from "./types.js";
import { migrate } from "./migrations.js";

export const STORAGE_KEY = "railops.state.v2";

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryFallbackStore = new Map<string, string>();
const memoryFallback: KeyValueStorage = {
  getItem: (key) => memoryFallbackStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryFallbackStore.set(key, value);
  },
  removeItem: (key) => {
    memoryFallbackStore.delete(key);
  },
};

function defaultStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage;
    if (storage) return storage;
  } catch {
    /* storage blocked (e.g. cross-origin iframe) — fall through */
  }
  return memoryFallback;
}

function parseState(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState> | null;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyAppState();
  }
  return {
    schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0,
    cases: Array.isArray(parsed.cases) ? (parsed.cases as AppState["cases"]) : [],
    events: Array.isArray(parsed.events) ? (parsed.events as AppState["events"]) : [],
    learning: Array.isArray(parsed.learning) ? (parsed.learning as AppState["learning"]) : [],
  };
}

export function readBrowserState(storage: KeyValueStorage = defaultStorage()): AppState {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyAppState();
  }
  if (raw === null) return emptyAppState();
  try {
    return migrate(parseState(raw));
  } catch {
    return emptyAppState();
  }
}

export function writeBrowserState(
  state: AppState,
  storage: KeyValueStorage = defaultStorage(),
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updateBrowserState(
  mutator: (state: AppState) => AppState,
  storage: KeyValueStorage = defaultStorage(),
): AppState {
  const next = mutator(readBrowserState(storage));
  writeBrowserState(next, storage);
  return next;
}

export function clearBrowserState(storage: KeyValueStorage = defaultStorage()): void {
  storage.removeItem(STORAGE_KEY);
}
