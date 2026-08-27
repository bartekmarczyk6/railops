import { NextResponse } from "next/server";

import { readState } from "@/lib/storage/store.ts";
import { getLlmClient } from "@/lib/pipeline/llm-resolver.ts";
import { rewriteResponseText } from "@/lib/llm/baml.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";

type Params = { id: string };

function badRequest(): Response {
  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}

export async function POST(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;
  const state = await readState({ dataDir: getDataDir() });
  const stored = state.cases.find((c) => c.caseId === id);
  if (!stored) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest();
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return badRequest();
  }
  const body = raw as Record<string, unknown>;
  const { selection, instruction, response } = body;
  if (
    typeof selection !== "string" || selection.trim().length === 0 ||
    typeof instruction !== "string" || instruction.trim().length === 0 ||
    typeof response !== "string" || response.trim().length === 0
  ) {
    return badRequest();
  }

  const contextJson = JSON.stringify({
    response,
    caseId: id,
    topic: stored.topic,
    truthMode: stored.truthMode,
    account: {
      fullName: stored.pkg.account.fullName,
      email: stored.pkg.account.email,
    },
  });

  try {
    const llm = getLlmClient();
    const result = llm.rewriteResponseText
      ? await llm.rewriteResponseText({ selection, instruction, contextJson })
      : await rewriteResponseText({ selection, instruction, contextJson });
    return NextResponse.json({ rewritten: result.rewrittenSelection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "rewrite_failed", message },
      { status: 502 },
    );
  }
}
