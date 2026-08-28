import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createDemoCase } from "../lib/domain/case-factory.ts";
import { updateState, readState, resetState } from "../lib/storage/store.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";
import type {
  EmailDraft,
  ExtractedClaims,
  DecisionDraft,
  CritiqueReport,
  DecisionBasis,
  CriticFinding,
} from "../lib/llm/types.ts";

import { runCase, resumeCase, MaxRevisionsReached, PipelineError, ReviewError } from "../lib/pipeline/run-case.ts";
import { reviewCase, type ReviewInput } from "../lib/pipeline/review.ts";
import type { LlmClient } from "../lib/pipeline/run-case.ts";
import type { RunCaseOptions } from "../lib/pipeline/run-case.ts";
import type { FollowUpDraft, FollowUpInterpretation } from "../lib/llm/types.ts";

function withTempStore<T>(fn: (dataDir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "railops-pipe-"));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      resetState();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
      }
    });
}

const REPO_KNOWLEDGE_INDEX = resolve("./knowledge/index.json");

function makeEmail(): EmailDraft {
  return {
    subject: "Delay refund request",
    body: "My train was delayed by 45 minutes. Please refund.",
    mentionedFacts: ["record:ticket:TKT-000001"],
  };
}

function makeClaims(overrides: Partial<ExtractedClaims> = {}): ExtractedClaims {
  return {
    requestedAction: "refund",
    claims: [{ kind: "delay_minutes", description: "Claimed 45 minute delay", value: 45 }],
    missingFields: [],
    referencedTicketNumbers: ["TKT-000001"],
    referencedStations: ["Warszawa Centralna", "Krakow Glowny"],
    ...overrides,
  };
}

function makeDecision(overrides: Partial<DecisionDraft> = {}): DecisionDraft {
  const basis: DecisionBasis[] = overrides.decisionBasis ?? [
    { claim: "delay 45 minutes", evidenceRef: "rule:1.0.0:delay_30", note: "delay exceeds 30 min threshold" },
  ];
  return {
    outcome: "refund",
    proposedAmount: 50,
    decisionBasis: basis,
    response: "Refund approved at 50% of paid price.",
    evidenceRefs: ["rule:1.0.0:delay_30", "record:ticket:TKT-000001"],
    ...overrides,
  };
}

function makeCritique(overrides: Partial<CritiqueReport> = {}): CritiqueReport {
  return {
    passed: true,
    findings: [],
    correctedDraft: null,
    ...overrides,
  };
}

type FakeLlm = {
  client: LlmClient;
  setEmail(fn: () => Promise<EmailDraft> | EmailDraft): void;
  setClaims(fn: () => Promise<ExtractedClaims> | ExtractedClaims): void;
  setDraft(fn: () => Promise<DecisionDraft> | DecisionDraft): void;
  setCritique(fn: () => Promise<CritiqueReport> | CritiqueReport): void;
  setInterpret(fn: () => Promise<FollowUpInterpretation> | FollowUpInterpretation): void;
  setFollowUpDraft(fn: (input: { claimsJson: string }) => Promise<FollowUpDraft> | FollowUpDraft): void;
  setFollowUpDraftError(fn: () => Error): void;
  callCounts: { email: number; claims: number; draft: number; critique: number; interpret: number; followUp: number };
};

