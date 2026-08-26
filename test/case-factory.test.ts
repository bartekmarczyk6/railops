import test from "node:test";
import assert from "node:assert/strict";
import { createDemoCase } from "../lib/domain/case-factory.js";
import type { CaseTopic } from "../lib/domain/types.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

test("case factory: same (topic, truthMode, seed) produces byte-identical package", () => {
  const a = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 42,
  });
  const b = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 42,
  });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("case factory: different seeds produce different IDs but identical shape", () => {
  const a = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 1,
  });
  const b = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 2,
  });
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.seed, b.seed);
  assert.equal(a.tickets.length, b.tickets.length);
  assert.equal(a.payments.length, b.payments.length);
  assert.equal(
    Object.keys(a.tickets[0]!).length,
    Object.keys(b.tickets[0]!).length,
  );
});

test("case factory: delay_refund + supported_by_records has delay > 30 min and coherent records", () => {
  const c = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.ok(c.tickets.length >= 1, "at least one ticket");
  assert.ok(c.payments.length >= 1, "at least one payment");
  assert.ok(c.disruption !== null, "disruption exists");
  assert.equal(c.disruption!.type, "delay");
  assert.ok(c.disruption!.actualDelayMinutes >= 30, "actual delay >= 30 min");
  assert.equal(c.disruption!.routeId, c.route.id);
  assert.ok(c.route.origin.length > 0);
  assert.ok(c.route.destination.length > 0);
  assert.notEqual(c.route.origin, c.route.destination);
  assert.equal(c.expected.actualOrigin, c.route.origin);
  assert.equal(c.expected.actualDestination, c.route.destination);
  const paymentIds = new Set(c.payments.map((p) => p.id));
  for (const t of c.tickets) {
    assert.ok(
      paymentIds.has(t.paymentId),
      `Ticket ${t.id} references payment ${t.paymentId} missing from payments`,
    );
  }
});

test("case factory: delay_refund + fabricated_delay contradicts records", () => {
  const c = createDemoCase({
    topic: "delay_refund",
    truthMode: "fabricated_delay",
    seed: 7,
  });
  assert.ok(c.expected.claimedDelayMinutes !== null);
  assert.ok(c.expected.actualDelayMinutes !== null);
  assert.notEqual(
    c.expected.claimedDelayMinutes,
    c.expected.actualDelayMinutes,
  );
  assert.equal(c.expected.contradictionDetected, true);
  assert.ok(c.expected.fabricationsDetected.length >= 1);
});

