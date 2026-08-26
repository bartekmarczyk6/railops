import type {
  CaseTopic,
  ExpectedAssertions,
  TruthMode,
} from "./types.js";
import type { TopicResult } from "./topics.js";

function ticketNumbers(records: TopicResult): string[] {
  return records.tickets.map((t) => t.number);
}

function passengerNames(records: TopicResult): string[] {
  const names = new Set<string>();
  for (const ticket of records.tickets) {
    for (const passenger of ticket.passengers) {
      names.add(passenger.fullName);
    }
  }
  return [...names];
}

function ticketPriceCents(records: TopicResult): number | null {
  if (records.tickets.length === 0) {
    return null;
  }
  const total = records.tickets.reduce((sum, t) => sum + t.paidPrice, 0);
  return Math.round(total * 100) / 100;
}

function actualDelayMinutes(records: TopicResult): number | null {
  return records.disruption === null ? null : records.disruption.actualDelayMinutes;
}

export function buildBaseExpected(
  records: TopicResult,
  topic: CaseTopic,
): ExpectedAssertions {
  const price = ticketPriceCents(records);
  const actualDelay = actualDelayMinutes(records);
  const accountName = records.account.fullName;
  const passengersOnFirstTicket = records.tickets[0]?.passengers ?? [];
  const ownerMatches =
    records.tickets.length === 0
      ? null
      : passengersOnFirstTicket.some((p) => p.fullName === accountName);
  return {
    claimTopic: topic,
    truthMode: "supported_by_records",
    referencedTicketNumbers: ticketNumbers(records),
    referencedPassengerNames: passengerNames(records),
    referencedStationPair:
      records.route.origin.length > 0 && records.route.destination.length > 0
        ? { origin: records.route.origin, destination: records.route.destination }
        : null,
    claimedDelayMinutes: actualDelay,
    actualDelayMinutes: actualDelay,
    claimedPrice: price,
    actualPrice: price,
    actualOrigin: records.route.origin,
    actualDestination: records.route.destination,
    missingFields: [],
    contradictionDetected: false,
    fabricationsDetected: [],
    passengerNameMatchesOwner: ownerMatches,
    ticketExistsForClaim: records.tickets.length > 0,
  };
}

const INSUFFICIENT_FIELDS_BY_TOPIC: Record<CaseTopic, string> = {
  delay_refund: "claimed_delay_minutes",
  cancelled_train_refund: "journey_date",
  missed_connection: "second_train_number",
  ticket_change: "requested_new_date",
  passenger_name_change: "requested_new_name",
  missing_refund: "original_ticket_number",
  payment_without_ticket: "payment_amount",
  validation_discount_penalty: "discount_type",
};

function applySupported(): Partial<ExpectedAssertions> {
  return {};
}

function applyFabricatedDelay(
  base: ExpectedAssertions,
): Partial<ExpectedAssertions> {
  const actual = base.actualDelayMinutes ?? 10;
  const claimed = actual + 50 + ((base.actualDelayMinutes ?? 0) % 11);
  const fabrications: string[] = [];
  if (claimed !== actual) {
    fabrications.push("claimed_delay_exceeds_actual");
  }
  return {
    claimedDelayMinutes: claimed,
    contradictionDetected: claimed !== actual,
    fabricationsDetected: fabrications,
  };
}

function applyFraudAttempt(
  base: ExpectedAssertions,
  records: TopicResult,
): Partial<ExpectedAssertions> {
  const fakeNumber = `TKT-${records.tickets[0]?.number.slice(4, 10) ?? "000000"}ZZ`;
  const realNumbers = ticketNumbers(records);
  const referenced = realNumbers.length > 0 ? [fakeNumber] : [fakeNumber];
  const fabrications: string[] = [];
  if (base.passengerNameMatchesOwner !== false) {
    fabrications.push("ticket_reference_not_in_records");
  } else {
    fabrications.push("passenger_name_mismatch");
  }
  return {
    referencedTicketNumbers: referenced,
    ticketExistsForClaim: false,
    passengerNameMatchesOwner: false,
    contradictionDetected: true,
    fabricationsDetected: fabrications,
  };
}

function applyInsufficientInformation(
  base: ExpectedAssertions,
  topic: CaseTopic,
): Partial<ExpectedAssertions> {
  const field = INSUFFICIENT_FIELDS_BY_TOPIC[topic];
  return {
    claimedDelayMinutes: topic === "delay_refund" ? null : base.claimedDelayMinutes,
    claimedPrice: topic === "payment_without_ticket" ? null : base.claimedPrice,
    missingFields: [field],
    contradictionDetected: false,
  };
}

export function applyTruthMode(
  base: ExpectedAssertions,
  truthMode: TruthMode,
  records: TopicResult,
): ExpectedAssertions {
  const patch: Partial<ExpectedAssertions> = (() => {
    switch (truthMode) {
      case "supported_by_records":
        return applySupported();
      case "fabricated_delay":
        return applyFabricatedDelay(base);
      case "fraud_attempt":
        return applyFraudAttempt(base, records);
      case "insufficient_information":
        return applyInsufficientInformation(base, base.claimTopic);
    }
  })();
  return {
    ...base,
    ...patch,
    truthMode,
  };
}
