import type { Random } from "./case-factory.js";
import type {
  AccountRecord,
  AccountStatus,
  CaseTopic,
  DisruptionRecord,
  DisruptionType,
  PassengerRecord,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Relief,
  RouteRecord,
  TicketDirection,
  TicketHistoryEntry,
  TicketHistoryType,
  TicketRecord,
} from "./types.js";

export type TopicResult = {
  account: AccountRecord;
  tickets: TicketRecord[];
  payments: PaymentRecord[];
  route: RouteRecord;
  disruption: DisruptionRecord | null;
};

const FIRST_NAMES: readonly string[] = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Edward",
  "Fiona",
  "George",
  "Hannah",
  "Ivan",
  "Julia",
  "Karol",
  "Lena",
  "Marek",
  "Nadia",
  "Olek",
  "Pawel",
  "Quinn",
  "Roman",
  "Sofia",
  "Tomek",
  "Ula",
  "Viktor",
  "Wanda",
  "Xavier",
  "Yara",
  "Zofia",
];

const LAST_NAMES: readonly string[] = [
  "Nowak",
  "Kowalski",
  "Wisniewski",
  "Wojcik",
  "Kowalczyk",
  "Kaminski",
  "Lewandowski",
  "Zielinski",
  "Szymanski",
  "Wozniak",
  "Dabrowski",
  "Kozlowski",
  "Jankowski",
  "Mazur",
  "Krawczyk",
];

const STATIONS: readonly string[] = [
  "Warszawa Centralna",
  "Krakow Glowny",
  "Gdansk Glowny",
  "Wroclaw Glowny",
  "Poznan Glowny",
  "Lodz Fabryczna",
  "Katowice",
  "Szczecin Glowny",
  "Bydgoszcz Glowna",
  "Lublin Glowny",
  "Bialystok",
  "Rzeszow Glowny",
  "Gdynia Glowna",
  "Torun Glowny",
  "Radom Glowny",
  "Kielce Glowny",
];

const TRAINS: readonly string[] = [
  "IC 1500",
  "IC 2300",
  "IC 3500",
  "TLK 40100",
  "TLK 50100",
  "EIP 4500",
  "EIP 6800",
  "REGIO 12000",
];

const CARRIAGE_LABELS: readonly string[] = [
  "Wagon 1",
  "Wagon 2",
  "Wagon 3",
  "Wagon 4",
  "Wagon 5",
  "Wagon 6",
  "Wagon 7",
  "Wagon 8",
];

const SEAT_LETTERS: readonly string[] = ["A", "B", "C", "D", "E", "F"];

const OPERATORS: readonly string[] = [
  "PKP Intercity",
  "Polregio",
  "SKM Warszawa",
  "Koleje Mazowieckie",
];

const RELIEF_OPTIONS: readonly Relief[] = [
  "none",
  "none",
  "none",
  "none",
  "student",
  "senior",
  "family",
];

const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "active",
  "active",
  "active",
  "active",
  "inactive",
];

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "card",
  "card",
  "card",
  "bank_transfer",
  "voucher",
];

const TICKET_DIRECTIONS: readonly TicketDirection[] = ["outbound", "return"];

const DISRUPTION_CAUSES: readonly string[] = [
  "signalling failure",
  "overhead wire damage",
  "track maintenance",
  "weather conditions",
  "emergency services response",
  "earlier rolling-stock defect",
];