test("case factory: passenger_name_change + supported_by_records names match", () => {
  const c = createDemoCase({
    topic: "passenger_name_change",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.equal(c.expected.passengerNameMatchesOwner, true);
  assert.ok(c.tickets.length >= 1);
  const accountName = c.account.fullName;
  assert.ok(
    c.tickets[0]!.passengers.some((p) => p.fullName === accountName),
    `Expected ticket passenger to include account owner "${accountName}"`,
  );
});

test("case factory: passenger_name_change + fraud_attempt shows contradiction", () => {
  const c = createDemoCase({
    topic: "passenger_name_change",
    truthMode: "fraud_attempt",
    seed: 7,
  });
  assert.equal(c.expected.passengerNameMatchesOwner, false);
  assert.ok(
    c.expected.fabricationsDetected.length > 0 ||
      c.expected.contradictionDetected,
  );
  const ticketNumbersInRecords = new Set(c.tickets.map((t) => t.number));
  const referencedNumbers = c.expected.referencedTicketNumbers;
  const allMatch =
    referencedNumbers.length > 0 &&
    referencedNumbers.every((n) => ticketNumbersInRecords.has(n));
  const passengers = c.tickets[0]!.passengers;
  const accountName = c.account.fullName;
  const passengersDiffer =
    passengers.length === 0 ||
    passengers.every((p) => p.fullName !== accountName);
  assert.ok(
    !allMatch || passengersDiffer,
    "fraud_attempt must show a contradiction: fake ticket number OR passenger name mismatch",
  );
});

test("case factory: payment_without_ticket has at least one orphan payment", () => {
  const c = createDemoCase({
    topic: "payment_without_ticket",
    truthMode: "supported_by_records",
    seed: 7,
  });
  const ticketPaymentIds = new Set(c.tickets.map((t) => t.paymentId));
  const orphaned = c.payments.filter((p) => !ticketPaymentIds.has(p.id));
  assert.ok(orphaned.length >= 1, "at least one orphan payment");
});

test("case factory: insufficient_information yields missingFields for every topic", () => {
  const topics: CaseTopic[] = [
    "delay_refund",
    "cancelled_train_refund",
    "missed_connection",
    "ticket_change",
    "passenger_name_change",
    "missing_refund",
    "payment_without_ticket",
    "validation_discount_penalty",
  ];
  for (const topic of topics) {
    const c = createDemoCase({
      topic,
      truthMode: "insufficient_information",
      seed: 7,
    });
    assert.ok(
      c.expected.missingFields.length >= 1,
      `topic ${topic} must declare at least one missing field`,
    );
  }
});

test("case factory: 100 runs with same seed are byte-identical", () => {
  const baseline = JSON.stringify(
    createDemoCase({
      topic: "missed_connection",
      truthMode: "fabricated_delay",
      seed: 99,
    }),
  );
  for (let i = 0; i < 100; i++) {
    const next = createDemoCase({
      topic: "missed_connection",
      truthMode: "fabricated_delay",
      seed: 99,
    });
    assert.equal(JSON.stringify(next), baseline);
  }
});

test("case factory: all generated IDs are UUIDs", () => {
  const c = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.ok(isUuid(c.id));
  assert.ok(isUuid(c.account.id));
  for (const ticket of c.tickets) {
    assert.ok(isUuid(ticket.id));
    for (const passenger of ticket.passengers) {
      assert.ok(isUuid(passenger.id));
    }
  }
  for (const payment of c.payments) {
    assert.ok(isUuid(payment.id));
  }
  assert.ok(isUuid(c.route.id));
  if (c.disruption !== null) {
    assert.ok(isUuid(c.disruption.id));
  }
});

test("case factory: route endpoints are non-empty and tickets share the route ID", () => {
  const topics: CaseTopic[] = [
    "delay_refund",
    "cancelled_train_refund",
    "missed_connection",
    "ticket_change",
  ];
  for (const topic of topics) {
    const c = createDemoCase({
      topic,
      truthMode: "supported_by_records",
      seed: 7,
    });
    assert.ok(c.route.origin.length > 0);
    assert.ok(c.route.destination.length > 0);
    assert.notEqual(c.route.origin, c.route.destination);
    for (const ticket of c.tickets) {
      assert.equal(ticket.routeId, c.route.id);
    }
  }
});

test("case factory: ticket ownership points at the package account", () => {
  const c = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  for (const ticket of c.tickets) {
    assert.equal(ticket.ownerAccountId, c.account.id);
  }
});

test("case factory: every ticket paymentId exists in payments", () => {
  const c = createDemoCase({
    topic: "missed_connection",
    truthMode: "supported_by_records",
    seed: 7,
  });
  const paymentIds = new Set(c.payments.map((p) => p.id));
  for (const ticket of c.tickets) {
    assert.ok(
      paymentIds.has(ticket.paymentId),
      `Ticket ${ticket.id} references unknown payment ${ticket.paymentId}`,
    );
  }
});

test("case factory: all date fields are valid ISO timestamps", () => {
  const c = createDemoCase({
    topic: "delay_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.ok(!Number.isNaN(Date.parse(c.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(c.account.createdAt)));
  for (const ticket of c.tickets) {
    assert.ok(!Number.isNaN(Date.parse(ticket.departureScheduled)));
    assert.ok(!Number.isNaN(Date.parse(ticket.arrivalScheduled)));
    for (const entry of ticket.history) {
      assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
    }
  }
  for (const payment of c.payments) {
    assert.ok(!Number.isNaN(Date.parse(payment.createdAt)));
    for (const entry of payment.history) {
      assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
    }
  }
  assert.ok(!Number.isNaN(Date.parse(c.route.scheduledDeparture)));
  assert.ok(!Number.isNaN(Date.parse(c.route.scheduledArrival)));
  if (c.disruption !== null) {
    assert.ok(!Number.isNaN(Date.parse(c.disruption.reportedAt)));
  }
});

test("case factory: cancelled_train_refund + supported_by_records shows a cancellation", () => {
  const c = createDemoCase({
    topic: "cancelled_train_refund",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.ok(c.disruption !== null);
  assert.equal(c.disruption!.type, "cancellation");
  assert.ok(c.payments.length >= 1);
  assert.equal(c.expected.contradictionDetected, false);
  assert.equal(c.expected.missingFields.length, 0);
});

test("case factory: missed_connection has two tickets on the same route with a delay disruption", () => {
  const c = createDemoCase({
    topic: "missed_connection",
    truthMode: "supported_by_records",
    seed: 7,
  });
  assert.ok(c.tickets.length >= 2, "at least two tickets");
  assert.ok(c.payments.length >= 2, "at least two payments");
  for (const ticket of c.tickets) {
    assert.equal(ticket.routeId, c.route.id);
    assert.equal(ticket.ownerAccountId, c.account.id);
  }
  assert.ok(c.disruption !== null);
  assert.equal(c.disruption!.type, "missed_connection");
});
