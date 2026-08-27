import { NextResponse } from "next/server";

import { getLlmClient } from "@/lib/pipeline/llm-resolver.ts";
import { rewriteResponseText } from "@/lib/llm/baml.ts";
import { isCaseTopic, isTruthMode } from "@/app/api/_shared/validation.ts";

type Params = { id: string };

export const runtime = "nodejs";
export const maxDuration = 60;

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

function isValidAccount(value: unknown): value is { fullName: string; email: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const account = value as Record<string, unknown>;
  return (
    typeof account.fullName === "string" && account.fullName.trim().length > 0 &&
    typeof account.email === "string" && account.email.trim().length > 0
  );
}

export async function POST(
  request: Request,
  _context: { params: Promise<Params> },
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("invalid_body");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return badRequest("invalid_body");
  }
  const body = raw as Record<string, unknown>;
  const { selection, instruction, response, topic, truthMode, account } = body;
  if (
    typeof selection !== "string" || selection.trim().length === 0 ||
    typeof instruction !== "string" || instruction.trim().length === 0 ||
    typeof response !== "string" || response.trim().length === 0 ||
    !isCaseTopic(topic) ||
    !isTruthMode(truthMode) ||
    !isValidAccount(account)
  ) {
    return badRequest("invalid_input");
  }

  const contextJson = JSON.stringify({
    response,
    topic,
    truthMode,
    account: {
      fullName: account.fullName,
      email: account.email,
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
