import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  runLocalEval,
  runLiveSmokeTest,
  liveSmokeEnabled,
  LIVE_SMOKE_ENV,
} from "../lib/evals/run.ts";

const FIXTURE_DIR = resolve("./fixtures");

function fixtureIds(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

test("evals: every fixture passes against the deterministic pipeline", async () => {
  const results = await runLocalEval({ fixtureDir: FIXTURE_DIR });
  assert.ok(results.length > 0, "expected at least one fixture result");
  assert.equal(results.length, fixtureIds().length, "every fixture file produces a result");
  for (const result of results) {
    assert.equal(
      result.passed,
      true,
      `fixture ${result.fixtureId} failed: ${result.failures.join("; ")}`,
    );
    assert.equal(result.failures.length, 0);
    assert.ok(result.trace.length > 0, `fixture ${result.fixtureId} produced a trace`);
  }
});

test("evals: covers every required topic and truth-mode combination", async () => {
  const ids = new Set(fixtureIds());
  const required = [
    "delay-refund-supported",
    "delay-refund-fabricated-delay",
    "delay-refund-fraud-attempt",
    "delay-refund-insufficient-information",
    "cancelled-train-refund-supported",
    "missed-connection-supported",
    "ticket-change-supported",
    "passenger-name-change-supported",
    "passenger-name-change-fraud-attempt",
    "missing-refund-supported",
    "payment-without-ticket-supported",
    "validation-discount-penalty-supported",
  ];
  for (const id of required) {
    assert.ok(ids.has(id), `missing required fixture ${id}`);
  }
});

test("evals: live smoke test is skipped without the opt-in env flag", async () => {
  const prev = process.env[LIVE_SMOKE_ENV];
  delete process.env[LIVE_SMOKE_ENV];
  try {
    assert.equal(liveSmokeEnabled(), false);
    const result = await runLiveSmokeTest({ fixtureDir: FIXTURE_DIR });
    assert.equal(result.fixtureId, "live-smoke");
    assert.equal(result.passed, true);
    assert.equal(result.failures.length, 0);
    assert.ok(
      result.trace.some((line) => line.startsWith("skipped")),
      "expected a skipped trace line when the flag is unset",
    );
  } finally {
    if (prev !== undefined) {
      process.env[LIVE_SMOKE_ENV] = prev;
    }
  }
});