function baseDate(): Date {
  return new Date(Date.parse("2026-06-01T00:00:00.000Z"));
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

function shiftBase(daysOffset: number, hourOffset: number): Date {
  const base = baseDate();
  base.setUTCDate(base.getUTCDate() + daysOffset);
  base.setUTCHours(hourOffset, 0, 0, 0);
  return base;
}

function ticketNumber(rng: Random): string {
  const chars = "0123456789ABCDEF";
  let s = "TKT-";
  for (let i = 0; i < 6; i++) {
    s += chars[rng.int(0, 15)];
  }
  return s;
}

function makeName(rng: Random): string {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  return `${first} ${last}`;
}

function makeEmail(fullName: string, rng: Random): string {
  const domain = rng.pick([
    "example.com",
    "mail.example",
    "demo.test",
    "synthetic.demo",
  ]);
  const [first = "user", ...rest] = fullName.toLowerCase().split(" ");
  const last = rest.join("") || "user";
  const handle = `${first}.${last}`;
  const suffix = rng.int(1, 999);
  return `${handle}.${suffix}@${domain}`;
}

function makeAccount(rng: Random): AccountRecord {
  const fullName = makeName(rng);
  return {
    id: rng.uuid(),
    email: makeEmail(fullName, rng),
    fullName,
    status: rng.pick(ACCOUNT_STATUSES),
    priorCaseCount: rng.int(0, 5),
    createdAt: addHours(
      baseDate().toISOString(),
      -rng.int(30 * 24, 365 * 3 * 24),
    ),
  };
}

function makePayment(
  rng: Random,
  amount: number,
  status: PaymentStatus,
  purchasedAt: string,
): PaymentRecord {
  const id = rng.uuid();
  const history: PaymentRecord["history"] = [
    {
      status: "pending",
      amount,
      timestamp: addMinutes(purchasedAt, -rng.int(1, 60)),
      note: "payment initiated",
    },
    {
      status,
      amount,
      timestamp: purchasedAt,
      ...(status === "refunded" ? { note: "refund processed" } : {}),
      ...(status === "failed" ? { note: "payment declined" } : {}),
    },
  ];
  return {
    id,
    amount,
    currency: "PLN",
    method: rng.pick(PAYMENT_METHODS),
    status,
    history,
    createdAt: purchasedAt,
  };
}

function makeRoute(
  rng: Random,
  opts: {
    requireOriginDestination?: boolean;
  } = {},
): RouteRecord {
  const id = rng.uuid();
  const origin = rng.pick(STATIONS);
  let destination = rng.pick(STATIONS);
  while (destination === origin) {
    destination = rng.pick(STATIONS);
  }
  const daysOffset = rng.int(0, 30);
  const hourOffset = rng.int(5, 22);
  const departure = shiftBase(daysOffset, hourOffset);
  const durationMinutes = rng.int(60, 360);
  const arrival = addMinutes(departure.toISOString(), durationMinutes);
  const operator = rng.pick(OPERATORS);
  if (opts.requireOriginDestination === false) {
    return {
      id,
      origin: "",
      destination: "",
      scheduledDeparture: departure.toISOString(),
      scheduledArrival: arrival,
      actualDeparture: null,
      actualArrival: null,
      operator,
    };
  }
  return {
    id,
    origin,
    destination,
    scheduledDeparture: departure.toISOString(),
    scheduledArrival: arrival,
    actualDeparture: null,
    actualArrival: null,
    operator,
  };
}

function durationMinutes(route: RouteRecord): number {
  return Math.round(
    (Date.parse(route.scheduledArrival) - Date.parse(route.scheduledDeparture)) /
      60_000,
  );
}

function makeTicketHistory(
  route: RouteRecord,
  types: readonly TicketHistoryType[],
): TicketHistoryEntry[] {
  const base = Date.parse(route.scheduledDeparture);
  const dayMs = 86_400_000;
  return types.map((type, index) => ({
    type,
    timestamp: new Date(base - (types.length - index) * dayMs).toISOString(),
    note:
      type === "purchased"
        ? "ticket issued"
        : type === "changed"
          ? "itinerary updated"
          : type === "refunded"
            ? "refund processed"
            : "train cancelled",
  }));
}

function makePassenger(rng: Random, fullName: string): PassengerRecord {
  return { id: rng.uuid(), fullName };
}

function makeTicket(args: {
  rng: Random;
  ownerAccountId: string;
  passengers: readonly string[];
  route: RouteRecord;
  paymentId: string;
  paymentStatus: PaymentStatus;
  historyTypes: readonly TicketHistoryType[];
}): TicketRecord {
  const { rng, ownerAccountId, passengers, route, paymentId, paymentStatus, historyTypes } = args;
  const id = rng.uuid();
  const direction = rng.pick(TICKET_DIRECTIONS);
  const train = rng.pick(TRAINS);
  const carriage = rng.pick(CARRIAGE_LABELS);
  const seatNum = rng.int(1, 60);
  const seatLetter = rng.pick(SEAT_LETTERS);
  const relief = rng.pick(RELIEF_OPTIONS);
  const basePrice = rng.int(40, 220);
  const paidPrice =
    relief === "none" ? basePrice : Math.round((basePrice * 0.65) * 100) / 100;
  return {
    id,
    number: ticketNumber(rng),
    ownerAccountId,
    passengers: passengers.map((n) => makePassenger(rng, n)),
    routeId: route.id,
    direction,
    departureScheduled: route.scheduledDeparture,
    arrivalScheduled: route.scheduledArrival,
    durationMinutes: durationMinutes(route),
    train,
    carriage,
    seat: `${seatNum}${seatLetter}`,
    reservation: rng.uuid(),
    relief,
    paidPrice,
    currency: "PLN",
    paymentId,
    paymentStatus,
    history: makeTicketHistory(route, historyTypes),
  };
}

function makeDisruption(
  rng: Random,
  route: RouteRecord,
  type: DisruptionType,
  actualDelayMinutes: number,
): DisruptionRecord {
  return {
    id: rng.uuid(),
    routeId: route.id,
    type,
    scheduledDelayMinutes: 0,
    actualDelayMinutes,
    cause: rng.pick(DISRUPTION_CAUSES),
    reportedAt: addMinutes(route.scheduledDeparture, -rng.int(5, 120)),
  };
}

function routeWithActualTimes(
  route: RouteRecord,
  actualDelayMinutes: number,
): RouteRecord {
  return {
    ...route,
    actualDeparture: addMinutes(route.scheduledDeparture, actualDelayMinutes),
    actualArrival: addMinutes(route.scheduledArrival, actualDelayMinutes),
  };
}

function buildDelayRefund(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 48));
  const payment = makePayment(rng, rng.int(60, 220), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  const actualDelay = rng.int(35, 120);
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route: routeWithActualTimes(route, actualDelay),
    disruption: makeDisruption(rng, route, "delay", actualDelay),
  };
}

