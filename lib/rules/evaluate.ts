import type { DemoCasePackage, TicketRecord } from "../domain/types.js";
import type { ExtractedClaims, RuleEvaluation, RuleReason } from "./types.js";
import { POLICY_VERSION } from "./types.js";
import {
  ESCALATION_TRIGGERS,
  NAME_CHANGE_FEES,
  ROUTE_CHANGE_FEES,
  delayTierFor,
  ruleRef,
} from "./policy.js";

function ticketRef(ticket: TicketRecord): string {
  return `record:ticket:${ticket.id}`;
}

function routeRef(routeId: string): string {
  return `record:route:${routeId}`;
}

function paymentRef(paymentId: string): string {
  return `record:payment:${paymentId}`;
}

function ticketPriceCents(pkg: DemoCasePackage): number {
  let total = 0;
  for (const t of pkg.tickets) total += t.paidPrice;
  return total;
}

function paymentIds(pkg: DemoCasePackage): Set<string> {
  return new Set(pkg.payments.map((p) => p.id));
}

function firstCompletedTicket(pkg: DemoCasePackage): TicketRecord | null {
  for (const t of pkg.tickets) {
    if (t.paymentStatus === "completed" && paymentIds(pkg).has(t.paymentId)) {
      return t;
    }
  }
  return null;
}

function reason(code: string, description: string): RuleReason {
  return { code, description, policyVersion: POLICY_VERSION };
}

function evaluateDelayRefund(pkg: DemoCasePackage, claims: ExtractedClaims): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];

  if (pkg.disruption === null || pkg.disruption.type !== "delay") {
    reasons.push(reason("no_delay_recorded", "No delay disruption is recorded for this case."));
    return {
      outcome: "not_eligible",
      amount: null,
      reasons,
      evidenceRefs,
    };
  }

  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason(
      "missing_payment",
      "Cannot compute refund without a completed payment record.",
    ));
    if (claims.missingFields.length > 0) {
      reasons.push(reason("missing_field", `Claim is missing: ${claims.missingFields.join(", ")}.`));
    }
    return {
      outcome: "follow_up_required",
      amount: null,
      reasons,
      evidenceRefs,
    };
  }

  evidenceRefs.push(ticketRef(ticket));
  evidenceRefs.push(routeRef(pkg.route.id));

  const claimed = claims.claims.find((c) => c.field === "delay_minutes")?.value;
  const claimedMinutes = claimed === undefined ? null : Number(claimed);
  const actual = pkg.disruption.actualDelayMinutes;
  if (claimedMinutes !== null && Number.isFinite(claimedMinutes) && claimedMinutes > actual) {
    reasons.push(reason(
      "fabricated_delay_claim",
      `Claimed delay of ${claimedMinutes} minutes exceeds the actual recorded delay of ${actual} minutes.`,
    ));
    evidenceRefs.push(ruleRef("fabricated_delay_claim"));
    return {
      outcome: "not_eligible",
      amount: null,
      reasons,
      evidenceRefs,
    };
  }

  const tier = delayTierFor(actual);
  if (tier === null) {
    reasons.push(reason(
      "below_threshold",
      `Actual delay of ${actual} minutes is below the 30-minute refund threshold.`,
    ));
    evidenceRefs.push(ruleRef("below_threshold"));
    return {
      outcome: "not_eligible",
      amount: null,
      reasons,
      evidenceRefs,
    };
  }

  const fraction = tier.refundFraction;
  const price = ticketPriceCents(pkg);
  const amount = Math.round(price * fraction * 100) / 100;
  reasons.push(reason(
    tier.id,
    `${tier.description} Recorded delay: ${actual} minutes; paid price: ${price.toFixed(2)} PLN.`,
  ));
  evidenceRefs.push(ruleRef(tier.id));
  return {
    outcome: "eligible",
    amount,
    reasons,
    evidenceRefs,
  };
}

