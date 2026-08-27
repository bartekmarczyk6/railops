import { NextResponse } from "next/server";

import { createDemoCase } from "../../../../lib/domain/case-factory.ts";
import { generateCustomerEmail } from "../../../../lib/llm/baml.ts";
import { buildEmailInput } from "../../../../lib/pipeline/email-prep.ts";
import {
  isCaseTopic,
  isNonNegativeInteger,
  isTruthMode,
} from "../../_shared/validation.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const { topic, truthMode, seed } = body;
  if (
    !isCaseTopic(topic) ||
    !isTruthMode(truthMode) ||
    !isNonNegativeInteger(seed)
  ) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const pkg = createDemoCase({ topic, truthMode, seed });
    const email = await generateCustomerEmail(buildEmailInput(pkg));
    return NextResponse.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "email_failed", message },
      { status: 502 },
    );
  }
}
