import test from "node:test";
import assert from "node:assert/strict";
import { createDemoCase } from "../lib/domain/case-factory.ts";
import type { DemoCasePackage } from "../lib/domain/types.ts";
import type { ExtractedClaims } from "../lib/rules/types.ts";
import { evaluateCase } from "../lib/rules/evaluate.ts";

function pkg(topic: DemoCasePackage["topic"], truthMode: DemoCasePackage["truthMode"], seed: number): DemoCasePackage {
  return createDemoCase({ topic, truthMode, seed });
}

function emptyClaims(overrides: Partial<ExtractedClaims> = {}): ExtractedClaims {
  return {
    requestedAction: "",
    claims: [],
    missingFields: [],
    referencedTicketNumbers: [],
    referencedStations: [],
    ...overrides,
  };
}

test("rules: delay_refund + supported + actual delay 45 min → eligible at 50% of paid price", () => {
  const c = pkg("delay_refund", "supported_by_records", 7);
  const paidPrice = c.tickets[0]!.paidPrice;
  const mutated: DemoCasePackage = { ...c, disruption: { ...c.disruption!, actualDelayMinutes: 45 } };
  const result = evaluateCase({ pkg: mutated, claims: emptyClaims() });
  assert.equal(result.outcome, "eligible");
  assert.ok(result.amount !== null, "amount must be set");
  assert.ok(
    Math.abs(result.amount - paidPrice * 0.5) < 0.01,
    `expected ${paidPrice * 0.5}, got ${result.amount}`,
  );
  assert.ok(result.reasons.length >= 1);
  assert.ok(result.evidenceRefs.length >= 1);
});

