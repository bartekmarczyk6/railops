import { createDemoCase } from "./case-factory.js";
import type { CaseTopic, TruthMode } from "./types.js";
import { isCaseTopic, isNonNegativeInteger, isTruthMode } from "./validation.js";
import type { StoredCase } from "../storage/types.js";

export const MAX_SEED = 0x7fffffff;

export type CaseSeedParams = {
  topic: CaseTopic;
  truthMode: TruthMode;
  seed: number;
};

export function caseHref(c: {
  caseId: string;
  topic: string;
  truthMode: string;
  seed: number;
}): string {
  const params = new URLSearchParams({
    topic: c.topic,
    truthMode: c.truthMode,
    seed: String(c.seed),
  });
  return `/case/${c.caseId}?${params.toString()}`;
}

export function parseCaseSeedParams(search: string): CaseSeedParams | null {
  const params = new URLSearchParams(search);
  const topic = params.get("topic");
  const truthMode = params.get("truthMode");
  const seedRaw = params.get("seed");
  if (!isCaseTopic(topic) || !isTruthMode(truthMode)) return null;
  if (seedRaw === null || !/^\d+$/.test(seedRaw)) return null;
  const seed = Number(seedRaw);
  if (!isNonNegativeInteger(seed) || seed > MAX_SEED) return null;
  return { topic, truthMode, seed };
}

export function rebuildStoredCase(
  caseId: string,
  params: CaseSeedParams,
  now: string = new Date().toISOString(),
): StoredCase {
  const pkg = createDemoCase({ ...params, id: () => caseId });
  return {
    caseId,
    topic: params.topic,
    truthMode: params.truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed: params.seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    email: null,
    emailError: null,
    supplements: {},
    version: 1,
  };
}