function makeFakeLlm(): FakeLlm {
  const callCounts = { email: 0, claims: 0, draft: 0, critique: 0, interpret: 0, followUp: 0 };
  let emailImpl = async (): Promise<EmailDraft> => makeEmail();
  let claimsImpl = async (): Promise<ExtractedClaims> => makeClaims();
  let draftImpl = async (): Promise<DecisionDraft> => makeDecision();
  let critiqueImpl = async (): Promise<CritiqueReport> => makeCritique();
  let interpretImpl = async (
    input: { claimsJson: string; messageText: string },
  ): Promise<FollowUpInterpretation> => {
    let parsedClaims: { missingFields?: string[] } = {};
    try {
      parsedClaims = JSON.parse(input.claimsJson);
    } catch {
      parsedClaims = {};
    }
    const missing = parsedClaims.missingFields ?? [];
    return {
      intent: "answer",
      answers: missing.map((field) => ({ field, value: input.messageText })),
    };
  };
  let followUpImpl = async (_input?: { claimsJson: string }): Promise<FollowUpDraft> => ({
    message: "Could you share the missing details?",
    requestedFields: [],
  });
  let followUpError: (() => Error) | null = null;
  const client: LlmClient = {
    generateCustomerEmail: async (_input, signal) => {
      callCounts.email += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return emailImpl();
    },
    extractCaseClaims: async (_input, signal) => {
      callCounts.claims += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return claimsImpl();
    },
    draftDecision: async (_input, signal) => {
      callCounts.draft += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return draftImpl();
    },
    critiqueDecision: async (_input, signal) => {
      callCounts.critique += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return critiqueImpl();
    },
    interpretFollowUp: async (input, signal) => {
      callCounts.interpret += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return interpretImpl({ claimsJson: input.claimsJson, messageText: input.messageText });
    },
    draftFollowUp: async (input, signal) => {
      callCounts.followUp += 1;
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      if (followUpError) throw followUpError();
      return followUpImpl(input);
    },
  };
  return {
    client,
    callCounts,
    setEmail: (fn) => {
      emailImpl = async () => fn();
    },
    setClaims: (fn) => {
      claimsImpl = async () => fn();
    },
    setDraft: (fn) => {
      draftImpl = async () => fn();
    },
    setCritique: (fn) => {
      critiqueImpl = async () => fn();
    },
    setInterpret: (fn) => {
      interpretImpl = async () => fn();
    },
    setFollowUpDraft: (fn) => {
      followUpError = null;
      followUpImpl = async (input) => (input ? fn(input) : fn({ claimsJson: "{}" }));
    },
    setFollowUpDraftError: (fn) => {
      followUpError = fn;
    },
  };
}

async function seedCase(
  dataDir: string,
  overrides: { topic?: "delay_refund" | "passenger_name_change"; truthMode?: "supported_by_records" | "fabricated_delay" | "insufficient_information" | "fraud_attempt"; seed?: number; supplements?: Record<string, string> } = {},
): Promise<StoredCase> {
  const topic = overrides.topic ?? "delay_refund";
  const truthMode = overrides.truthMode ?? "supported_by_records";
  const seed = overrides.seed ?? 7;
  const pkg = createDemoCase({ topic, truthMode, seed });
  const now = new Date().toISOString();
  const stored: StoredCase = {
    caseId: pkg.id,
    topic,
    truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    email: null,
    emailError: null,
    supplements: overrides.supplements ?? {},
    version: 1,
  };
  await updateState((s) => ({ ...s, cases: [...s.cases, stored] }), { dataDir });
  return stored;
}

async function collectEvents(caseId: string, opts: RunCaseOptions): Promise<{ events: Array<{ stage: string; status: string; sequence: number; summary: string; error: string | null }>; state: Awaited<ReturnType<typeof readState>> }> {
  const dataDir = opts.dataDir ?? ".railops/data";
  const events: Array<{ stage: string; status: string; sequence: number; summary: string; error: string | null }> = [];
  for await (const ev of runCase(caseId, { ...opts, dataDir })) {
    events.push({ stage: ev.stage, status: ev.status, sequence: ev.sequence, summary: ev.summary, error: ev.error });
  }
  const state = await readState({ dataDir });
  return { events, state };
}

test("pipeline: stage ordering and persisted events for a happy path", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.deepEqual(stages, [
      "reading_email:started",
      "reading_email:completed",
      "locating_account:started",
      "locating_account:completed",
      "extracting_claims:started",
      "extracting_claims:completed",
      "retrieving_knowledge:started",
      "retrieving_knowledge:completed",
      "checking_records:started",
      "checking_records:completed",
      "evaluating_rules:started",
      "evaluating_rules:completed",
      "drafting:started",
      "drafting:completed",
      "critiquing:started",
      "critiquing:completed",
      "reviewable:completed",
    ]);

    const persisted = state.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-1");
    assert.equal(persisted.length, events.length);
    for (let i = 0; i < events.length; i += 1) {
      assert.equal(persisted[i]!.stage, events[i]!.stage);
      assert.equal(persisted[i]!.status, events[i]!.status);
    }
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    assert.equal(finalCase?.version, 2);
    assert.ok(finalCase && finalCase.version > 0);
  });
});

