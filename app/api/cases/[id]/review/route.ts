import { NextResponse } from "next/server";

import { readState } from "@/lib/storage/store.ts";
import { reviewCase, ReviewError, MaxRevisionsReached } from "@/lib/pipeline/review.ts";
import type { ReviewInput } from "@/lib/pipeline/review.ts";
import type { DecisionDraft, DecisionOutcome } from "@/lib/llm/types.ts";
import { getDataDir } from "@/app/api/_shared/data-dir.ts";
import {
  isNonNegativeInteger,
  isReviewAction,
  isFeedbackString,
} from "@/app/api/_shared/validation.ts";

type Params = { id: string };

const DECISION_OUTCOMES: ReadonlySet<DecisionOutcome> = new Set<DecisionOutcome>([
  "refund",
  "change",
  "follow_up",
  "unsupported_or_escalate",
  "information",
]);

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

function validateEditedDraft(value: unknown): value is DecisionDraft {
  if (value === null || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (typeof d.outcome !== "string" || !DECISION_OUTCOMES.has(d.outcome as DecisionOutcome)) {
    return false;
  }
  if (d.proposedAmount !== null && typeof d.proposedAmount !== "number") return false;
  if (!Array.isArray(d.decisionBasis)) return false;
  if (typeof d.response !== "string") return false;
  if (!Array.isArray(d.evidenceRefs)) return false;
  return true;
}

export async function POST(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const { id } = await context.params;
  const dataDir = getDataDir();
  const state = await readState({ dataDir });
  if (!state.cases.find((c) => c.caseId === id)) {
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("invalid_body");
  }
  if (raw === null || typeof raw !== "object") {
    return badRequest("invalid_body");
  }
  const body = raw as Record<string, unknown>;
  const { action, feedback, editedDraft, expectedVersion } = body;

  if (!isReviewAction(action)) {
    return badRequest("invalid_action");
  }
  if (!isNonNegativeInteger(expectedVersion)) {
    return badRequest("invalid_expected_version");
  }
  if (feedback !== undefined && feedback !== null && !isFeedbackString(feedback)) {
    return badRequest("invalid_feedback");
  }
  if (action === "reject" && (typeof feedback !== "string" || feedback.trim().length === 0)) {
    return badRequest("feedback_required");
  }
  if (action === "edit" && !validateEditedDraft(editedDraft)) {
    return badRequest("edited_draft_required");
  }

  const input: ReviewInput = {
    caseId: id,
    action: action as ReviewInput["action"],
    feedback: typeof feedback === "string" ? feedback : undefined,
    editedDraft: action === "edit" && validateEditedDraft(editedDraft) ? editedDraft : undefined,
    expectedVersion,
  };

  try {
    const updated = await reviewCase(input, { dataDir });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof MaxRevisionsReached) {
      return NextResponse.json({ error: "max_revisions_reached" }, { status: 409 });
    }
    if (err instanceof ReviewError) {
      if (err.code === "case_not_found") {
        return NextResponse.json({ error: "case_not_found" }, { status: 404 });
      }
      if (err.code === "version_mismatch") {
        return NextResponse.json({ error: "version_mismatch" }, { status: 409 });
      }
      if (err.code === "invalid_state") {
        return NextResponse.json({ error: "invalid_state" }, { status: 409 });
      }
      if (err.code === "feedback_required" || err.code === "edited_draft_required") {
        return NextResponse.json({ error: err.code }, { status: 400 });
      }
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
