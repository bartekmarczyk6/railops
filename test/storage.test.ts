import test from "node:test";
import assert from "node:assert/strict";

import {
  readState,
  updateState,
  seedState,
  dropState,
  resetState,
} from "../lib/storage/store.ts";
import { emptyAppState, CURRENT_SCHEMA_VERSION } from "../lib/storage/types.ts";
import type { AppState } from "../lib/storage/types.ts";

test("readState returns empty state for unknown dataDir", async () => {
  resetState();
  const state = await readState({ dataDir: "unknown" });
  assert.deepEqual(state, emptyAppState());
});

test("updateState round-trips through the same dataDir", async () => {
  resetState();
  await updateState(
    (s) => ({ ...s, learning: [...s.learning, { id: "lr-1" } as AppState["learning"][number]] }),
    { dataDir: "a" },
  );
  const state = await readState({ dataDir: "a" });
  assert.equal(state.learning.length, 1);
  assert.equal(state.learning[0]?.id, "lr-1");
});

test("dataDirs are isolated", async () => {
  resetState();
  await updateState((s) => ({ ...s, schemaVersion: s.schemaVersion }), { dataDir: "a" });
  const b = await readState({ dataDir: "b" });
  assert.deepEqual(b, emptyAppState());
});

test("seedState installs state and dropState removes it", async () => {
  resetState();
  const seeded: AppState = { ...emptyAppState(), schemaVersion: CURRENT_SCHEMA_VERSION };
  seedState("req-1", seeded);
  const read = await readState({ dataDir: "req-1" });
  assert.equal(read.schemaVersion, CURRENT_SCHEMA_VERSION);
  dropState("req-1");
  assert.deepEqual(await readState({ dataDir: "req-1" }), emptyAppState());
});

test("updateState migrates seeded v1 state", async () => {
  resetState();
  const v1 = {
    schemaVersion: 1,
    cases: [],
    events: [],
    learning: [],
  } as unknown as AppState;
  seedState("legacy", v1);
  const state = await readState({ dataDir: "legacy" });
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("migration defaults email/emailError/supplements on v1 cases", async () => {
  resetState();
  const v1 = {
    schemaVersion: 1,
    cases: [
      {
        caseId: "case-legacy",
        topic: "delay_refund",
        truthMode: "supported_by_records",
        state: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        seed: 1,
        pkg: {},
        trace: [],
        reviewHistory: [],
        learningRef: null,
        version: 1,
      },
    ],
    events: [],
    learning: [],
  } as unknown as AppState;
  seedState("legacy-case", v1);
  const state = await readState({ dataDir: "legacy-case" });
  const migrated = state.cases[0];
  assert.ok(migrated);
  assert.equal(migrated?.email, null);
  assert.equal(migrated?.emailError, null);
  assert.deepEqual(migrated?.supplements, {});
});

test("updateState passes migrated state to the mutator", async () => {
  resetState();
  const v1 = {
    schemaVersion: 1,
    cases: [],
    events: [],
    learning: [],
  } as unknown as AppState;
  seedState("legacy-2", v1);
  let seenVersion: number | null = null;
  await updateState((s) => {
    seenVersion = s.schemaVersion;
    return s;
  }, { dataDir: "legacy-2" });
  assert.equal(seenVersion, CURRENT_SCHEMA_VERSION);
});

test("updateState refuses schemaVersion changes from mutators", async () => {
  resetState();
  const next = await updateState((s) => ({ ...s, schemaVersion: 999 }), { dataDir: "x" });
  assert.equal(next.schemaVersion, CURRENT_SCHEMA_VERSION);
});
