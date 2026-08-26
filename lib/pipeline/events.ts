export type { PipelineStage, TraceEvent, TraceStatus } from "../storage/types.ts";

import { randomUUID } from "node:crypto";
import type { PipelineStage, TraceEvent, TraceStatus } from "../storage/types.ts";

export type CreateEventInput = {
  caseId: string;
  runId: string;
  sequence: number;
  stage: PipelineStage;
  status: TraceStatus;
  summary: string;
  functionName?: string | null;
  recordRefs?: string[];
  evidenceRefs?: string[];
  payload?: unknown;
  durationMs?: number | null;
  error?: string | null;
  timestamp?: string;
};

export function createEvent(input: CreateEventInput): TraceEvent {
  return {
    id: randomUUID(),
    caseId: input.caseId,
    runId: input.runId,
    sequence: input.sequence,
    stage: input.stage,
    status: input.status,
    summary: input.summary,
    functionName: input.functionName ?? null,
    recordRefs: input.recordRefs ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    durationMs: input.durationMs ?? null,
    error: input.error ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
    payload: input.payload,
  };
}

export function nextSequence(events: readonly { sequence: number }[]): number {
  let max = 0;
  for (const e of events) {
    if (e.sequence > max) max = e.sequence;
  }
  return max + 1;
}

export function sameRunEvents(
  events: readonly TraceEvent[],
  caseId: string,
  runId: string,
): TraceEvent[] {
  return events.filter((e) => e.caseId === caseId && e.runId === runId);
}
