import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEvidenceChain,
  type DecisionDraft,
} from "../lib/evidence.ts";

function draft(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  return {
    outcome: "refund",
    proposedAmount: 50,
    decisionBasis: [],
    response: "draft",
    evidenceRefs: [],
    ...overrides,
  };
}

test("evidence: valid record:ticket:abc-123 ref is accepted", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["record:ticket:abc-123"] }), new Set());
  assert.equal(result.valid, true);
  assert.deepEqual(result.invalidRefs, []);
});

test("evidence: valid record:route:abc-123 ref is accepted", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["record:route:route-9"] }), new Set());
  assert.equal(result.valid, true);
});

test("evidence: valid record:payment:abc-123 ref is accepted", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["record:payment:pay-1"] }), new Set());
  assert.equal(result.valid, true);
});

test("evidence: valid rule:1.0.0:delay_30 ref is accepted", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["rule:1.0.0:delay_30"] }), new Set());
  assert.equal(result.valid, true);
});

test("evidence: valid knowledge:delay-refund:When to refund ref is accepted", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["knowledge:delay-refund:When to refund"] }), new Set());
  assert.equal(result.valid, true);
});

test("evidence: invalid record:nonexistent is rejected", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["record:nonexistent"] }), new Set());
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidRefs, ["record:nonexistent"]);
});

test("evidence: invalid rule:bogus:foo is rejected", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["rule:bogus:foo"] }), new Set());
  assert.equal(result.valid, false);
});

test("evidence: arbitrary URL is rejected", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: ["https://example.com/refund"] }), new Set());
  assert.equal(result.valid, false);
});

test("evidence: validateEvidenceChain flags refs not present in knownRefs", () => {
  const known = new Set(["record:ticket:abc-123", "rule:1.0.0:delay_30"]);
  const result = validateEvidenceChain(
    draft({ evidenceRefs: ["record:ticket:abc-123", "rule:1.0.0:delay_30", "record:ticket:missing"] }),
    known,
  );
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidRefs, ["record:ticket:missing"]);
});

test("evidence: validateEvidenceChain with knownRefs accepts only refs in the set", () => {
  const known = new Set(["record:ticket:abc-123"]);
  const result = validateEvidenceChain(draft({ evidenceRefs: ["record:ticket:abc-123"] }), known);
  assert.equal(result.valid, true);
});

test("evidence: empty evidenceRefs is valid (no claims, no errors)", () => {
  const result = validateEvidenceChain(draft({ evidenceRefs: [] }), new Set());
  assert.equal(result.valid, true);
});

test("evidence: multiple invalid refs are all reported", () => {
  const result = validateEvidenceChain(
    draft({ evidenceRefs: ["record:nonexistent", "rule:bogus:foo", "nonsense"] }),
    new Set(),
  );
  assert.equal(result.valid, false);
  assert.equal(result.invalidRefs.length, 3);
});
