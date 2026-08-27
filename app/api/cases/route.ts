import { NextResponse } from "next/server";

import { createDemoCase } from "../../../lib/domain/case-factory.ts";
import { readState, updateState } from "../../../lib/storage/store.ts";
import type { CaseState, StoredCase } from "../../../lib/storage/types.ts";
import { prepareCaseEmail } from "../../../lib/pipeline/email-prep.ts";
import { isCaseTopic, isTruthMode } from "../_shared/validation.ts";
import { getDataDir } from "../_shared/data-dir.ts";

type CaseSummary = {
  caseId: string;
  topic: string;
  truthMode: string;
  state: CaseState;
  createdAt: string;
  updatedAt: string;
  version: number;
};

type CaseStats = {
  total: number;
  byState: Record<string, number>;
  byTopic: Record<string, number>;
  byTruthMode: Record<string, number>;
};

function summarize(c: StoredCase): CaseSummary {
  return {
    caseId: c.caseId,
    topic: c.topic,
    truthMode: c.truthMode,
    state: c.state,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    version: c.version,
  };
}

function computeStats(cases: readonly StoredCase[]): CaseStats {
  const byState: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const byTruthMode: Record<string, number> = {};
  for (const c of cases) {
    byState[c.state] = (byState[c.state] ?? 0) + 1;
    byTopic[c.topic] = (byTopic[c.topic] ?? 0) + 1;
    byTruthMode[c.truthMode] = (byTruthMode[c.truthMode] ?? 0) + 1;
  }
  return { total: cases.length, byState, byTopic, byTruthMode };
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const { topic, truthMode } = body;
  if (!isCaseTopic(topic) || !isTruthMode(truthMode)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const pkg = createDemoCase({ topic, truthMode });
  const now = new Date().toISOString();
  const dataDir = getDataDir();
  const stored: StoredCase = {
    caseId: pkg.id,
    topic,
    truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed: pkg.seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    email: null,
    emailError: null,
    supplements: {},
    version: 1,
  };
  await updateState((s) => ({ ...s, cases: [...s.cases, stored] }), { dataDir });
  void prepareCaseEmail(stored.caseId, { dataDir }).catch(() => {});
  return NextResponse.json({ caseId: stored.caseId });
}

export async function GET(): Promise<Response> {
  const state = await readState({ dataDir: getDataDir() });
  return NextResponse.json({
    cases: state.cases.map(summarize),
    stats: computeStats(state.cases),
  });
}