function evaluateCancelledTrainRefund(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const ticket = firstCompletedTicket(pkg);
  if (pkg.disruption === null || pkg.disruption.type !== "cancellation") {
    reasons.push(reason("no_cancellation", "Disruption is not a recorded cancellation."));
    return { outcome: "not_eligible", amount: null, reasons, evidenceRefs };
  }
  if (ticket === null) {
    reasons.push(reason("missing_payment", "No completed payment record for the cancelled ticket."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  evidenceRefs.push(routeRef(pkg.route.id));
  evidenceRefs.push(ruleRef("cancelled_train_full_refund"));
  const price = ticketPriceCents(pkg);
  reasons.push(reason(
    "cancelled_train_full_refund",
    `Train was cancelled; full refund of ${price.toFixed(2)} PLN applies.`,
  ));
  return { outcome: "eligible", amount: price, reasons, evidenceRefs };
}

function evaluatePassengerNameChange(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason("missing_ticket", "No completed ticket found for the name change request."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  const accountName = pkg.account.fullName;
  const passengers = ticket.passengers.map((p) => p.fullName);
  const ownerOnTicket = passengers.includes(accountName);
  const claimedNumber = pkg.expected.referencedTicketNumbers[0] ?? null;
  const realNumbers = new Set(pkg.tickets.map((t) => t.number));
  const claimNumberInvalid = claimedNumber !== null && !realNumbers.has(claimedNumber);

  if (!ownerOnTicket || claimNumberInvalid) {
    if (!ownerOnTicket) {
      const trigger = ESCALATION_TRIGGERS.find((t) => t.id === "passenger_name_mismatch");
      reasons.push(reason(
        trigger?.id ?? "passenger_name_mismatch",
        trigger?.description ?? "Requested name does not match the ticket passenger.",
      ));
      evidenceRefs.push(ruleRef("passenger_name_mismatch"));
    }
    if (claimNumberInvalid) {
      const trigger = ESCALATION_TRIGGERS.find((t) => t.id === "ticket_reference_missing");
      reasons.push(reason(
        trigger?.id ?? "ticket_reference_missing",
        trigger?.description ?? "Referenced ticket number is not present in account records.",
      ));
      evidenceRefs.push(ruleRef("ticket_reference_missing"));
    }
    return { outcome: "escalate", amount: null, reasons, evidenceRefs };
  }

  const fee = NAME_CHANGE_FEES[0]!;
  const amount = fee.feeCents / 100;
  reasons.push(reason(
    fee.id,
    fee.description,
  ));
  evidenceRefs.push(ruleRef(fee.id));
  return { outcome: "eligible", amount, reasons, evidenceRefs };
}

function evaluateTicketChange(pkg: DemoCasePackage, claims: ExtractedClaims): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason("missing_ticket", "No completed ticket found for the change request."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  if (claims.requestedAction === "route_change") {
    const fee = ROUTE_CHANGE_FEES[0]!;
    reasons.push(reason(fee.id, fee.description));
    evidenceRefs.push(ruleRef(fee.id));
    return {
      outcome: "eligible",
      amount: fee.feeCents / 100,
      reasons,
      evidenceRefs,
    };
  }
  reasons.push(reason("ticket_change_in_place", "Ticket change recorded in place; no fee required for date adjustment."));
  evidenceRefs.push(ruleRef("ticket_change_in_place"));
  return {
    outcome: "eligible",
    amount: 0,
    reasons,
    evidenceRefs,
  };
}

function evaluateMissingRefund(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason("missing_ticket", "No completed ticket found for the missing refund claim."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  evidenceRefs.push(ruleRef("missing_refund_lookup"));
  reasons.push(reason("missing_refund_lookup", "Refund lookup needed against payment provider records."));
  return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
}

function evaluatePaymentWithoutTicket(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  for (const payment of pkg.payments) {
    evidenceRefs.push(paymentRef(payment.id));
  }
  reasons.push(reason("orphan_payment", "Payment is recorded without a matching ticket."));
  return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
}

function evaluateMissedConnection(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  if (pkg.disruption === null) {
    reasons.push(reason("no_disruption", "No disruption record supports a missed connection claim."));
    return { outcome: "not_eligible", amount: null, reasons, evidenceRefs };
  }
  const actual = pkg.disruption.actualDelayMinutes;
  if (actual < 30) {
    reasons.push(reason(
      "below_threshold",
      `Actual delay of ${actual} minutes is below the connection-miss threshold.`,
    ));
    return { outcome: "not_eligible", amount: null, reasons, evidenceRefs };
  }
  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason("missing_ticket", "No completed ticket found for the missed connection."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  evidenceRefs.push(routeRef(pkg.route.id));
  evidenceRefs.push(ruleRef("missed_connection"));
  reasons.push(reason("missed_connection", "Missed connection qualifies for rebooking assistance."));
  return { outcome: "eligible", amount: 0, reasons, evidenceRefs };
}

function evaluateValidationDiscount(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const ticket = firstCompletedTicket(pkg);
  if (ticket === null) {
    reasons.push(reason("missing_ticket", "No completed ticket for the discount claim."));
    return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
  }
  evidenceRefs.push(ticketRef(ticket));
  reasons.push(reason("validation_discount_inquiry", "Discount validation inquiry recorded; awaiting inspector outcome."));
  evidenceRefs.push(ruleRef("validation_discount_inquiry"));
  return { outcome: "follow_up_required", amount: null, reasons, evidenceRefs };
}

function evaluateUnsupported(pkg: DemoCasePackage): RuleEvaluation {
  const reasons: RuleReason[] = [];
  const evidenceRefs: string[] = [];
  const trigger = ESCALATION_TRIGGERS.find((t) => t.id === "ticket_reference_missing");
  reasons.push(reason(
    trigger?.id ?? "ticket_reference_missing",
    trigger?.description ?? "Referenced ticket number is not present in account records.",
  ));
  evidenceRefs.push(routeRef(pkg.route.id));
  evidenceRefs.push(ruleRef("escalate_unsupported"));
  return { outcome: "escalate", amount: null, reasons, evidenceRefs };
}

export function evaluateCase(input: { pkg: DemoCasePackage; claims: ExtractedClaims }): RuleEvaluation {
  const { pkg, claims } = input;
  if (pkg.truthMode === "fraud_attempt") {
    if (pkg.topic === "passenger_name_change") {
      return evaluatePassengerNameChange(pkg);
    }
    return evaluateUnsupported(pkg);
  }
  if (pkg.truthMode === "insufficient_information" && claims.missingFields.length > 0) {
    return {
      outcome: "follow_up_required",
      amount: null,
      reasons: [reason("insufficient_information", `Required information missing: ${claims.missingFields.join(", ") || "unspecified"}.`)],
      evidenceRefs: [routeRef(pkg.route.id)],
    };
  }
  if (pkg.truthMode === "fabricated_delay" && pkg.topic === "delay_refund") {
    return evaluateDelayRefund(pkg, claims);
  }
  switch (pkg.topic) {
    case "delay_refund":
      return evaluateDelayRefund(pkg, claims);
    case "cancelled_train_refund":
      return evaluateCancelledTrainRefund(pkg);
    case "missed_connection":
      return evaluateMissedConnection(pkg);
    case "ticket_change":
      return evaluateTicketChange(pkg, claims);
    case "passenger_name_change":
      return evaluatePassengerNameChange(pkg);
    case "missing_refund":
      return evaluateMissingRefund(pkg);
    case "payment_without_ticket":
      return evaluatePaymentWithoutTicket(pkg);
    case "validation_discount_penalty":
      return evaluateValidationDiscount(pkg);
  }
}
