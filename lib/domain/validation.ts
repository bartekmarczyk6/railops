import type { CaseTopic, TruthMode } from "./types.js";

const CASE_TOPICS: ReadonlySet<CaseTopic> = new Set<CaseTopic>([
  "delay_refund",
  "cancelled_train_refund",
  "missed_connection",
  "ticket_change",
  "passenger_name_change",
  "missing_refund",
  "payment_without_ticket",
  "validation_discount_penalty",
]);

const TRUTH_MODES: ReadonlySet<TruthMode> = new Set<TruthMode>([
  "supported_by_records",
  "fabricated_delay",
  "fraud_attempt",
  "insufficient_information",
]);

export function isCaseTopic(value: unknown): value is CaseTopic {
  return typeof value === "string" && CASE_TOPICS.has(value as CaseTopic);
}

export function isTruthMode(value: unknown): value is TruthMode {
  return typeof value === "string" && TRUTH_MODES.has(value as TruthMode);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
