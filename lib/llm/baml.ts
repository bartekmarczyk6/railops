import { b as defaultBamlClient } from "../../baml_client/async_client";
import { BamlValidationError } from "@boundaryml/baml";
import type {
  Claim,
  CriticFinding,
  CritiqueReport,
  DecisionBasis,
  DecisionDraft,
  EmailDraft,
  ExtractedClaims,
} from "./types";

export type {
  Claim,
  CriticFinding,
  CritiqueReport,
  DecisionBasis,
  DecisionDraft,
  EmailDraft,
  ExtractedClaims,
};

export type DecisionOutcome =
  | "refund"
  | "change"
  | "follow_up"
  | "unsupported_or_escalate"
  | "information";

export type CriticSeverityName = "info" | "warning" | "error";

export type RawEmailDraft = {
  subject?: unknown;
  body?: unknown;
  mentionedFacts?: unknown;
};

export type RawClaim = {
  kind?: unknown;
  description?: unknown;
  value?: unknown;
  ticketNumber?: unknown;
};

export type RawExtractedClaims = {
  requestedAction?: unknown;
  claims?: unknown;
  missingFields?: unknown;
  referencedTicketNumbers?: unknown;
  referencedStations?: unknown;
};

export type RawDecisionBasisItem = {
  claim?: unknown;
  evidenceRef?: unknown;
  note?: unknown;
};

export type RawDecisionDraft = {
  outcome?: unknown;
  proposedAmount?: unknown;
  decisionBasis?: unknown;
  response?: unknown;
  evidenceRefs?: unknown;
};

export type RawCriticFinding = {
  severity?: unknown;
  message?: unknown;
  evidenceRef?: unknown;
};

export type RawCritiqueReport = {
  passed?: unknown;
  findings?: unknown;
  correctedDraft?: unknown;
};

export type RawBamlCaller = {
  GenerateCustomerEmail(input: {
    caseJson: string;
    topic: string;
    truthMode: string;
    claimsJson: string;
    rulesJson: string;
    knowledgeJson: string;
    memoryJson: string;
  }): Promise<RawEmailDraft>;
  ExtractCaseClaims(input: {
    caseJson: string;
    topic: string;
    truthMode: string;
    messageText: string;
  }): Promise<RawExtractedClaims>;
  DraftDecision(input: {
    caseJson: string;
    topic: string;
    truthMode: string;
    claimsJson: string;
    rulesJson: string;
    knowledgeJson: string;
    memoryJson: string;
  }): Promise<RawDecisionDraft>;
  CritiqueDecision(input: {
    caseJson: string;
    rulesJson: string;
    draftJson: string;
  }): Promise<RawCritiqueReport>;
};