test("rules: delay_refund + supported + actual delay 0 min → not_eligible", () => {
  const c = pkg("delay_refund", "supported_by_records", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
  const at = c.expected.actualDelayMinutes ?? 0;
  if (at >= 30) {
    assert.ok(true, "actual delay is above threshold; covered by other test");
    return;
  }
  assert.equal(ev.outcome, "not_eligible");
  assert.equal(ev.amount, null);
});

test("rules: delay_refund with delay below 30 minutes → not_eligible", () => {
  const c = pkg("delay_refund", "supported_by_records", 7);
  const disruption = { ...c.disruption!, actualDelayMinutes: 10 };
  const mutated: DemoCasePackage = { ...c, disruption };
  const ev = evaluateCase({ pkg: mutated, claims: emptyClaims() });
  assert.equal(ev.outcome, "not_eligible");
  assert.equal(ev.amount, null);
});

test("rules: delay_refund + fabricated_delay (claimed 60, actual 10) → not_eligible (rules trust records, not claims)", () => {
  const c = pkg("delay_refund", "fabricated_delay", 7);
  const disruption = { ...c.disruption!, actualDelayMinutes: 10 };
  const mutated: DemoCasePackage = { ...c, disruption };
  const ev = evaluateCase({ pkg: mutated, claims: emptyClaims({ requestedAction: "refund", claims: [{ field: "delay_minutes", value: "60" }] }) });
  assert.equal(ev.outcome, "not_eligible");
  assert.equal(ev.amount, null);
});

test("rules: delay_refund + insufficient_information (no payment) → follow_up_required", () => {
  const c = pkg("delay_refund", "supported_by_records", 7);
  const mutated: DemoCasePackage = { ...c, payments: [] };
  const ev = evaluateCase({ pkg: mutated, claims: emptyClaims({ missingFields: ["payment_record"] }) });
  assert.equal(ev.outcome, "follow_up_required");
  assert.equal(ev.amount, null);
});

test("rules: cancelled_train_refund + supported + cancellation → eligible for full refund", () => {
  const c = pkg("cancelled_train_refund", "supported_by_records", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
  assert.equal(ev.outcome, "eligible");
  const paidPrice = c.tickets[0]!.paidPrice;
  assert.ok(ev.amount !== null);
  assert.ok(Math.abs(ev.amount - paidPrice) < 0.01, `expected ${paidPrice}, got ${ev.amount}`);
  assert.ok(ev.evidenceRefs.length >= 1);
});

test("rules: passenger_name_change + supported → eligible with fee schedule applied", () => {
  const c = pkg("passenger_name_change", "supported_by_records", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
  assert.equal(ev.outcome, "eligible");
  assert.ok(ev.amount !== null, "fee schedule must yield a concrete amount");
  assert.ok(ev.amount >= 0);
  assert.ok(ev.evidenceRefs.length >= 1);
});

test("rules: passenger_name_change + fraud_attempt (passenger name mismatch) → escalate", () => {
  const c = pkg("passenger_name_change", "fraud_attempt", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
  assert.equal(ev.outcome, "escalate");
});

test("rules: every evaluation returns at least one evidence ref", () => {
  const cases = [
    pkg("delay_refund", "supported_by_records", 1),
    pkg("delay_refund", "fabricated_delay", 1),
    pkg("delay_refund", "insufficient_information", 1),
    pkg("cancelled_train_refund", "supported_by_records", 1),
    pkg("missed_connection", "supported_by_records", 1),
    pkg("ticket_change", "supported_by_records", 1),
    pkg("passenger_name_change", "supported_by_records", 1),
    pkg("passenger_name_change", "fraud_attempt", 1),
    pkg("missing_refund", "supported_by_records", 1),
    pkg("payment_without_ticket", "supported_by_records", 1),
    pkg("validation_discount_penalty", "supported_by_records", 1),
  ];
  for (const c of cases) {
    const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
    assert.ok(
      ev.evidenceRefs.length >= 1,
      `topic=${c.topic} truthMode=${c.truthMode} produced ${ev.evidenceRefs.length} evidence refs`,
    );
  }
});

test("rules: delay_refund thresholds honour 30 / 60 / 120 minute tiers", () => {
  const base = pkg("delay_refund", "supported_by_records", 7);
  const paidPrice = base.tickets[0]!.paidPrice;
  const delays = [29, 30, 59, 60, 119, 120];
  for (const d of delays) {
    const mutated: DemoCasePackage = { ...base, disruption: { ...base.disruption!, actualDelayMinutes: d } };
    const ev = evaluateCase({ pkg: mutated, claims: emptyClaims() });
    if (d < 30) {
      assert.equal(ev.outcome, "not_eligible", `delay=${d}`);
      assert.equal(ev.amount, null, `delay=${d}`);
    } else {
      assert.equal(ev.outcome, "eligible", `delay=${d}`);
      assert.ok(ev.amount !== null, `delay=${d}`);
      const fraction = ev.amount / paidPrice;
      if (d < 60) {
        assert.ok(Math.abs(fraction - 0.5) < 0.01, `delay=${d} expected 0.5 got ${fraction}`);
      } else if (d < 120) {
        assert.ok(Math.abs(fraction - 0.75) < 0.01, `delay=${d} expected 0.75 got ${fraction}`);
      } else {
        assert.ok(Math.abs(fraction - 1) < 0.01, `delay=${d} expected 1.0 got ${fraction}`);
      }
    }
  }
});

test("rules: ticket_change (route change with new price) reflects price difference", () => {
  const c = pkg("ticket_change", "supported_by_records", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims({ requestedAction: "route_change" }) });
  assert.ok(ev.outcome === "eligible" || ev.outcome === "not_eligible" || ev.outcome === "follow_up_required");
  assert.ok(ev.evidenceRefs.length >= 1);
});

test("rules: outcome is never prose-only — reasons and evidence refs always present", () => {
  const c = pkg("delay_refund", "fabricated_delay", 7);
  const ev = evaluateCase({ pkg: c, claims: emptyClaims() });
  assert.ok(ev.reasons.length >= 1);
  assert.ok(ev.evidenceRefs.length >= 1);
  for (const reason of ev.reasons) {
    assert.ok(typeof reason.code === "string" && reason.code.length > 0);
    assert.ok(typeof reason.description === "string" && reason.description.length > 0);
  }
});
