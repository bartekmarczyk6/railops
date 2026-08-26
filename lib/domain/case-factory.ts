import { randomUUID } from "node:crypto";
import type {
  AccountRecord,
  CaseTopic,
  DemoCasePackage,
  DisruptionRecord,
  ExpectedAssertions,
  PaymentRecord,
  RouteRecord,
  TicketRecord,
  TruthMode,
} from "./types.js";
import { generateForTopic, type TopicResult } from "./topics.js";
import { applyTruthMode, buildBaseExpected } from "./truth-modes.js";

export type Random = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  uuid(): string;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFromSeed(seed: number): Random {
  const next = mulberry32(seed);
  const int = (min: number, max: number): number =>
    Math.floor(next() * (max - min + 1)) + min;
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) {
      throw new Error("pick from empty array");
    }
    return arr[int(0, arr.length - 1)] as T;
  };
  const hex = (n: number): string => n.toString(16).padStart(2, "0");
  const uuid = (): string => {
    const bytes: number[] = [];
    for (let i = 0; i < 16; i++) {
      bytes.push(int(0, 255));
    }
    const b6 = bytes[6] ?? 0;
    const b8 = bytes[8] ?? 0;
    bytes[6] = (b6 & 0x0f) | 0x40;
    bytes[8] = (b8 & 0x3f) | 0x80;
    return [
      hex(bytes[0]!) + hex(bytes[1]!) + hex(bytes[2]!) + hex(bytes[3]!),
      hex(bytes[4]!) + hex(bytes[5]!),
      hex(bytes[6]!) + hex(bytes[7]!),
      hex(bytes[8]!) + hex(bytes[9]!),
      hex(bytes[10]!) +
        hex(bytes[11]!) +
        hex(bytes[12]!) +
        hex(bytes[13]!) +
        hex(bytes[14]!) +
        hex(bytes[15]!),
    ].join("-");
  };
  return { next, int, pick, uuid };
}

function randomUnseeded(): Random {
  const int = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) {
      throw new Error("pick from empty array");
    }
    return arr[int(0, arr.length - 1)] as T;
  };
  return {
    next: Math.random,
    int,
    pick,
    uuid: () => randomUUID(),
  };
}

const CREATED_AT_BASE_MS = Date.parse("2026-06-01T00:00:00.000Z");
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function deterministicCreatedAt(rng: Random): string {
  const offset = rng.int(0, ONE_YEAR_MS);
  return new Date(CREATED_AT_BASE_MS + offset).toISOString();
}

function buildCase(
  topic: CaseTopic,
  truthMode: TruthMode,
  seed: number,
  rng: Random,
  createdAt: string,
): DemoCasePackage {
  const records: TopicResult = generateForTopic(topic, rng);
  const baseExpected: ExpectedAssertions = buildBaseExpected(records, topic);
  const expected: ExpectedAssertions = applyTruthMode(
    baseExpected,
    truthMode,
    records,
  );
  return {
    id: rng.uuid(),
    seed,
    topic,
    truthMode,
    account: records.account,
    tickets: records.tickets,
    payments: records.payments,
    route: records.route,
    disruption: records.disruption,
    expected,
    createdAt,
  };
}

export function createDemoCase(input: {
  topic: CaseTopic;
  truthMode: TruthMode;
  seed?: number;
}): DemoCasePackage {
  if (input.seed === undefined) {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const rng = randomUnseeded();
    return buildCase(input.topic, input.truthMode, seed, rng, new Date().toISOString());
  }
  const rng = randomFromSeed(input.seed);
  return buildCase(
    input.topic,
    input.truthMode,
    input.seed,
    rng,
    deterministicCreatedAt(rng),
  );
}

export type { AccountRecord, TicketRecord, PaymentRecord, RouteRecord, DisruptionRecord };