test("pipeline: missing-information follow-up path short-circuits to reviewable without drafting", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir, { topic: "delay_refund", truthMode: "supported_by_records", seed: 7 });
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.equal(stages.includes("drafting:started"), false, "drafting must not run on missing info path");
    assert.equal(stages.includes("critiquing:started"), false, "critiquing must not run on missing info path");
    assert.ok(stages.includes("reviewable:completed"));
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
  });
});

test("pipeline: contradiction path escalates without drafting", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir, { topic: "passenger_name_change", truthMode: "fraud_attempt", seed: 7 });
    const fake = makeFakeLlm();
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.equal(stages.includes("drafting:started"), false, "drafting must not run on contradiction");
    assert.equal(stages.includes("critiquing:started"), false, "critiquing must not run on contradiction");
    assert.ok(stages.includes("reviewable:completed"));
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "escalated");
  });
});

test("pipeline: critic rejection then accept produces a revised draft and reviewable state", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    let critiqueCalls = 0;
    fake.setCritique(() => {
      critiqueCalls += 1;
      if (critiqueCalls === 1) {
        const finding: CriticFinding = {
          severity: "error",
          message: "amount mismatch",
          evidenceRef: null,
        };
        return makeCritique({ passed: false, findings: [finding] });
      }
      return makeCritique();
    });
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const draftStarts = events.filter((e) => e.stage === "drafting" && e.status === "started");
    assert.equal(draftStarts.length, 2, "expected two drafting cycles (initial + revision)");
    const critiqueStarts = events.filter((e) => e.stage === "critiquing" && e.status === "started");
    assert.equal(critiqueStarts.length, 2);
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    assert.equal(fake.callCounts.draft, 2, "expected 2 draft calls (initial + revised)");
    assert.equal(fake.callCounts.critique, 2);
    assert.ok(fake.callCounts.draft <= 6, "BAML draft calls must respect cap");
  });
});

test("pipeline: two critic rejections escalate the case and never loop", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setCritique(() =>
      makeCritique({
        passed: false,
        findings: [
          { severity: "error", message: "still wrong", evidenceRef: null },
        ],
      }),
    );
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const critiqueStarts = events.filter((e) => e.stage === "critiquing" && e.status === "started");
    assert.equal(critiqueStarts.length, 2, "exactly two critique cycles");
    const draftStarts = events.filter((e) => e.stage === "drafting" && e.status === "started");
    assert.equal(draftStarts.length, 2, "exactly two drafting cycles");
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "escalated");
    assert.ok(!events.some((e) => e.stage === "reviewable" && e.status === "failed"));
  });
});

test("pipeline: abort after first stage emits a single failed event with aborted error and stops", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    const controller = new AbortController();
    fake.setEmail(() => {
      controller.abort();
      return makeEmail();
    });
    const events: Array<{ stage: string; status: string; error: string | null }> = [];
    for await (const ev of runCase(stored.caseId, {
      dataDir,
      runId: "run-abort",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
      signal: controller.signal,
    })) {
      events.push({ stage: ev.stage, status: ev.status, error: ev.error });
    }
    const failedAborts = events.filter((e) => e.status === "failed" && e.error === "aborted");
    assert.ok(failedAborts.length >= 1, `expected at least one failed-aborted event (got ${failedAborts.length})`);
    assert.equal(events.some((e) => e.stage === "drafting"), false, "no drafting after abort");
    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "error");
  });
});

