import type { DecisionOutcome } from "@/lib/llm/types.ts";

export const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  refund: "Refund",
  change: "Change",
  follow_up: "Follow-up",
  unsupported_or_escalate: "Escalate",
  information: "Information",
};

export function outcomeLabel(value: string): string {
  return OUTCOME_LABEL[value as DecisionOutcome] ?? humanize(value);
}

export function humanize(value: string): string {
  const text = value.replaceAll(/[_-]+/g, " ").trim();
  if (!text) return value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function requestedActionLabel(action: string): string {
  switch (action) {
    case "refund":
      return "Requests a refund";
    case "change":
      return "Wants to change the ticket";
    case "follow_up":
      return "Asks for follow-up";
    case "unsupported_or_escalate":
      return "Asks to escalate";
    case "information":
      return "Asks for information";
    default:
      return humanize(action);
  }
}

export function outcomeHeadline(outcome: DecisionOutcome): string {
  switch (outcome) {
    case "refund":
      return "Refund recommended";
    case "change":
      return "Ticket change offered";
    case "follow_up":
      return "Follow-up needed";
    case "unsupported_or_escalate":
      return "Escalation suggested";
    case "information":
      return "Information reply suggested";
  }
}

const RULE_OUTCOME_LABEL: Record<string, string> = {
  eligible: "Eligible under the rules",
  not_eligible: "Not eligible",
  follow_up_required: "Follow-up required",
  escalate: "Escalation required",
};

export function ruleOutcomeLabel(value: string): string {
  return RULE_OUTCOME_LABEL[value] ?? humanize(value);
}

export function formatMoney(amount: number, currency = "PLN"): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

const RULE_LABEL: Record<string, string> = {
  delay_30: "delay ≥ 30 min",
  delay_60: "delay ≥ 60 min",
  delay_120: "delay ≥ 120 min",
  below_threshold: "delay below the threshold",
  fabricated_delay_claim: "claimed delay exceeds the records",
  cancelled_train_full_refund: "cancelled train — full refund",
  route_change_standard: "standard route change fee",
  name_change_minor: "name correction fee",
  passenger_name_mismatch: "passenger name mismatch",
  ticket_reference_missing: "ticket reference missing",
  ticket_change_in_place: "ticket change in place",
};

const RECORD_KIND_LABEL: Record<string, string> = {
  ticket: "Ticket",
  account: "Account",
  payment: "Payment",
  route: "Route",
  disruption: "Disruption",
  passenger: "Passenger",
  case: "Prior case",
};

export function formatEvidenceRef(ref: string): string {
  const [kind, ...rest] = ref.split(":");
  if (kind === "record") {
    const sub = rest[0] ?? "";
    const id = rest.slice(1).join(":");
    const label = RECORD_KIND_LABEL[sub] ?? humanize(sub);
    if (sub === "ticket" && id) return `${label} ${id}`;
    return label;
  }
  if (kind === "rule") {
    const ruleId = rest[rest.length - 1] ?? "";
    return `Rule: ${RULE_LABEL[ruleId] ?? humanize(ruleId)}`;
  }
  if (kind === "knowledge") {
    const heading = rest[rest.length - 1] ?? "";
    return heading ? `Policy: ${heading}` : "Policy";
  }
  if (kind === "hindsight") {
    return `Learned: ${humanize(rest[0] ?? "")}`;
  }
  return ref;
}
