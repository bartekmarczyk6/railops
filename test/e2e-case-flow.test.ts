import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createDemoCase } from "../lib/domain/case-factory.ts";
import type { DemoCasePackage } from "../lib/domain/types.ts";
import { readState, resetState, updateState } from "../lib/storage/store.ts";
import type { StoredCase } from "../lib/storage/types.ts";
import { runCase, MaxRevisionsReached, type LlmClient } from "../lib/pipeline/run-case.ts";
import { reviewCase } from "../lib/pipeline/review.ts";
import { buildMockLlmForPkg } from "../lib/evals/run.ts";
import type { DraftDecisionInput } from "../lib/llm/baml.ts";
import type { DecisionDraft } from "../lib/llm/types.ts";
import {
  RAILOPS_BANK_ID,
  type BankProfileLike,
  type CreateMentalModelResponseLike,
  type HindsightLike,
  type MentalModelListLike,
  type RecallResponseLike,
  type RetainResponseLike,
} from "../lib/memory/hindsight.ts";
import { computeDashboardData } from "../app/dashboard-data.ts";

const REPO_KNOWLEDGE_INDEX = resolve("./knowledge/index.json");

type MemoryRow = {
  id: string;
  text: string;
  tags: string[];
  documentId: string;
};

class FakeHindsightClient implements HindsightLike {
  memories: MemoryRow[] = [];
  retainCalls: { bankId: string; content: string }[] = [];
  recallCalls: { bankId: string; query: string }[] = [];
  deleteCalls: { bankId: string; documentId: string }[] = [];
  private nextId = 1;

  async recall(bankId: string, query: string, options?: Record<string, unknown>): Promise<RecallResponseLike> {
    this.recallCalls.push({ bankId, query });
    const tags = Array.isArray(options?.tags) ? (options!.tags as string[]) : [];
    const strict = typeof options?.tagsMatch === "string" && (options!.tagsMatch as string).endsWith("_strict");
    const results = this.memories
      .filter((m) => {
        if (tags.length === 0) return true;
        return strict ? tags.every((t) => m.tags.includes(t)) : tags.some((t) => m.tags.includes(t));
      })
      .map((m) => ({
        id: m.id,
        text: m.text,
        type: "observation" as const,
        context: null,
        metadata: null,
        tags: m.tags,
        document_id: m.documentId,
      }));
    return { results };
  }

  async retain(bankId: string, content: string, options?: Record<string, unknown>): Promise<RetainResponseLike> {
    this.retainCalls.push({ bankId, content });
    const id = `mem-${this.nextId++}`;
    const documentId = typeof options?.documentId === "string" ? options.documentId : `doc-${id}`;
    const tags = Array.isArray(options?.tags) ? (options!.tags as string[]).map(String) : [];
    this.memories.push({ id, text: content, tags, documentId });
    return { success: true, bank_id: bankId, items_count: 1, async: false };
  }

  async deleteDocument(bankId: string, documentId: string): Promise<void> {
    this.deleteCalls.push({ bankId, documentId });
    const memory = this.memories.find((m) => m.documentId === documentId);
    if (memory) {
      this.memories = this.memories.filter((m) => m.id !== memory.id);
    }
  }

  async listMentalModels(): Promise<MentalModelListLike> {
    return { mental_models: [] };
  }

  async createBank(bankId: string): Promise<BankProfileLike> {
    return { bank_id: bankId };
  }

  async createMentalModel(_bankId: string, name: string): Promise<CreateMentalModelResponseLike> {
    return { id: `mm-${name}`, name };
  }

  async getBankProfile(bankId: string): Promise<BankProfileLike> {
    return { bank_id: bankId };
  }
}

function withTempStore<T>(fn: (dataDir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "railops-e2e-"));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      resetState();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        return;
      }
    });
}