test("pipeline: BAML provider failure marks the case as error and surfaces failed event", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setDraft(() => {
      throw new Error("provider offline");
    });
    const events: Array<{ stage: string; status: string; error: string | null }> = [];
    for await (const ev of runCase(stored.caseId, {
      dataDir,
      runId: "run-fail",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    })) {
      events.push({ stage: ev.stage, status: ev.status, error: ev.error });
    }
    const failedDraft = events.find((e) => e.stage === "drafting" && e.status === "failed");
    assert.ok(failedDraft, "drafting must fail when BAML throws");
    assert.match(failedDraft?.error ?? "", /provider offline/);
    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "error");
  });
});

test("pipeline: rerun with the same runId yields no new events", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    const first = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const beforeState = await readState({ dataDir });
    const beforeCount = beforeState.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-1").length;
    const second = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const afterState = await readState({ dataDir });
    const afterCount = afterState.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-1").length;
    assert.equal(afterCount, beforeCount, "no new events on rerun with same runId");
    assert.equal(second.events.length, first.events.length, "rerun replays existing events");
  });
});

test("pipeline: rerun with a new runId appends a fresh event sequence", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-2",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const state = await readState({ dataDir });
    const run1 = state.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-1");
    const run2 = state.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-2");
    assert.ok(run1.length > 0);
    assert.ok(run2.length > 0);
    const run2Sequences = run2.map((e) => e.sequence);
    const sorted = [...run2Sequences].sort((a, b) => a - b);
    assert.deepEqual(run2Sequences, sorted, "run-2 sequences are strictly increasing");
    const maxRun1Seq = Math.max(...run1.map((e) => e.sequence));
    const minRun2Seq = Math.min(...run2Sequences);
    assert.ok(minRun2Seq > maxRun1Seq, "run-2 starts after the highest run-1 sequence");
  });
});

test("reviewCase: approve transitions the case to approved and stores an approve learning record", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const updated = await reviewCase(
      {
        caseId: stored.caseId,
        action: "approve",
        expectedVersion: 2,
      } as ReviewInput,
      { dataDir, memoryClient: null },
    );
    assert.equal(updated.state, "approved");
    assert.equal(updated.reviewHistory.length, 1);
    assert.equal(updated.reviewHistory[0]?.action, "approve");
    const state = await readState({ dataDir });
    assert.equal(state.learning.length, 1, "approval stores a learning record");
    assert.equal(state.learning[0]?.reviewerAction, "approve");
    assert.equal(state.learning[0]?.outcome, "refund");
  });
});

test("reviewCase: reject without feedback throws ReviewError", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    await assert.rejects(
      () =>
        reviewCase(
          {
            caseId: stored.caseId,
            action: "reject",
            expectedVersion: 2,
          } as ReviewInput,
          { dataDir },
        ),
      (err: unknown) => err instanceof ReviewError && err.code === "feedback_required",
    );
  });
});

test("reviewCase: reject with feedback stores a learning record locally", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const updated = await reviewCase(
      {
        caseId: stored.caseId,
        action: "reject",
        feedback: "amount should match policy",
        expectedVersion: 2,
      } as ReviewInput,
      { dataDir, memoryClient: null },
    );
    assert.equal(updated.state, "rejected");
    const state = await readState({ dataDir });
    assert.ok(state.learning.length >= 1, "rejection must store a learning record");
  });
});

test("reviewCase: edit transitions the case and increments revisionCount", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const editedDraft: DecisionDraft = makeDecision({ proposedAmount: 75 });
    const updated = await reviewCase(
      {
        caseId: stored.caseId,
        action: "edit",
        editedDraft,
        expectedVersion: 2,
      } as ReviewInput,
      { dataDir, memoryClient: null },
    );
    assert.equal(updated.state, "revising");
    const edits = updated.reviewHistory.filter((r) => r.action === "edit");
    assert.equal(edits.length, 1, "exactly one edit recorded");
  });
});

