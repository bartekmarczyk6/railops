import type { PolicyVersion } from "./types.js";
import { POLICY_VERSION } from "./types.js";

export type DelayTier = {
  id: string;
  minDelayMinutes: number;
  refundFraction: number;
  description: string;
};

export const DELAY_TIERS: readonly DelayTier[] = [
  { id: "delay_30", minDelayMinutes: 30, refundFraction: 0.5, description: "Delay of 30-59 minutes: 50% refund of paid price." },
  { id: "delay_60", minDelayMinutes: 60, refundFraction: 0.75, description: "Delay of 60-119 minutes: 75% refund of paid price." },
  { id: "delay_120", minDelayMinutes: 120, refundFraction: 1.0, description: "Delay of 120 minutes or more: 100% refund of paid price." },
];

export type RouteChangeFee = {
  id: string;
  feeCents: number;
  description: string;
};

export const ROUTE_CHANGE_FEES: readonly RouteChangeFee[] = [
  { id: "route_change_standard", feeCents: 1500, description: "Standard route change before departure: 15.00 PLN admin fee." },
];

export type NameChangeFee = {
  id: string;
  feeCents: number;
  description: string;
};

export const NAME_CHANGE_FEES: readonly NameChangeFee[] = [
  { id: "name_change_minor", feeCents: 2000, description: "Passenger name spelling correction: 20.00 PLN admin fee." },
];

export type EscalationTrigger = {
  id: string;
  description: string;
  topic: string;
};

export const ESCALATION_TRIGGERS: readonly EscalationTrigger[] = [
  { id: "passenger_name_mismatch", description: "Requested name does not match the ticket passenger.", topic: "passenger_name_change" },
  { id: "fabricated_delay_claim", description: "Claimed delay exceeds the actual recorded delay.", topic: "delay_refund" },
  { id: "ticket_reference_missing", description: "Referenced ticket number is not present in account records.", topic: "passenger_name_change" },
];

export type MissingInfoField = {
  id: string;
  field: string;
  topic: string;
  description: string;
};

export const MISSING_INFO_FIELDS: readonly MissingInfoField[] = [
  { id: "missing_payment", field: "payment_record", topic: "delay_refund", description: "No payment record found for the affected ticket." },
  { id: "missing_journey_date", field: "journey_date", topic: "cancelled_train_refund", description: "Journey date for the cancelled train is missing." },
  { id: "missing_second_train", field: "second_train_number", topic: "missed_connection", description: "Second train number for the missed connection is missing." },
  { id: "missing_requested_date", field: "requested_new_date", topic: "ticket_change", description: "Requested new travel date is missing." },
  { id: "missing_requested_name", field: "requested_new_name", topic: "passenger_name_change", description: "Requested new passenger name is missing." },
  { id: "missing_original_ticket", field: "original_ticket_number", topic: "missing_refund", description: "Original ticket number for the missing refund is missing." },
  { id: "missing_payment_amount", field: "payment_amount", topic: "payment_without_ticket", description: "Amount claimed for the orphaned payment is missing." },
  { id: "missing_discount_type", field: "discount_type", topic: "validation_discount_penalty", description: "Type of discount claimed on validation is missing." },
];

export type RefundRule = {
  policyVersion: PolicyVersion;
  id: string;
  factors: { delayMinutes?: number; routeChange?: boolean; nameChange?: boolean; cancelledTrain?: boolean };
  description: string;
};

export function ruleRef(id: string, version: PolicyVersion = POLICY_VERSION): string {
  return `rule:${version}:${id}`;
}

export function delayTierFor(delayMinutes: number): DelayTier | null {
  let best: DelayTier | null = null;
  for (const tier of DELAY_TIERS) {
    if (delayMinutes >= tier.minDelayMinutes) {
      if (best === null || tier.minDelayMinutes > best.minDelayMinutes) {
        best = tier;
      }
    }
  }
  return best;
}
