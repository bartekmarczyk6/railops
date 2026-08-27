import type { LearningRecord } from "./types";

const ID_PATTERNS: RegExp[] = [
  /\b(?:acct|account|tkt|ticket|pay|payment|txn|route|booking|reservation|carriage|seat)-[A-Za-z0-9]+\b/gi,
  /\b[A-Z]{2}\d{6,}\b/g,
];

export function sanitizeLearningText(input: string): string {
  let text = input;
  for (const pattern of ID_PATTERNS) {
    text = text.replace(pattern, "[REDACTED-ID]");
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

export function buildLearningContent(record: LearningRecord): string {
  const parts: string[] = [];
  parts.push(`Topic: ${record.topic}`);
  parts.push(`Outcome: ${record.outcome}`);
  parts.push(`Reviewer action: ${record.reviewerAction}`);
  if (record.feedback) {
    parts.push(`Feedback: ${sanitizeLearningText(record.feedback)}`);
  }
  parts.push(`Original draft: ${sanitizeLearningText(record.originalDraftSummary)}`);
  parts.push(`Final draft: ${sanitizeLearningText(record.finalDraftSummary)}`);
  if (record.changedGuidance.length > 0) {
    const guidance = record.changedGuidance
      .map((g) => sanitizeLearningText(g))
      .filter((g) => g.length > 0);
    parts.push(`Changed guidance:\n- ${guidance.join("\n- ")}`);
  }
  parts.push(`Recorded at: ${record.timestamp}`);
  return parts.join("\n");
}

export function learningTags(record: LearningRecord): string[] {
  return ["reviewer_learning", record.topic, `outcome:${record.outcome}`, `action:${record.reviewerAction}`];
}

export function learningMetadata(record: LearningRecord): Record<string, string> {
  return {
    topic: record.topic,
    outcome: record.outcome,
    reviewerAction: record.reviewerAction,
    timestamp: record.timestamp,
  };
}