async function seedCase(dataDir: string, pkg: DemoCasePackage): Promise<StoredCase> {
  const now = new Date().toISOString();
  const stored: StoredCase = {
    caseId: pkg.id,
    topic: pkg.topic,
    truthMode: pkg.truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed: pkg.seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    version: 1,
  };
  await updateState((s) => ({ ...s, cases: [...s.cases, stored] }), { dataDir });
  return stored;
}

async function runPipeline(
  caseId: string,
  dataDir: string,
  llm: LlmClient,
  memoryClient: HindsightLike,
  runId: string,
): Promise<void> {
  for await (const _ev of runCase(caseId, {
    dataDir,
    runId,
    indexPath: REPO_KNOWLEDGE_INDEX,
    llm,
    memoryClient,
  })) {
    void _ev;
  }
}

test("e2e: create, run, inspect, reject, revise once, retain learning and recompute stats", async () => {
  await withTempStore(async (dataDir) => {
    const hindsight = new FakeHindsightClient();

    const pkgA = createDemoCase({ topic: "delay_refund", truthMode: "supported_by_records", seed: 11 });
    const caseA = await seedCase(dataDir, pkgA);
    assert.equal(caseA.state, "created");

    const mockA = buildMockLlmForPkg(pkgA);
    await runPipeline(caseA.caseId, dataDir, mockA.client, hindsight, "run-a");

    const afterRun = await readState({ dataDir });
    const ranA = afterRun.cases.find((c) => c.caseId === caseA.caseId);
    assert.ok(ranA, "case A exists after the pipeline run");
    assert.equal(ranA?.state, "reviewable");
    assert.equal(ranA?.version, 2);

    assert.equal(ranA!.pkg.tickets.length, 1, "synthetic ticket present");
    assert.equal(ranA!.pkg.payments.length, 1, "synthetic payment present");
    const ticket = ranA!.pkg.tickets[0]!;
    assert.ok(
      ranA!.pkg.payments.some((p) => p.id === ticket.paymentId),
      "ticket payment id joins to a payment record",
    );
    assert.equal(ticket.routeId, ranA!.pkg.route.id, "ticket route id joins to the route record");
    assert.ok(ranA!.pkg.disruption !== null, "delay disruption present");

    const runAEvents = afterRun.events.filter((e) => e.caseId === caseA.caseId && e.runId === "run-a");
    assert.ok(runAEvents.length >= 10, "pipeline persisted its trace events");
    assert.ok(
      runAEvents.some((e) => e.stage === "evaluating_rules" && e.status === "completed"),
      "rules evaluation completed",
    );
    assert.ok(
      runAEvents.every((e) => e.status !== "failed"),
      "no stage failed on the happy path",
    );

    const rejected = await reviewCase(
      {
        caseId: caseA.caseId,
        action: "reject",
        feedback: "Amount must follow the recorded delay tier, not the claimed minutes.",
        expectedVersion: ranA!.version,
      },
      { dataDir, memoryClient: hindsight, reviewer: "e2e-reviewer" },
    );
    assert.equal(rejected.state, "rejected");
    assert.equal(rejected.reviewHistory.length, 1);
    assert.equal(rejected.reviewHistory[0]?.action, "reject");
    assert.ok(rejected.learningRef !== null, "learning retained with a memory id");
    assert.ok(
      rejected.trace.some((e) => e.stage === "learning_saved" && e.status === "completed"),
      "learning_saved event completed",
    );
    assert.equal(hindsight.retainCalls.length, 1, "retain called once on the fake Hindsight client");
    assert.equal(hindsight.retainCalls[0]?.bankId, RAILOPS_BANK_ID);
    assert.ok(
      hindsight.retainCalls[0]?.content.includes("Amount must follow the recorded delay tier"),
      "retained learning carries the reviewer feedback",
    );
    const stateAfterReject = await readState({ dataDir });
    assert.equal(stateAfterReject.learning.length, 1, "learning record stored locally");
    assert.equal(stateAfterReject.learning[0]?.id, rejected.learningRef);

    const statsAfterA = computeDashboardData(stateAfterReject.cases);
    assert.equal(statsAfterA.stats.total, 1);
    assert.equal(statsAfterA.stats.reviewed, 1);
    assert.equal(statsAfterA.stats.byState["rejected"], 1);

    const pkgB = createDemoCase({ topic: "delay_refund", truthMode: "supported_by_records", seed: 12 });
    const caseB = await seedCase(dataDir, pkgB);
    const mockB = buildMockLlmForPkg(pkgB);
    const draftInputs: DraftDecisionInput[] = [];
    const llmB: LlmClient = {
      ...mockB.client,
      draftDecision: async (input, signal) => {
        draftInputs.push(input);
        return mockB.client.draftDecision(input, signal);
      },
    };
    await runPipeline(caseB.caseId, dataDir, llmB, hindsight, "run-b");
    assert.ok(hindsight.recallCalls.length >= 1, "recall consulted before drafting case B");
    assert.equal(hindsight.recallCalls[0]?.bankId, RAILOPS_BANK_ID);
    assert.ok(draftInputs.length >= 1, "drafting ran for case B");
    assert.ok(
      draftInputs[0]!.memoryJson.includes("Amount must follow the recorded delay tier"),
      "recalled reviewer guidance reaches the draft prompt",
    );

    const afterRunB = await readState({ dataDir });
    const ranB = afterRunB.cases.find((c) => c.caseId === caseB.caseId);
    assert.equal(ranB?.state, "reviewable");
    const originalDraft = mockB.drafts[mockB.drafts.length - 1]!;
    const editedDraft: DecisionDraft = {
      ...originalDraft,
      proposedAmount: (originalDraft.proposedAmount ?? 0) + 10,
      response: `${originalDraft.response} Adjusted by the reviewer.`,
    };
    const edited = await reviewCase(
      {
        caseId: caseB.caseId,
        action: "edit",
        editedDraft,
        expectedVersion: ranB!.version,
      },
      { dataDir, memoryClient: hindsight, reviewer: "e2e-reviewer" },
    );
    assert.equal(edited.state, "revising", "one revision puts the case in revising");
    assert.equal(edited.reviewHistory.filter((r) => r.action === "edit").length, 1);

    await assert.rejects(
      () =>
        reviewCase(
          {
            caseId: caseB.caseId,
            action: "edit",
            editedDraft,
            expectedVersion: edited.version,
          },
          { dataDir, memoryClient: hindsight, reviewer: "e2e-reviewer" },
        ),
      (err: unknown) => err instanceof MaxRevisionsReached,
      "a second edit exceeds the one-revision limit",
    );

    const approved = await reviewCase(
      {
        caseId: caseB.caseId,
        action: "approve",
        expectedVersion: edited.version,
      },
      { dataDir, memoryClient: hindsight, reviewer: "e2e-reviewer" },
    );
    assert.equal(approved.state, "approved");
    assert.equal(
      hindsight.retainCalls.length,
      3,
      "reject, edit and approve each retain a learning record",
    );

    const finalState = await readState({ dataDir });
    assert.equal(finalState.learning.length, 3, "every review action stored a learning record");
    const stats = computeDashboardData(finalState.cases);
    assert.equal(stats.stats.total, 2);
    assert.equal(stats.stats.reviewed, 2);
    assert.equal(stats.stats.byState["rejected"], 1);
    assert.equal(stats.stats.byState["approved"], 1);
    assert.equal(stats.stats.byTopic["delay_refund"], 2);
    assert.equal(stats.alignment.length, 2, "alignment chart has one point per reviewed case");
    const outcomes = stats.outcomes.map((o) => o.outcome);
    assert.ok(outcomes.includes("denied"), "outcome distribution includes the rejection");
    assert.ok(outcomes.includes("refund"), "outcome distribution includes the approval");
  });
});
