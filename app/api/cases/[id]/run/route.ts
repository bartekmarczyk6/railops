import { NextResponse } from "next/server";

import { readState } from "@/lib/storage/store.ts";
import { getLlmClient } from "@/lib/pipeline/llm-resolver.ts";
import { runCase, PipelineError } from "@/lib/pipeline/run-case.ts";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";

type Params = { id: string };

function sseFrame(event: TraceEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function notFound(): Response {
  return NextResponse.json({ error: "case_not_found" }, { status: 404 });
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
        for await (const event of runCase(id, { dataDir, signal, llm })) {
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