test("reviewCase: second edit throws MaxRevisionsReached", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const first = await reviewCase(
      {
        caseId: stored.caseId,
        action: "edit",
        editedDraft: makeDecision({ proposedAmount: 30 }),
        expectedVersion: 2,
      } as ReviewInput,
      { dataDir, memoryClient: null },
    );
    assert.equal(first.state, "revising");
    await assert.rejects(
      () =>
        reviewCase(
          {
            caseId: stored.caseId,
            action: "edit",
            editedDraft: makeDecision({ proposedAmount: 40 }),
            expectedVersion: first.version,
          } as ReviewInput,
          { dataDir, memoryClient: null },
        ),
      (err: unknown) => err instanceof MaxRevisionsReached,
    );
  });
});

test("pipeline: persisted state file is updated after every event", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    let count = 0;
    const seen: number[] = [];
    for await (const _ev of runCase(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    })) {
      count += 1;
      const raw = readFileSync(join(dataDir, "state.json"), "utf8");
      const parsed = JSON.parse(raw) as { events: Array<{ caseId: string; runId: string }> };
      const matching = parsed.events.filter((e) => e.caseId === stored.caseId && e.runId === "run-1");
      seen.push(matching.length);
    }
    assert.equal(count, seen.length);
    for (let i = 0; i < seen.length; i += 1) {
      assert.ok(seen[i]! >= i + 1, `event ${i} persisted before yield (saw ${seen[i]!})`);
    }
  });
});

test("pipeline: retrieving_knowledge completes strictly before checking_records starts", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    const { events } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const extractDoneIndex = events.findIndex((e) => e.stage === "extracting_claims" && e.status === "completed");
    const rkStartIndex = events.findIndex((e) => e.stage === "retrieving_knowledge" && e.status === "started");
    const rkDoneIndex = events.findIndex((e) => e.stage === "retrieving_knowledge" && e.status === "completed");
    const crStartIndex = events.findIndex((e) => e.stage === "checking_records" && e.status === "started");
    const crDoneIndex = events.findIndex((e) => e.stage === "checking_records" && e.status === "completed");
    assert.ok(extractDoneIndex >= 0);
    assert.ok(rkStartIndex > extractDoneIndex);
    assert.ok(rkDoneIndex > rkStartIndex);
    assert.ok(crStartIndex > rkDoneIndex, "checking_records must start after retrieving_knowledge completed");
    assert.ok(crDoneIndex > crStartIndex);
    const rkDone = events[rkDoneIndex]!;
    const crStart = events[crStartIndex]!;
    assert.ok(rkDone.sequence < crStart.sequence, "no parallel overlap between knowledge and records stages");
  });
});

test("pipeline: supplements pre-set on the case remove matching missingFields", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir, {
      supplements: { claimed_delay_minutes: "45" },
    });
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    const { events, state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    assert.equal(
      events.some((e) => e.stage === "drafting" && e.status === "started"),
      true,
      "supplemented claims must not short-circuit to follow-up",
    );
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    const reviewable = state.events.find(
      (e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.status === "completed",
    );
    const payload = reviewable?.payload as {
      outcome?: string;
      claims?: { missingFields?: string[]; claims?: Array<{ kind: string; value: number | null }> };
    };
    assert.equal(payload.outcome, "reviewable");
    assert.deepEqual(payload.claims?.missingFields, []);
    const supplemented = payload.claims?.claims?.find((c) => c.kind === "claimed_delay_minutes");
    assert.ok(supplemented, "supplement merged into claims");
    assert.equal(supplemented?.value, 45);
  });
});

