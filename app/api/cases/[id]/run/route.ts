import { NextResponse } from "next/server";

import { readState } from "@/lib/storage/store.ts";
import { getLlmClient } from "@/lib/pipeline/llm-resolver.ts";
import { runCase, resumeCase, PipelineError } from "@/lib/pipeline/run-case.ts";
import type { StreamFrame } from "@/lib/pipeline/run-case.ts";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";

type Params = { id: string };

function sseFrame(payload: TraceEvent | StreamFrame): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function notFound(): Response {
  return NextResponse.json({ error: "case_not_found" }, { status: 404 });
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

function parseMessage(
  raw: unknown,
): { ok: true; message: string | null } | { ok: false } {
  if (raw === undefined) return { ok: true, message: null };
  if (typeof raw !== "string") return { ok: false };
  return { ok: true, message: raw };
}

export async function POST(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;
  const dataDir = getDataDir();
  const state = await readState({ dataDir });
  if (!state.cases.find((c) => c.caseId === id)) {
    return notFound();
  }

  let parsed: unknown;
  try {
    const text = await request.text();
    parsed = text.trim().length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  let answers: Record<string, string> | null = null;
  let message: string | null = null;
  if (parsed !== undefined) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const body = parsed as Record<string, unknown>;
    if ("answers" in body) {
      const result = parseAnswers(body.answers);
      if (!result.ok) {
        return NextResponse.json({ error: "invalid_input" }, { status: 400 });
      }
      answers = result.answers;
    }
    if ("message" in body) {
      const result = parseMessage(body.message);
      if (!result.ok) {
        return NextResponse.json({ error: "invalid_input" }, { status: 400 });
      }
      message = result.message;
    }
  }

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
          close();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        const events =
          answers !== null || message !== null
            ? resumeCase(
                id,
                message !== null
                  ? { message, answers: answers ?? undefined }
                  : { answers: answers ?? undefined },
                {
                  dataDir,
                  signal,
                  llm,
                  onStream: (frame) => enqueue(sseFrame(frame)),
                },
              )
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