function buildCancelledTrainRefund(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const payment = makePayment(rng, rng.int(60, 220), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased", "cancelled"],
  });
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route,
    disruption: makeDisruption(rng, route, "cancellation", 0),
  };
}

function buildMissedConnection(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const leg1Payment = makePayment(rng, rng.int(60, 180), "completed", purchasedAt);
  const leg2Payment = makePayment(rng, rng.int(40, 160), "completed", purchasedAt);
  const leg1Ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: leg1Payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  const leg2Ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: leg2Payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  const actualDelay = rng.int(45, 180);
  return {
    account,
    tickets: [leg1Ticket, leg2Ticket],
    payments: [leg1Payment, leg2Payment],
    route: routeWithActualTimes(route, actualDelay),
    disruption: makeDisruption(rng, route, "missed_connection", actualDelay),
  };
}

function buildTicketChange(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const payment = makePayment(rng, rng.int(60, 220), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route,
    disruption: null,
  };
}

function buildPassengerNameChange(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const payment = makePayment(rng, rng.int(60, 220), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route,
    disruption: null,
  };
}

function buildMissingRefund(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const payment = makePayment(rng, rng.int(60, 220), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased", "cancelled"],
  });
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route,
    disruption: makeDisruption(rng, route, "cancellation", 0),
  };
}

function buildPaymentWithoutTicket(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng, { requireOriginDestination: false });
  const orphanPayment = makePayment(
    rng,
    rng.int(60, 220),
    "completed",
    addHours(baseDate().toISOString(), -rng.int(1, 240)),
  );
  return {
    account,
    tickets: [],
    payments: [orphanPayment],
    route,
    disruption: null,
  };
}

function buildValidationDiscountPenalty(rng: Random): TopicResult {
  const account = makeAccount(rng);
  const route = makeRoute(rng);
  const purchasedAt = addHours(route.scheduledDeparture, -rng.int(2, 72));
  const payment = makePayment(rng, rng.int(40, 120), "completed", purchasedAt);
  const ticket = makeTicket({
    rng,
    ownerAccountId: account.id,
    passengers: [account.fullName],
    route,
    paymentId: payment.id,
    paymentStatus: "completed",
    historyTypes: ["purchased"],
  });
  return {
    account,
    tickets: [ticket],
    payments: [payment],
    route,
    disruption: null,
  };
}

const TOPIC_BUILDERS: Record<CaseTopic, (rng: Random) => TopicResult> = {
  delay_refund: buildDelayRefund,
  cancelled_train_refund: buildCancelledTrainRefund,
  missed_connection: buildMissedConnection,
  ticket_change: buildTicketChange,
  passenger_name_change: buildPassengerNameChange,
  missing_refund: buildMissingRefund,
  payment_without_ticket: buildPaymentWithoutTicket,
  validation_discount_penalty: buildValidationDiscountPenalty,
};

export function generateForTopic(topic: CaseTopic, rng: Random): TopicResult {
  const builder = TOPIC_BUILDERS[topic];
  return builder(rng);
}
