import test from "node:test";
import assert from "node:assert/strict";

import {
  readBrowserState,
  writeBrowserState,
  updateBrowserState,
  clearBrowserState,
  STORAGE_KEY,
  type KeyValueStorage,
} from "../lib/storage/browser-store.ts";
import { emptyAppState, CURRENT_SCHEMA_VERSION } from "../lib/storage/types.ts";
import type { AppState, LearningRecord } from "../lib/storage/types.ts";

function fakeStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function learningRecord(id: string): LearningRecord {
  return {
    id,
    topic: "delay_refund",
    outcome: "refund",
    reviewerAction: "approve",
    originalDraftSummary: "original draft",
    finalDraftSummary: "final draft",
    changedGuidance: [],
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

test("readBrowserState returns empty state when nothing stored", () => {
  assert.deepEqual(readBrowserState(fakeStorage()), emptyAppState());
});

test("readBrowserState returns empty state on corrupt JSON", () => {
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, "{not json");
  assert.deepEqual(readBrowserState(storage), emptyAppState());
});

test("readBrowserState returns empty state when getItem throws", () => {
  const throwing: KeyValueStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(readBrowserState(throwing), emptyAppState());
});

test("updateBrowserState round-trips and writes under the storage key", () => {
  const storage = fakeStorage();
  updateBrowserState((s) => ({ ...s, cases: [] }), storage);
  const next = updateBrowserState(
    (s) => ({ ...s, learning: [...s.learning, learningRecord("lr-1")] }),
    storage,
  );
  assert.equal(next.learning.length, 1);
  assert.ok(storage.map.get(STORAGE_KEY)?.includes("lr-1"));
  assert.equal(readBrowserState(storage).learning.length, 1);
});

test("writeBrowserState stores exactly what it is given", () => {
  const storage = fakeStorage();
  const state: AppState = { ...emptyAppState(), schemaVersion: CURRENT_SCHEMA_VERSION };
  writeBrowserState(state, storage);
  assert.deepEqual(readBrowserState(storage), state);
});

test("clearBrowserState removes the key", () => {
  const storage = fakeStorage();
  writeBrowserState(emptyAppState(), storage);
  clearBrowserState(storage);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.deepEqual(readBrowserState(storage), emptyAppState());
});

test("readBrowserState migrates legacy schemaVersion 1", () => {
  const storage = fakeStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, cases: [], events: [], learning: [] }),
  );
  assert.equal(readBrowserState(storage).schemaVersion, CURRENT_SCHEMA_VERSION);
});
