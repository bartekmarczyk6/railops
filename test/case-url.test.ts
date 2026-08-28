import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SEED,
  caseHref,
  parseCaseSeedParams,
  rebuildStoredCase,
} from "../lib/domain/case-url.js";

const CASE_ID = "f98169d7-e9b4-4e55-9df0-568ed0c25f20";

const VALID = {
  topic: "delay_refund",
  truthMode: "supported_by_records",
  seed: 42,
} as const;

test("caseHref carries topic, truthMode and seed in the query string", () => {
  const href = caseHref({ caseId: CASE_ID, ...VALID });
  const url = new URL(href, "https://example.com");
  assert.equal(url.pathname, `/case/${CASE_ID}`);
  assert.equal(url.searchParams.get("topic"), "delay_refund");
  assert.equal(url.searchParams.get("truthMode"), "supported_by_records");
  assert.equal(url.searchParams.get("seed"), "42");
});

test("parseCaseSeedParams round-trips what caseHref emits", () => {
  const href = caseHref({ caseId: CASE_ID, ...VALID });
  const query = href.slice(href.indexOf("?"));
  assert.deepEqual(parseCaseSeedParams(query), { ...VALID });
});

test("parseCaseSeedParams accepts a leading '?'", () => {
  assert.deepEqual(parseCaseSeedParams("?topic=delay_refund&truthMode=supported_by_records&seed=7"), {
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
});

test("parseCaseSeedParams rejects unknown topic or truth mode", () => {
  assert.equal(
    parseCaseSeedParams("?topic=not_a_topic&truthMode=supported_by_records&seed=1"),
    null,
  );
  assert.equal(
    parseCaseSeedParams("?topic=delay_refund&truthMode=not_a_mode&seed=1"),
    null,
  );
});

test("parseCaseSeedParams rejects missing or malformed seed", () => {
  assert.equal(parseCaseSeedParams("?topic=delay_refund&truthMode=supported_by_records"), null);
  assert.equal(
    parseCaseSeedParams("?topic=delay_refund&truthMode=supported_by_records&seed=abc"),
    null,
  );
  assert.equal(
    parseCaseSeedParams("?topic=delay_refund&truthMode=supported_by_records&seed=-1"),
    null,
  );
  assert.equal(
    parseCaseSeedParams("?topic=delay_refund&truthMode=supported_by_records&seed=1.5"),
    null,
  );
  assert.equal(
    parseCaseSeedParams(
      `?topic=delay_refund&truthMode=supported_by_records&seed=${MAX_SEED + 1}`,
    ),
    null,
  );
});

test("rebuildStoredCase keeps the case id from the URL", () => {
  const rebuilt = rebuildStoredCase(CASE_ID, { ...VALID }, "2026-08-28T12:00:00.000Z");
  assert.equal(rebuilt.caseId, CASE_ID);
  assert.equal(rebuilt.pkg.id, CASE_ID);
});

test("rebuildStoredCase is deterministic for the same link", () => {
  const a = rebuildStoredCase(CASE_ID, { ...VALID }, "2026-08-28T12:00:00.000Z");
  const b = rebuildStoredCase(CASE_ID, { ...VALID }, "2026-08-28T12:00:00.000Z");
  assert.deepEqual(a, b);
});

test("rebuildStoredCase starts fresh so the pipeline regenerates the email", () => {
  const rebuilt = rebuildStoredCase(CASE_ID, { ...VALID }, "2026-08-28T12:00:00.000Z");
  assert.equal(rebuilt.state, "created");
  assert.equal(rebuilt.email, null);
  assert.deepEqual(rebuilt.trace, []);
  assert.deepEqual(rebuilt.reviewHistory, []);
  assert.equal(rebuilt.seed, VALID.seed);
  assert.equal(rebuilt.topic, VALID.topic);
  assert.equal(rebuilt.truthMode, VALID.truthMode);
});

test("rebuildStoredCase package matches a directly created case", () => {
  const rebuilt = rebuildStoredCase(CASE_ID, { ...VALID }, "2026-08-28T12:00:00.000Z");
  assert.equal(rebuilt.pkg.topic, VALID.topic);
  assert.equal(rebuilt.pkg.truthMode, VALID.truthMode);
  assert.equal(rebuilt.pkg.seed, VALID.seed);
  assert.ok(rebuilt.pkg.account.email.length > 0);
});
