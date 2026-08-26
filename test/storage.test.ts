import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readState,
  updateState,
  resetState,
  type AppState,
} from "../lib/storage/store.ts";
import type { StoredCase, TraceEvent, LearningRecord } from "../lib/storage/types.ts";

function withTempStore<T>(fn: (dataDir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "railops-store-"));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      resetState();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
}

function makeStoredCase(id: string): StoredCase {
  return {
    caseId: id,
    topic: "delay_refund",
    truthMode: "supported_by_records",
    state: "reviewable",
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    seed: 1,
    pkg: { id } as StoredCase["pkg"],
    trace: [],
    reviewHistory: [],
    learningRef: null,
    version: 1,
  };
}

function makeTrace(id: string, caseId: string): TraceEvent {
  return {
    id,
    caseId,
    runId: "run-1",
    sequence: 1,
    stage: "evaluating_rules",
    status: "completed",
    summary: "ran",
    functionName: null,
    recordRefs: [],
    evidenceRefs: [],
    durationMs: null,
    error: null,
    timestamp: "2026-08-26T10:00:00.000Z",
  };
}

function makeLearning(): LearningRecord {
  return {
    topic: "delay_refund",
    outcome: "refund",
    reviewerAction: "approve",
    originalDraftSummary: "summary",
    finalDraftSummary: "summary",
    changedGuidance: [],
    timestamp: "2026-08-26T10:00:00.000Z",
  };
}

test("storage: readState on missing file returns empty state without throwing", async () => {
  await withTempStore(async (dir) => {
    resetState();
    const state = await readState({ dataDir: dir });
    assert.equal(state.cases.length, 0);
    assert.equal(state.events.length, 0);
    assert.equal(state.learning.length, 0);
  });
});

test("storage: updateState mutator runs once, persists atomically, returned state matches persisted", async () => {
  await withTempStore(async (dir) => {
    resetState();
    const returned = await updateState(
      (current) => ({
        ...current,
        cases: [...current.cases, makeStoredCase("case-1")],
      }),
      { dataDir: dir },
    );
    assert.equal(returned.cases.length, 1);
    assert.equal(returned.cases[0]!.caseId, "case-1");

    const persistedPath = join(dir, "state.json");
    assert.ok(existsSync(persistedPath), "state file must exist");
    const raw = JSON.parse(readFileSync(persistedPath, "utf8")) as AppState;
    assert.equal(raw.cases.length, 1);
    assert.equal(raw.cases[0]!.caseId, "case-1");

    resetState();
    const reloaded = await readState({ dataDir: dir });
    assert.equal(reloaded.cases.length, 1);
    assert.equal(reloaded.cases[0]!.caseId, "case-1");
  });
});

test("storage: concurrent updateStates serialize via the mutex (no lost writes)", async () => {
  await withTempStore(async (dir) => {
    resetState();
    const writes = Array.from({ length: 8 }, (_, i) =>
      updateState(
        (current) => ({
          ...current,
          events: [...current.events, makeTrace(`evt-${i}`, `case-${i}`)],
        }),
        { dataDir: dir },
      ),
    );
    await Promise.all(writes);
    const final = await readState({ dataDir: dir });
    assert.equal(final.events.length, 8);
    const ids = new Set(final.events.map((e) => e.id));
    assert.equal(ids.size, 8);
  });
});

test("storage: corrupt state file doesn't crash; returns empty state when JSON is invalid", async () => {
  await withTempStore(async (dir) => {
    const filePath = join(dir, "state.json");
    writeFileSync(filePath, "{not-json");
    resetState();
    const state = await readState({ dataDir: dir });
    assert.equal(state.cases.length, 0);
  });
});

test("storage: schemaVersion is set after first write", async () => {
  await withTempStore(async (dir) => {
    resetState();
    await updateState((current) => ({ ...current, learning: [makeLearning()] }), { dataDir: dir });
    const raw = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as { schemaVersion?: number };
    assert.equal(raw.schemaVersion, 1);
  });
});

test("storage: persisted state file uses atomic rename (no .tmp left behind)", async () => {
  await withTempStore(async (dir) => {
    resetState();
    await updateState((current) => ({ ...current, cases: [makeStoredCase("case-2")] }), { dataDir: dir });
    const entries = ["state.json", "state.json.tmp", "state.json.staging"];
    for (const e of entries) {
      const path = join(dir, e);
      if (e === "state.json") {
        assert.ok(existsSync(path), `${e} must exist`);
      } else {
        assert.equal(existsSync(path), false, `${e} must not leak`);
      }
    }
  });
});

test("storage: .railops/data/state.json path is gitignored", () => {
  const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
  assert.match(gitignore, /\.railops\//);
});
