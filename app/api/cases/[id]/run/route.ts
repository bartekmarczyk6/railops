import { NextResponse } from "next/server";

import { getLlmClient } from "@/lib/pipeline/llm-resolver.ts";
import { runCase, resumeCase, PipelineError } from "@/lib/pipeline/run-case.ts";
import type { StreamFrame } from "@/lib/pipeline/run-case.ts";
import { readState, seedState, dropState } from "@/lib/storage/store.ts";
import {
  CURRENT_SCHEMA_VERSION,
  type AppState,
  type StoredCase,
  type TraceEvent,
} from "@/lib/storage/types.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { id: string };

type DoneFrame = { type: "done"; stored: StoredCase; events: TraceEvent[] };

function sseFrame(payload: TraceEvent | StreamFrame | DoneFrame): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseStored(
  raw: unknown,
): StoredCase | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<StoredCase>;
  if (typeof candidate.caseId !== "string" || candidate.caseId.length === 0) {
    return null;
  }
  return raw as StoredCase;
}

function parseAnswers(
  raw: unknown,
): { ok: true; answers: Record<string, string> | null } | { ok: false } {
  if (raw === undefined) return { ok: true, answers: null };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return { ok: true, answers: {} };
  for (const [key, value] of entries) {
    if (key.length === 0 || typeof value !== "string") return { ok: false };
  }
  return { ok: true, answers: Object.fromEntries(entries) as Record<string, string> };
}

export async function POST(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;

  let parsed: unknown;
  try {
    const text = await request.text();
    parsed = text.trim().length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (parsed === undefined || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  const stored = parseStored(body.stored);
  if (!stored) {
    return NextResponse.json(
      { error: "invalid_input", message: "stored case is required" },
      { status: 400 },
    );
  }
  if (stored.caseId !== id) {
    return NextResponse.json(
      { error: "invalid_input", message: "stored.caseId does not match route id" },
      { status: 400 },
    );
  }

  let answers: Record<string, string> | null = null;
  if ("answers" in body) {
    const result = parseAnswers(body.answers);
    if (!result.ok) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    answers = result.answers;
  }

  let priorEvents: TraceEvent[] = [];
  if ("events" in body) {
    if (!Array.isArray(body.events)) {
      return NextResponse.json(
        { error: "invalid_input", message: "events must be an array" },
        { status: 400 },
      );
    }
    priorEvents = (body.events as unknown[]).filter((e): e is TraceEvent => {
      if (e === null || typeof e !== "object" || Array.isArray(e)) return false;
      const ev = e as Record<string, unknown>;
      return ev.caseId === id && typeof ev.id === "string";
    });
  }

  const state: AppState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cases: [stored],
    events: priorEvents,
    learning: [],
  };
  const dataDir = `request:${id}:${globalThis.crypto.randomUUID()}`;
  seedState(dataDir, state);

  const signal = request.signal;
  const llm = getLlmClient();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const enqueue = (chunk: Uint8Array): void => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };
      const onAbort = (): void => {
        close();
      };
      if (signal) {
        if (signal.aborted) {
          dropState(dataDir);
          close();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        const events =
          answers !== null
            ? resumeCase(id, answers, {
                dataDir,
                signal,
                llm,
                onStream: (frame) => enqueue(sseFrame(frame)),
              })
            : runCase(id, {
                dataDir,
                signal,
                llm,
                onStream: (frame) => enqueue(sseFrame(frame)),
              });
        for await (const event of events) {
          if (signal?.aborted) {
            close();
            return;
          }
          enqueue(sseFrame(event));
        }
        const finalState = await readState({ dataDir });
        const updated = finalState.cases.find((c) => c.caseId === id) ?? stored;
        const runEvents = finalState.events.filter((e) => e.caseId === id);
        enqueue(sseFrame({ type: "done", stored: updated, events: runEvents }));
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof PipelineError ? err.code : "provider_error";
        const failed: TraceEvent = {
          id: `failed-${Date.now()}`,
          caseId: id,
          runId: `run-${id}`,
          sequence: Number.MAX_SAFE_INTEGER,
          stage: "reviewable",
          status: "failed",
          summary: `pipeline error: ${message}`,
          functionName: null,
          recordRefs: [],
          evidenceRefs: [],
          durationMs: null,
          error: code,
          timestamp: new Date().toISOString(),
        };
        enqueue(sseFrame(failed));
        close();
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
        dropState(dataDir);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