test("pipeline: resumeCase continues a follow-up case from evaluating_rules to reviewable", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    const first = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const followUp = first.state.events.find(
      (e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.status === "completed",
    );
    assert.equal((followUp?.payload as { outcome?: string })?.outcome, "follow_up");
    const beforeCase = first.state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(beforeCase?.state, "reviewable");

    const events: Array<{ stage: string; status: string; sequence: number }> = [];
    for await (const ev of resumeCase(stored.caseId, { claimed_delay_minutes: "45" }, {
      dataDir,
      runId: "run-resume",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    })) {
      events.push({ stage: ev.stage, status: ev.status, sequence: ev.sequence });
    }
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.equal(stages[0], "evaluating_rules:started", "resume starts at evaluating_rules");
    assert.equal(stages.includes("reading_email:started"), false, "resume skips email stage");
    assert.equal(stages.includes("locating_account:started"), false, "resume skips locate stage");
    assert.equal(stages.includes("extracting_claims:started"), false, "resume skips claims stage");
    assert.equal(stages.includes("retrieving_knowledge:started"), false, "resume skips knowledge stage");
    assert.equal(stages.includes("checking_records:started"), false, "resume skips records stage");
    assert.equal(stages[stages.length - 1], "reviewable:completed");
    assert.ok(stages.includes("drafting:completed"), "resume drafts a decision");

    const maxPriorSeq = Math.max(
      ...first.state.events.filter((e) => e.caseId === stored.caseId).map((e) => e.sequence),
    );
    assert.ok(
      events.every((e) => e.sequence > maxPriorSeq),
      "resume sequences continue after the prior run",
    );

    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "45" });
    const reviewable = state.events
      .filter((e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.runId === "run-resume")
      .at(-1);
    const payload = reviewable?.payload as { outcome?: string; draft?: unknown };
    assert.equal(payload.outcome, "reviewable");
    assert.ok(payload.draft !== null && payload.draft !== undefined, "resume ends with a draft");
  });
});

test("pipeline: resumeCase with answers covering all missing fields drafts a decision for an insufficient_information case", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir, { truthMode: "insufficient_information" });
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    const first = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const followUp = first.state.events.find(
      (e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.status === "completed",
    );
    assert.equal((followUp?.payload as { outcome?: string })?.outcome, "follow_up");
    const beforeCase = first.state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(beforeCase?.state, "reviewable");

    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of resumeCase(stored.caseId, { claimed_delay_minutes: "45" }, {
      dataDir,
      runId: "run-resume",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    })) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.equal(stages[0], "evaluating_rules:started", "resume starts at evaluating_rules");
    assert.ok(stages.includes("drafting:completed"), "answering all missing fields must draft a decision");
    assert.equal(stages[stages.length - 1], "reviewable:completed");

    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    const reviewable = state.events
      .filter((e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.runId === "run-resume")
      .at(-1);
    const payload = reviewable?.payload as { outcome?: string; draft?: unknown };
    assert.equal(payload.outcome, "reviewable");
    assert.ok(payload.draft !== null && payload.draft !== undefined, "resume ends with a draft");
  });
});

test("pipeline: resumeCase on a non-follow-up case throws PipelineError invalid_state", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    await assert.rejects(
      async () => {
        for await (const _ev of resumeCase(stored.caseId, { claimed_delay_minutes: "45" }, {
          dataDir,
          runId: "run-resume",
          indexPath: REPO_KNOWLEDGE_INDEX,
          llm: fake.client,
        })) {
          void _ev;
        }
      },
      (err: unknown) => err instanceof PipelineError && err.code === "invalid_state",
    );
  });
});

test("pipeline: initial follow-up emits an AI message, draft conversation, and follow_up outcome", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    fake.setFollowUpDraft(() => ({
      message: "Could you share the delay minutes?",
      requestedFields: ["claimed_delay_minutes"],
    }));
    const { state } = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const followUpCompleted = state.events
      .filter((e) => e.caseId === stored.caseId && e.stage === "follow_up" && e.status === "completed")
      .at(-1);
    assert.ok(followUpCompleted, "follow_up:completed must be emitted");
    const followUpPayload = followUpCompleted?.payload as {
      followUp?: { message?: string; requestedFields?: string[] };
      conversation?: Array<{ role: string; content: string }>;
    };
    assert.equal(followUpPayload.followUp?.message, "Could you share the delay minutes?");
    assert.deepEqual(followUpPayload.followUp?.requestedFields, ["claimed_delay_minutes"]);
    const reviewable = state.events
      .filter((e) => e.caseId === stored.caseId && e.stage === "reviewable" && e.status === "completed")
      .at(-1);
    const rPayload = reviewable?.payload as {
      outcome?: string;
      followUp?: { message?: string; requestedFields?: string[] };
      conversation?: Array<{ role: string; content: string }>;
    };
    assert.equal(rPayload.outcome, "follow_up");
    assert.equal(rPayload.followUp?.message, "Could you share the delay minutes?");
    assert.deepEqual(rPayload.followUp?.requestedFields, ["claimed_delay_minutes"]);
    assert.equal(rPayload.conversation?.[0]?.role, "agent");
    assert.equal(rPayload.conversation?.[0]?.content, "Could you share the delay minutes?");
  });
});