export type LlmErrorCode =
  | "aborted"
  | "invalid_shape"
  | "invalid_outcome"
  | "missing_required_field"
  | "missing_evidence_refs"
  | "validation_failed"
  | "unknown";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly cause?: unknown;
  constructor(code: LlmErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

const OUTCOME_FROM_BAML: Record<string, DecisionOutcome> = {
  Refund: "refund",
  Change: "change",
  FollowUp: "follow_up",
  UnsupportedOrEscalate: "unsupported_or_escalate",
  Information: "information",
};

const SEVERITY_FROM_BAML: Record<string, CriticSeverityName> = {
  Info: "info",
  Warning: "warning",
  Error: "error",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function checkSignal(signal: AbortSignal | undefined): void {
  if (signal && signal.aborted) {
    throw new LlmError("aborted", "request aborted before BAML call");
  }
}

function withAbort<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
  if (!signal) return run();
  if (signal.aborted) {
    return Promise.reject(new LlmError("aborted", "request aborted before BAML call"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(new LlmError("aborted", "request aborted before BAML call"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    run().then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

function wrapBamlError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  if (err instanceof BamlValidationError) {
    return new LlmError("validation_failed", err.message, err);
  }
  if (err instanceof Error) {
    const message = err.message;
    if (/aborted|abort/i.test(message)) return new LlmError("aborted", message, err);
    if (/schema|validation|invalid|parse|mismatch/i.test(message)) {
      return new LlmError("validation_failed", message, err);
    }
    return new LlmError("unknown", message, err);
  }
  return new LlmError("unknown", "unknown BAML error", err);
}

function assertString(value: unknown, code: LlmErrorCode, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new LlmError(code, `${label} must be a non-empty string`);
  }
  return value;
}

function assertArrayNonEmpty<T>(value: T[], code: LlmErrorCode, label: string): T[] {
  if (value.length === 0) {
    throw new LlmError(code, `${label} must not be empty`);
  }
  return value;
}

function mapEmail(raw: RawEmailDraft): EmailDraft {
  if (!isRecord(raw)) {
    throw new LlmError("invalid_shape", "GenerateCustomerEmail returned non-object");
  }
  const subject = assertString(raw.subject, "invalid_shape", "subject");
  const body = assertString(raw.body, "invalid_shape", "body");
  const mentionedFacts = asStringArray(raw.mentionedFacts);
  return {
    subject,
    body,
    mentionedFacts: assertArrayNonEmpty(mentionedFacts, "invalid_shape", "mentionedFacts"),
  };
}

function mapClaim(raw: unknown): Claim | null {
  if (!isRecord(raw)) return null;
  const kind = asString(raw.kind);
  const description = asString(raw.description);
  if (kind.length === 0 || description.length === 0) return null;
  return {
    kind,
    description,
    value: asNumberOrNull(raw.value),
    ticketNumber: typeof raw.ticketNumber === "string" ? raw.ticketNumber : null,
  };
}

function mapExtractedClaims(raw: RawExtractedClaims): ExtractedClaims {
  if (!isRecord(raw)) {
    throw new LlmError("invalid_shape", "ExtractCaseClaims returned non-object");
  }
  const requestedAction = assertString(
    raw.requestedAction,
    "missing_required_field",
    "requestedAction",
  );
  const claimsRaw = Array.isArray(raw.claims) ? raw.claims : [];
  const claims = claimsRaw.map(mapClaim).filter((c): c is Claim => c !== null);
  const missingFields = asStringArray(raw.missingFields);
  const referencedTicketNumbers = asStringArray(raw.referencedTicketNumbers);
  const referencedStations = asStringArray(raw.referencedStations);
  return {
    requestedAction,
    claims,
    missingFields,
    referencedTicketNumbers,
    referencedStations,
  };
}

function mapDecisionBasis(raw: unknown): DecisionBasis | null {
  if (!isRecord(raw)) return null;
  const claim = asString(raw.claim);
  const evidenceRef = asString(raw.evidenceRef);
  const note = asString(raw.note);
  if (claim.length === 0 || evidenceRef.length === 0) return null;
  return { claim, evidenceRef, note };
}

function mapDecisionDraft(raw: RawDecisionDraft): DecisionDraft {
  if (!isRecord(raw)) {
    throw new LlmError("invalid_shape", "DraftDecision returned non-object");
  }
  const outcomeRaw = asString(raw.outcome);
  const outcome = OUTCOME_FROM_BAML[outcomeRaw];
  if (!outcome) {
    throw new LlmError("invalid_outcome", `unsupported outcome: ${outcomeRaw || "<empty>"}`);
  }
  const proposedAmount = asNumberOrNull(raw.proposedAmount);
  const decisionBasisRaw = Array.isArray(raw.decisionBasis) ? raw.decisionBasis : [];
  const decisionBasis = decisionBasisRaw
    .map(mapDecisionBasis)
    .filter((b): b is DecisionBasis => b !== null);
  assertArrayNonEmpty(decisionBasis, "invalid_shape", "decisionBasis");
  const response = assertString(raw.response, "invalid_shape", "response");
  const evidenceRefs = asStringArray(raw.evidenceRefs);
  if (evidenceRefs.length === 0) {
    throw new LlmError("missing_evidence_refs", "decision draft missing evidenceRefs");
  }
  return {
    outcome,
    proposedAmount,
    decisionBasis,
    response,
    evidenceRefs: assertArrayNonEmpty(
      evidenceRefs,
      "missing_evidence_refs",
      "evidenceRefs",
    ),
  };
}

function mapCriticFinding(raw: unknown): CriticFinding | null {
  if (!isRecord(raw)) return null;
  const severityRaw = asString(raw.severity);
  const severity = SEVERITY_FROM_BAML[severityRaw];
  if (!severity) return null;
  const message = asString(raw.message);
  if (message.length === 0) return null;
  return {
    severity,
    message,
    evidenceRef: typeof raw.evidenceRef === "string" ? raw.evidenceRef : null,
  };
}

function mapCritiqueReport(raw: RawCritiqueReport): CritiqueReport {
  if (!isRecord(raw)) {
    throw new LlmError("invalid_shape", "CritiqueDecision returned non-object");
  }
  const passed = raw.passed === true;
  const findingsRaw = Array.isArray(raw.findings) ? raw.findings : [];
  const findings = findingsRaw
    .map(mapCriticFinding)
    .filter((f): f is CriticFinding => f !== null);
  let correctedDraft: DecisionDraft | null = null;
  if (raw.correctedDraft && raw.correctedDraft !== null && isRecord(raw.correctedDraft)) {
    try {
      correctedDraft = mapDecisionDraft(raw.correctedDraft as RawDecisionDraft);
    } catch {
      correctedDraft = null;
    }
  }
  return { passed, findings, correctedDraft };
}

function buildBamlAdapter(caller: RawBamlCaller): {
  generateCustomerEmail(
    caseJson: string,
    topic: string,
    truthMode: string,
    claimsJson: string,
    rulesJson: string,
    knowledgeJson: string,
    memoryJson: string,
    signal?: AbortSignal,
  ): Promise<EmailDraft>;
  extractCaseClaims(
    caseJson: string,
    topic: string,
    truthMode: string,
    messageText: string,
    signal?: AbortSignal,
  ): Promise<ExtractedClaims>;
  draftDecision(
    caseJson: string,
    topic: string,
    truthMode: string,
    claimsJson: string,
    rulesJson: string,
    knowledgeJson: string,
    memoryJson: string,
    signal?: AbortSignal,
  ): Promise<DecisionDraft>;
  critiqueDecision(
    caseJson: string,
    rulesJson: string,
    draftJson: string,
    signal?: AbortSignal,
  ): Promise<CritiqueReport>;
} {
  return {
    async generateCustomerEmail(
      caseJson,
      topic,
      truthMode,
      claimsJson,
      rulesJson,
      knowledgeJson,
      memoryJson,
      signal,
    ) {
      checkSignal(signal);
      return withAbort(signal, async () => {
        try {
          const raw = await caller.GenerateCustomerEmail({
            caseJson,
            topic,
            truthMode,
            claimsJson,
            rulesJson,
            knowledgeJson,
            memoryJson,
          });
          return mapEmail(raw);
        } catch (err) {
          throw wrapBamlError(err);
        }
      });
    },
    async extractCaseClaims(caseJson, topic, truthMode, messageText, signal) {
      checkSignal(signal);
      return withAbort(signal, async () => {
        try {
          const raw = await caller.ExtractCaseClaims({
            caseJson,
            topic,
            truthMode,
            messageText,
          });
          return mapExtractedClaims(raw);
        } catch (err) {
          throw wrapBamlError(err);
        }
      });
    },
    async draftDecision(
      caseJson,
      topic,
      truthMode,
      claimsJson,
      rulesJson,
      knowledgeJson,
      memoryJson,
      signal,
    ) {
      checkSignal(signal);
      return withAbort(signal, async () => {
        try {
          const raw = await caller.DraftDecision({
            caseJson,
            topic,
            truthMode,
            claimsJson,
            rulesJson,
            knowledgeJson,
            memoryJson,
          });
          return mapDecisionDraft(raw);
        } catch (err) {
          throw wrapBamlError(err);
        }
      });
    },
    async critiqueDecision(caseJson, rulesJson, draftJson, signal) {
      checkSignal(signal);
      return withAbort(signal, async () => {
        try {
          const raw = await caller.CritiqueDecision({ caseJson, rulesJson, draftJson });
          return mapCritiqueReport(raw);
        } catch (err) {
          throw wrapBamlError(err);
        }
      });
    },
  };
}

function buildRawCallerFromBamlClient(client: typeof defaultBamlClient): RawBamlCaller {
  const real = client as unknown as {
    GenerateCustomerEmail?: (...args: unknown[]) => Promise<unknown>;
    ExtractCaseClaims?: (...args: unknown[]) => Promise<unknown>;
    DraftDecision?: (...args: unknown[]) => Promise<unknown>;
    CritiqueDecision?: (...args: unknown[]) => Promise<unknown>;
  };
  const callGenerateEmail = real.GenerateCustomerEmail;
  const callExtract = real.ExtractCaseClaims;
  const callDraft = real.DraftDecision;
  const callCritique = real.CritiqueDecision;
  if (
    typeof callGenerateEmail !== "function" ||
    typeof callExtract !== "function" ||
    typeof callDraft !== "function" ||
    typeof callCritique !== "function"
  ) {
    throw new LlmError("unknown", "BAML client is missing required functions");
  }
  return {
    async GenerateCustomerEmail(input) {
      return (await callGenerateEmail.call(
        client,
        input.caseJson,
        input.topic,
        input.truthMode,
        input.claimsJson,
        input.rulesJson,
        input.knowledgeJson,
        input.memoryJson,
      )) as RawEmailDraft;
    },
    async ExtractCaseClaims(input) {
      return (await callExtract.call(
        client,
        input.caseJson,
        input.topic,
        input.truthMode,
        input.messageText,
      )) as RawExtractedClaims;
    },
    async DraftDecision(input) {
      return (await callDraft.call(
        client,
        input.caseJson,
        input.topic,
        input.truthMode,
        input.claimsJson,
        input.rulesJson,
        input.knowledgeJson,
        input.memoryJson,
      )) as RawDecisionDraft;
    },
    async CritiqueDecision(input) {
      return (await callCritique.call(
        client,
        input.caseJson,
        input.rulesJson,
        input.draftJson,
      )) as RawCritiqueReport;
    },
  };
}

let currentAdapter = buildBamlAdapter(buildRawCallerFromBamlClient(defaultBamlClient));

export function setBamlClientForTesting(caller: RawBamlCaller): void {
  currentAdapter = buildBamlAdapter(caller);
}

export function resetBamlClientForTesting(): void {
  currentAdapter = buildBamlAdapter(buildRawCallerFromBamlClient(defaultBamlClient));
}

export type GenerateEmailInput = {
  casePackageJson: string;
  topic: string;
  truthMode: string;
  claimsJson: string;
  rulesJson: string;
  knowledgeJson: string;
  memoryJson: string;
};

export async function generateCustomerEmail(
  input: GenerateEmailInput | string,
  signal?: AbortSignal,
): Promise<EmailDraft> {
  const params: GenerateEmailInput =
    typeof input === "string"
      ? {
          casePackageJson: input,
          topic: "",
          truthMode: "",
          claimsJson: "{}",
          rulesJson: "{}",
          knowledgeJson: "[]",
          memoryJson: "{}",
        }
      : input;
  return currentAdapter.generateCustomerEmail(
    params.casePackageJson,
    params.topic,
    params.truthMode,
    params.claimsJson,
    params.rulesJson,
    params.knowledgeJson,
    params.memoryJson,
    signal,
  );
}

export type ExtractClaimsInput = {
  casePackageJson: string;
  topic: string;
  truthMode: string;
  messageText: string;
};

export async function extractCaseClaims(
  input: ExtractClaimsInput | string,
  signal?: AbortSignal,
): Promise<ExtractedClaims> {
  const params: ExtractClaimsInput =
    typeof input === "string"
      ? {
          casePackageJson: input,
          topic: "",
          truthMode: "",
          messageText: "",
        }
      : input;
  return currentAdapter.extractCaseClaims(
    params.casePackageJson,
    params.topic,
    params.truthMode,
    params.messageText,
    signal,
  );
}

export type DraftDecisionInput = {
  casePackageJson: string;
  topic: string;
  truthMode: string;
  claimsJson: string;
  rulesJson: string;
  knowledgeJson: string;
  memoryJson: string;
};

export async function draftDecision(
  input: DraftDecisionInput | string,
  signal?: AbortSignal,
): Promise<DecisionDraft> {
  const params: DraftDecisionInput =
    typeof input === "string"
      ? {
          casePackageJson: input,
          topic: "",
          truthMode: "",
          claimsJson: "{}",
          rulesJson: "{}",
          knowledgeJson: "[]",
          memoryJson: "{}",
        }
      : input;
  return currentAdapter.draftDecision(
    params.casePackageJson,
    params.topic,
    params.truthMode,
    params.claimsJson,
    params.rulesJson,
    params.knowledgeJson,
    params.memoryJson,
    signal,
  );
}

export type CritiqueDecisionInput = {
  casePackageJson: string;
  rulesJson: string;
  draftJson: string;
};

export async function critiqueDecision(
  input: CritiqueDecisionInput | string,
  signal?: AbortSignal,
): Promise<CritiqueReport> {
  const params: CritiqueDecisionInput =
    typeof input === "string"
      ? {
          casePackageJson: input,
          rulesJson: "{}",
          draftJson: "{}",
        }
      : input;
  return currentAdapter.critiqueDecision(
    params.casePackageJson,
    params.rulesJson,
    params.draftJson,
    signal,
  );
}
