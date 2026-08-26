import type { DecisionDraft } from "./rules/types.js";
export type { DecisionDraft } from "./rules/types.js";

export type EvidenceValidation = {
  valid: boolean;
  invalidRefs: string[];
};

const PATTERNS: readonly RegExp[] = [
  /^record:ticket:[a-z0-9-]+$/,
  /^record:route:[a-z0-9-]+$/,
  /^record:payment:[a-z0-9-]+$/,
  /^rule:[0-9]+\.[0-9]+\.[0-9]+:[a-z0-9_.-]+$/,
  /^knowledge:[a-z0-9-]+:[a-zA-Z0-9 _.-]+$/,
];

function refFormatValid(ref: string): boolean {
  for (const pattern of PATTERNS) {
    if (pattern.test(ref)) return true;
  }
  return false;
}

export function validateEvidenceChain(
  draft: DecisionDraft,
  knownRefs: Set<string>,
): EvidenceValidation {
  const invalidRefs: string[] = [];
  for (const ref of draft.evidenceRefs) {
    if (!refFormatValid(ref)) {
      invalidRefs.push(ref);
      continue;
    }
    if (knownRefs.size > 0 && !knownRefs.has(ref)) {
      invalidRefs.push(ref);
    }
  }
  return {
    valid: invalidRefs.length === 0,
    invalidRefs,
  };
}
