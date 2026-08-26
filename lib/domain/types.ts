export type CaseTopic =
  | "delay_refund"
  | "cancelled_train_refund"
  | "missed_connection"
  | "ticket_change"
  | "passenger_name_change"
  | "missing_refund"
  | "payment_without_ticket"
  | "validation_discount_penalty";

export type TruthMode =
  | "supported_by_records"
  | "fabricated_delay"
  | "fraud_attempt"
  | "insufficient_information";

export type AccountStatus = "active" | "inactive" | "suspended";

export type AccountRecord = {
  id: string;
  email: string;
  fullName: string;
  status: AccountStatus;
  priorCaseCount: number;
  createdAt: string;
};

export type PassengerRecord = {
  id: string;
  fullName: string;
};

export type Relief = "none" | "student" | "senior" | "family" | "group";

export type TicketDirection = "outbound" | "return";

export type TicketHistoryType = "purchased" | "changed" | "refunded" | "cancelled";

export type TicketHistoryEntry = {
  type: TicketHistoryType;
  timestamp: string;
  note?: string;
};

export type PaymentMethod = "card" | "bank_transfer" | "voucher";

export type PaymentStatus = "pending" | "completed" | "refunded" | "failed";

export type PaymentHistoryEntry = {
  status: PaymentStatus;
  amount: number;
  timestamp: string;
  note?: string;
};

export type TicketRecord = {
  id: string;
  number: string;
  ownerAccountId: string;
  passengers: PassengerRecord[];
  routeId: string;
  direction: TicketDirection;
  departureScheduled: string;
  arrivalScheduled: string;
  durationMinutes: number;
  train: string;
  carriage: string;
  seat: string;
  reservation: string;
  relief: Relief;
  paidPrice: number;
  currency: string;
  paymentId: string;
  paymentStatus: PaymentStatus;
  history: TicketHistoryEntry[];
};

export type PaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  history: PaymentHistoryEntry[];
  createdAt: string;
};

export type RouteRecord = {
  id: string;
  origin: string;
  destination: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  actualDeparture: string | null;
  actualArrival: string | null;
  operator: string;
};

export type DisruptionType = "delay" | "cancellation" | "missed_connection";

export type DisruptionRecord = {
  id: string;
  routeId: string;
  type: DisruptionType;
  scheduledDelayMinutes: number;
  actualDelayMinutes: number;
  cause: string;
  reportedAt: string;
};

export type ExpectedAssertions = {
  claimTopic: CaseTopic;
  truthMode: TruthMode;
  referencedTicketNumbers: string[];
  referencedPassengerNames: string[];
  referencedStationPair: { origin: string; destination: string } | null;
  claimedDelayMinutes: number | null;
  actualDelayMinutes: number | null;
  claimedPrice: number | null;
  actualPrice: number | null;
  actualOrigin: string;
  actualDestination: string;
  missingFields: string[];
  contradictionDetected: boolean;
  fabricationsDetected: string[];
  passengerNameMatchesOwner: boolean | null;
  ticketExistsForClaim: boolean | null;
};

export type DemoCasePackage = {
  id: string;
  seed: number;
  topic: CaseTopic;
  truthMode: TruthMode;
  account: AccountRecord;
  tickets: TicketRecord[];
  payments: PaymentRecord[];
  route: RouteRecord;
  disruption: DisruptionRecord | null;
  expected: ExpectedAssertions;
  createdAt: string;
};