test("pipeline: resume with a direct free-form answer resolves a follow-up case without a structured form", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    const first = await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    assert.equal(first.state.cases.find((c) => c.caseId === stored.caseId)?.state, "reviewable");

    fake.setInterpret(() => ({
      intent: "answer",
      answers: [{ field: "claimed_delay_minutes", value: "45" }],
    }));

    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of resumeCase(
      stored.caseId,
      { message: "It was 45 minutes late" },
      {
        dataDir,
        runId: "run-resume",
        indexPath: REPO_KNOWLEDGE_INDEX,
        llm: fake.client,
      },
    )) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.ok(stages.includes("drafting:completed"), "free-form answer must draft a decision");
    assert.equal(stages[stages.length - 1], "reviewable:completed");
    assert.equal(stages[0], "evaluating_rules:started");

    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "reviewable");
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "45" });
    assert.equal(fake.callCounts.interpret, 1);
  });
});

test("pipeline: resume with a reviewer question produces no supplements and asks the next missing field", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });

    fake.setInterpret(() => ({ intent: "question", answers: [] }));
    fake.setFollowUpDraft(() => ({
      message: "Could you share the delay minutes?",
      requestedFields: ["claimed_delay_minutes"],
    }));

    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of resumeCase(
      stored.caseId,
      { message: "Which rule applies here?" },
      {
        dataDir,
        runId: "run-resume",
        indexPath: REPO_KNOWLEDGE_INDEX,
        llm: fake.client,
      },
    )) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const stages = events.map((e) => `${e.stage}:${e.status}`);
    assert.ok(stages.includes("follow_up:completed"), "question intent produces a follow-up");
    assert.ok(stages.includes("reviewable:completed"));
    const state = await readState({ dataDir });
    const lastReviewable = state.events
      .filter(
        (e) =>
          e.caseId === stored.caseId &&
          e.runId === "run-resume" &&
          e.stage === "reviewable" &&
          e.status === "completed",
      )
      .at(-1);
    const payload = lastReviewable?.payload as { outcome?: string; followUp?: { message?: string } };
    assert.equal(payload.outcome, "follow_up");
    assert.equal(payload.followUp?.message, "Could you share the delay minutes?");

    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.deepEqual(finalCase?.supplements, {});
    assert.equal(finalCase?.state, "reviewable");
  });
});

test("pipeline: resume ignores answer candidates whose field is not in current missing fields", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });

    fake.setInterpret(() => ({
      intent: "answer",
      answers: [
        { field: "not_a_real_field", value: "ignored" },
        { field: "claimed_delay_minutes", value: "30" },
      ],
    }));

    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of resumeCase(
      stored.caseId,
      { message: "It was 30 minutes" },
      {
        dataDir,
        runId: "run-resume",
        indexPath: REPO_KNOWLEDGE_INDEX,
        llm: fake.client,
      },
    )) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "30" });
  });
});

