import type { CaseState, ReviewAction, StoredCase } from "../lib/storage/types.ts";

export type AlignmentPoint = {
  caseSeq: number;
  alignment: number;
};

export type OutcomeCount = {
  outcome: string;
  count: number;
};

export type DashboardStats = {
  total: number;
  reviewed: number;
  byState: Record<string, number>;
  byTopic: Record<string, number>;
  byTruthMode: Record<string, number>;
};

export type DashboardData = {
  cases: StoredCase[];
  stats: DashboardStats;
  alignment: AlignmentPoint[];
  outcomes: OutcomeCount[];
};

const REVIEWED_STATES: ReadonlySet<CaseState> = new Set<CaseState>([
  "approved",
  "rejected",
  "revising",
  "learning_saved",
]);

export function isReviewed(state: CaseState): boolean {
  return REVIEWED_STATES.has(state);
}

export function hasReviewRecord(storedCase: StoredCase): boolean {
  return storedCase.reviewHistory.length > 0;
}

function alignmentFor(action: ReviewAction): number {
  if (action === "approve") return 1;
  if (action === "reject") return 0;
  return 0.5;
}

function outcomeFor(action: ReviewAction): string {
  if (action === "approve") return "refund";
  if (action === "reject") return "denied";
  return "draft";
}

function sortByCreatedAt(cases: readonly StoredCase[]): StoredCase[] {
  return [...cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function computeDashboardData(cases: readonly StoredCase[]): DashboardData {
  const sorted = sortByCreatedAt(cases);
  const byState: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  const byTruthMode: Record<string, number> = {};
  const alignment: AlignmentPoint[] = [];
  const outcomeTotals = new Map<string, number>();
  let reviewed = 0;
  let caseSeq = 0;

  for (const c of sorted) {
    byState[c.state] = (byState[c.state] ?? 0) + 1;
    byTopic[c.topic] = (byTopic[c.topic] ?? 0) + 1;
    byTruthMode[c.truthMode] = (byTruthMode[c.truthMode] ?? 0) + 1;
    if (!hasReviewRecord(c)) continue;
    reviewed += 1;
    const last = c.reviewHistory[c.reviewHistory.length - 1];
    if (!last) continue;
    caseSeq += 1;
    alignment.push({ caseSeq, alignment: alignmentFor(last.action) });
    const outcome = outcomeFor(last.action);
    outcomeTotals.set(outcome, (outcomeTotals.get(outcome) ?? 0) + 1);
  }

  const outcomes: OutcomeCount[] = [...outcomeTotals.entries()]
    .map(([outcome, count]) => ({ outcome, count }))
    .sort((a, b) => a.outcome.localeCompare(b.outcome));

  return {
    cases: sorted,
    stats: { total: sorted.length, reviewed, byState, byTopic, byTruthMode },
    alignment,
    outcomes,
  };
}
