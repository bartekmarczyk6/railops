import { resolve } from "node:path";

import { readState, updateState } from "../storage/store.ts";
import type { StoredEmail } from "../storage/types.ts";
import type { GenerateEmailInput } from "../llm/baml.ts";
import type { DemoCasePackage } from "../domain/types.ts";

import { DEFAULT_DATA_DIR, PipelineError, type LlmClient } from "./run-case.ts";

const inflight = new Map<string, Promise<StoredEmail>>();

export type EmailPrepOptions = {
  dataDir?: string;
  llm?: LlmClient;
};

function inflightKey(dataDir: string, caseId: string): string {
  return `${resolve(dataDir)}\u0000${caseId}`;
}

async function resolveLlm(opts: EmailPrepOptions): Promise<LlmClient> {
  if (opts.llm) return opts.llm;
  const { getLlmClient } = await import("./llm-resolver.ts");
  return getLlmClient();
}

function buildEmailInput(pkg: DemoCasePackage): GenerateEmailInput {
  return {
    casePackageJson: JSON.stringify(pkg),
    topic: pkg.topic,
    truthMode: pkg.truthMode,
    claimsJson: "{}",
    rulesJson: "{}",
    knowledgeJson: "[]",
    memoryJson: JSON.stringify({ source: "none", reviewerGuidance: [] }),
  };
}

async function generateAndPersist(
  caseId: string,
  dataDir: string,
  llm: LlmClient,
): Promise<StoredEmail> {
  const state = await readState({ dataDir });
  const stored = state.cases.find((c) => c.caseId === caseId);
  if (!stored) {
    throw new PipelineError("case_not_found", `case ${caseId} not found`);
  }
  if (stored.email) return stored.email;
  try {
    const draft = await llm.generateCustomerEmail(buildEmailInput(stored.pkg));
    const email: StoredEmail = {
      from: stored.pkg.account.email,
      subject: draft.subject,
      body: draft.body,
      mentionedFacts: draft.mentionedFacts,
      receivedAt: new Date().toISOString(),
    };
    await updateState(
      (s) => ({
        ...s,
        cases: s.cases.map((c) =>
          c.caseId === caseId
            ? { ...c, email, updatedAt: new Date().toISOString() }
            : c,
        ),
      }),
      { dataDir },
    );
    return email;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateState(
      (s) => ({
        ...s,
        cases: s.cases.map((c) =>
          c.caseId === caseId
            ? { ...c, emailError: message, updatedAt: new Date().toISOString() }
            : c,
        ),
      }),
      { dataDir },
    );
    throw err;
  }
}

export function prepareCaseEmail(
  caseId: string,
  opts: EmailPrepOptions = {},
): Promise<StoredEmail> {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  const key = inflightKey(dataDir, caseId);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const llm = await resolveLlm(opts);
      return await generateAndPersist(caseId, dataDir, llm);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export async function awaitCaseEmail(
  caseId: string,
  opts: EmailPrepOptions = {},
): Promise<StoredEmail> {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  const state = await readState({ dataDir });
  const stored = state.cases.find((c) => c.caseId === caseId);
  if (!stored) {
    throw new PipelineError("case_not_found", `case ${caseId} not found`);
  }
  if (stored.email) return stored.email;
  try {
    return await prepareCaseEmail(caseId, { ...opts, dataDir });
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new PipelineError("email_failed", message);
  }
}