test("pipeline: a second follow-up reuses prior conversation and does not repeat answered fields", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() =>
      makeClaims({ missingFields: ["claimed_delay_minutes", "ticket_number"] }),
    );
    fake.setFollowUpDraft(
      ({ claimsJson }) => {
        let parsedClaims: { missingFields?: string[] } = {};
        try {
          parsedClaims = JSON.parse(claimsJson);
        } catch {
          parsedClaims = {};
        }
        const missing = parsedClaims.missingFields ?? [];
        return {
          message: `Please share ${missing.join(", ") || "the missing details"}.`,
          requestedFields: missing.slice(0, 3),
        };
      },
    );
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });

    fake.setInterpret(() => ({
      intent: "answer",
      answers: [{ field: "claimed_delay_minutes", value: "45" }],
    }));
    const resume1Events: TraceEvent[] = [];
    for await (const ev of resumeCase(
      stored.caseId,
      { message: "It was 45 minutes" },
      {
        dataDir,
        runId: "run-resume-1",
        indexPath: REPO_KNOWLEDGE_INDEX,
        llm: fake.client,
      },
    )) {
      resume1Events.push(ev);
    }
    const followUp1 = resume1Events.find(
      (e) => e.stage === "follow_up" && e.status === "completed",
    );
    const payload1 = followUp1?.payload as {
      followUp?: { requestedFields?: string[] };
      conversation?: Array<{ role: string; content: string }>;
    };
    assert.deepEqual(payload1.followUp?.requestedFields, ["ticket_number"]);
    assert.ok(
      payload1.conversation?.some((t) => t.role === "user" && t.content === "It was 45 minutes"),
    );
  });
});

test("pipeline: a third follow-up round sends the latest conversation without duplicate turns", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() =>
      makeClaims({ missingFields: ["claimed_delay_minutes", "ticket_number"] }),
    );
    const followUpConversations: Array<Array<{ role: string; content: string }>> = [];
    let draftRound = 0;
    fake.setFollowUpDraft((input) => {
      draftRound += 1;
      const conversationJson = (input as { conversationJson?: string }).conversationJson ?? "[]";
      followUpConversations.push(
        JSON.parse(conversationJson) as Array<{ role: string; content: string }>,
      );
      return {
        message: `Draft turn ${draftRound}`,
        requestedFields: [],
      };
    });
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });

    fake.setInterpret(() => ({ intent: "question", answers: [] }));
    const roundStages: string[][] = [];
    for (const [index, runId] of ["run-resume-1", "run-resume-2"].entries()) {
      const stages: string[] = [];
      for await (const ev of resumeCase(
        stored.caseId,
        { message: `User turn ${index + 1}` },
        {
          dataDir,
          runId,
          indexPath: REPO_KNOWLEDGE_INDEX,
          llm: fake.client,
        },
      )) {
        stages.push(`${ev.stage}:${ev.status}`);
      }
      roundStages.push(stages);
    }
    assert.ok(roundStages.every((stages) => stages.includes("reviewable:completed")));
    assert.equal(draftRound, 3);
    const contents = followUpConversations[2].map((t) => t.content);
    assert.equal(
      new Set(contents).size,
      contents.length,
      "round-3 draft context must not contain duplicate turns",
    );
    assert.deepEqual(contents, ["Draft turn 1", "User turn 1", "Draft turn 2", "User turn 2"]);
  });
});

test("pipeline: resume with legacy { answers } body still applies supplements", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    await collectEvents(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    });
    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of resumeCase(
      stored.caseId,
      { claimed_delay_minutes: "45" },
      {
        dataDir,
        runId: "run-resume",
        indexPath: REPO_KNOWLEDGE_INDEX,
        llm: fake.client,
      },
    )) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "45" });
  });
});

test("pipeline: failed follow-up call does not mutate supplements or mark case resolved", async () => {
  await withTempStore(async (dataDir) => {
    const stored = await seedCase(dataDir);
    const fake = makeFakeLlm();
    fake.setClaims(() => makeClaims({ missingFields: ["claimed_delay_minutes"] }));
    fake.setFollowUpDraftError(() => new Error("provider offline"));
    const events: Array<{ stage: string; status: string }> = [];
    for await (const ev of runCase(stored.caseId, {
      dataDir,
      runId: "run-1",
      indexPath: REPO_KNOWLEDGE_INDEX,
      llm: fake.client,
    })) {
      events.push({ stage: ev.stage, status: ev.status });
    }
    const state = await readState({ dataDir });
    const finalCase = state.cases.find((c) => c.caseId === stored.caseId);
    assert.equal(finalCase?.state, "error");
    assert.deepEqual(finalCase?.supplements, {});
    const failed = events.find((e) => e.stage === "follow_up" && e.status === "failed");
    assert.ok(failed, "follow_up must emit a failed event");
  });
});
