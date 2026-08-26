import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RAILOPS_BANK_ID,
  recallReviewerContext,
  retainReviewerLearning,
  undoReviewerLearning,
  setMemoryTraceListener,
  setTombstoneStore,
  resetMemoryAdapter,
  type HindsightLike,
  type RecallResponseLike,
  type RetainResponseLike,
  type MentalModelListLike,
  type BankProfileLike,
  type CreateMentalModelResponseLike,
} from "../lib/memory/hindsight";
import {
  buildLearningContent,
  createTombstoneStore,
  sanitizeLearningText,
} from "../lib/memory/learning";
import type {
  LearningRecord,
  MemoryTraceEvent,
  CaseTopic,
} from "../lib/memory/types";

type MemoryRow = {
  id: string;
  text: string;
  tags: string[];
  metadata: Record<string, string>;
  documentId?: string;
};

class FakeHindsightClient implements HindsightLike {
  memories: MemoryRow[] = [];
  documents: Map<string, string> = new Map();
  mentalModels: Map<string, { id: string; name: string }> = new Map();
  nextMemoryNumber = 1;
  failRecall = false;
  failRetain = false;
  failDelete = false;
  failListModels = false;
  bankExists = true;
  retainCalls: { bankId: string; content: string; options: Record<string, unknown> | undefined }[] = [];
  recallCalls: { bankId: string; query: string; options: Record<string, unknown> | undefined }[] = [];
  deleteCalls: { bankId: string; documentId: string }[] = [];

  async recall(bankId: string, query: string, options?: Record<string, unknown>): Promise<RecallResponseLike> {
    this.recallCalls.push({ bankId, query, options });
    if (this.failRecall) throw new Error("simulated recall failure");
    const tags = Array.isArray(options?.tags) ? (options!.tags as string[]) : [];
    const matchMode = typeof options?.tagsMatch === "string" ? (options!.tagsMatch as string) : "any";
    const results = this.memories
      .filter((m) => {
        if (tags.length === 0) return true;
        if (matchMode.endsWith("_strict")) {
          return tags.every((t) => m.tags.includes(t));
        }
        return tags.some((t) => m.tags.includes(t));
      })
      .map((m) => ({
        id: m.id,
        text: m.text,
        type: "observation" as const,
        context: null,
        metadata: m.metadata,
        tags: m.tags,
        document_id: m.documentId ?? null,
      }));
    return { results };
  }

  async retain(bankId: string, content: string, options?: Record<string, unknown>): Promise<RetainResponseLike> {
    this.retainCalls.push({ bankId, content, options });
    if (this.failRetain) throw new Error("simulated retain failure");
    const id = `mem-${this.nextMemoryNumber++}`;
    const docId = typeof options?.documentId === "string" ? options.documentId : `doc-${id}`;
    const tags = Array.isArray(options?.tags) ? (options!.tags as string[]).map((v) => String(v)) : [];
    const metadata = isStringRecord(options?.metadata) ? options!.metadata : {};
    this.memories.push({ id, text: content, tags, metadata, documentId: docId });
    this.documents.set(docId, id);
    return { success: true, bank_id: bankId, items_count: 1, async: false };
  }

  async deleteDocument(bankId: string, documentId: string): Promise<void> {
    this.deleteCalls.push({ bankId, documentId });
    if (this.failDelete) throw new Error("simulated delete failure");
    const memoryId = this.documents.get(documentId);
    if (memoryId) {
      this.memories = this.memories.filter((m) => m.id !== memoryId);
      this.documents.delete(documentId);
    }
  }

  async listMentalModels(): Promise<MentalModelListLike> {
    if (this.failListModels) throw new Error("simulated list failure");
    return { mental_models: Array.from(this.mentalModels.values()) };
  }

  async createBank(bankId: string): Promise<BankProfileLike> {
    if (!this.bankExists) this.bankExists = true;
    return { bank_id: bankId };
  }

  async createMentalModel(
    _bankId: string,
    name: string,
    _sourceQuery: string,
    options?: Record<string, unknown>,
  ): Promise<CreateMentalModelResponseLike> {
    const id =
      typeof options?.id === "string" && options.id.length > 0
        ? options.id
        : `mm-${this.mentalModels.size + 1}`;
    this.mentalModels.set(id, { id, name });
    return { id, name };
  }

  async getBankProfile(bankId: string): Promise<BankProfileLike> {
    if (!this.bankExists) throw new Error("bank not found");
    return { bank_id: bankId };
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
}

function makeRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    topic: "delay_refund",
    outcome: "refund",
    reviewerAction: "approve",
    feedback: "Confirmed delay was real and within refund threshold.",
    originalDraftSummary: "Offered 50% refund based on ticket policy.",
    finalDraftSummary: "Approved full refund after reviewer confirmed delay exceeded threshold.",
    changedGuidance: ["Use the longer delay threshold when disruption is corroborated."],
    timestamp: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "railops-mem-"));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
}

function setStoreFor(dir: string): ReturnType<typeof createTombstoneStore> {
  const store = createTombstoneStore(join(dir, "tombstones.json"));
  setTombstoneStore(store);
  setMemoryTraceListener(null);
  return store;
}

function traceRecorder(): { events: MemoryTraceEvent[]; restore: () => void } {
  const events: MemoryTraceEvent[] = [];
  const previous = null;
  setMemoryTraceListener((event) => {
    events.push(event);
  });
  return {
    events,
    restore: () => setMemoryTraceListener(previous),
  };
}

test.beforeEach(() => {
  resetMemoryAdapter();
});

test("sanitizeLearningText strips synthetic account, ticket, and route identifiers", () => {
  const dirty =
    "Refund acct-acct-7890 ticket tkt-12345 was routed via route-route99 from pay-pay-abc to booking-booking-7.";
  const clean = sanitizeLearningText(dirty);
  assert.equal(clean.includes("acct-7890"), false);
  assert.equal(clean.includes("tkt-12345"), false);
  assert.equal(clean.includes("route-route99"), false);
  assert.equal(clean.includes("pay-pay-abc"), false);
  assert.equal(clean.includes("booking-booking-7"), false);
  assert.match(clean, /\[REDACTED-ID\]/);
});

test("buildLearningContent embeds topic, outcome, drafts, and guidance without raw identifiers", () => {
  const record = makeRecord({
    changedGuidance: ["Confirm route-route42 timing before quoting a refund."],
  });
  const content = buildLearningContent(record);
  assert.match(content, /Topic: delay_refund/);
  assert.match(content, /Outcome: refund/);
  assert.match(content, /Reviewer action: approve/);
  assert.match(content, /Final draft: Approved full refund/);
  assert.match(content, /Changed guidance:/);
  assert.equal(content.includes("route-route42"), false);
});

test("recallReviewerContext returns empty context with memory_unavailable trace when no client", async () => {
  const recorder = traceRecorder();
  try {
    const ctx = await recallReviewerContext({ topic: "delay_refund", query: "refund tone", client: null });
    assert.equal(ctx.source, "none");
    assert.deepEqual(ctx.reviewerGuidance, []);
    assert.equal(ctx.topic, "delay_refund");
    assert.equal(recorder.events.length, 1);
    assert.equal(recorder.events[0].stage, "recall");
    assert.equal(recorder.events[0].reason, "no_hindsight_endpoint");
  } finally {
    recorder.restore();
  }
});

test("recallReviewerContext caps results at the provided limit", async () => {
  const fake = new FakeHindsightClient();
  for (let i = 0; i < 8; i += 1) {
    await fake.retain(RAILOPS_BANK_ID, `guidance-${i}`, {
      documentId: `doc-${i}`,
      tags: ["reviewer_learning", "delay_refund"],
      metadata: {},
    });
  }
  const ctx = await recallReviewerContext({
    topic: "delay_refund",
    query: "tone",
    client: fake,
    limit: 3,
  });
  assert.equal(ctx.source, "hindsight");
  assert.equal(ctx.reviewerGuidance.length, 3);
});

test("recallReviewerContext filters out tombstoned memory IDs", async () => {
  await withTempDir(async (dir) => {
    const store = setStoreFor(dir);
    store.add("learning-deadbeef");
    setMemoryTraceListener(null);

    const fake = new FakeHindsightClient();
    await fake.retain(RAILOPS_BANK_ID, "keep this", {
      documentId: "doc-keep",
      tags: ["reviewer_learning", "delay_refund"],
      metadata: {},
    });
    await fake.retain(RAILOPS_BANK_ID, "tombstone this", {
      documentId: "learning-deadbeef",
      tags: ["reviewer_learning", "delay_refund"],
      metadata: {},
    });

    const ctx = await recallReviewerContext({
      topic: "delay_refund",
      query: "guidance",
      client: fake,
    });
    assert.equal(ctx.source, "hindsight");
    assert.equal(ctx.reviewerGuidance.length, 1);
    assert.match(ctx.reviewerGuidance[0], /keep this/);
  });
});

test("recallReviewerContext emits memory_unavailable when recall throws", async () => {
  const fake = new FakeHindsightClient();
  fake.failRecall = true;
  const recorder = traceRecorder();
  try {
    const ctx = await recallReviewerContext({ topic: "delay_refund", query: "x", client: fake });
    assert.equal(ctx.source, "none");
    assert.equal(recorder.events.length, 1);
    assert.equal(recorder.events[0].stage, "recall");
    assert.match(recorder.events[0].reason, /simulated recall failure/);
  } finally {
    recorder.restore();
  }
});

test("retainReviewerLearning returns null memoryId when no client is available", async () => {
  const result = await retainReviewerLearning({ record: makeRecord(), client: null });
  assert.equal(result.memoryId, null);
});

test("retainReviewerLearning builds a sanitized payload with topic/outcome tags and metadata", async () => {
  const fake = new FakeHindsightClient();
  const record = makeRecord({
    feedback: "Refund approved for acct-acct-1",
    originalDraftSummary: "Draft mentioned tkt-9",
    finalDraftSummary: "Final draft mentioned route-route7",
    changedGuidance: ["Strip ticket identifiers from drafts."],
    timestamp: "2026-08-26T13:30:00.000Z",
  });
  const result = await retainReviewerLearning({ record, client: fake });
  assert.ok(result.memoryId && result.memoryId.startsWith("learning-"));
  assert.equal(fake.retainCalls.length, 1);
  const call = fake.retainCalls[0];
  assert.equal(call.bankId, RAILOPS_BANK_ID);
  assert.equal(call.options?.documentId, result.memoryId);
  const tags = (call.options?.tags as string[]) ?? [];
  assert.ok(tags.includes("reviewer_learning"));
  assert.ok(tags.includes("delay_refund"));
  assert.ok(tags.includes("outcome:refund"));
  assert.ok(tags.includes("action:approve"));
  const metadata = call.options?.metadata as Record<string, string>;
  assert.equal(metadata.topic, "delay_refund");
  assert.equal(metadata.outcome, "refund");
  assert.equal(metadata.timestamp, "2026-08-26T13:30:00.000Z");
  assert.equal(call.content.includes("acct-acct-1"), false);
  assert.equal(call.content.includes("tkt-9"), false);
  assert.equal(call.content.includes("route-route7"), false);
});

test("retainReviewerLearning returns null memoryId when retain throws", async () => {
  const fake = new FakeHindsightClient();
  fake.failRetain = true;
  const result = await retainReviewerLearning({ record: makeRecord(), client: fake });
  assert.equal(result.memoryId, null);
});

test("undoReviewerLearning calls deleteDocument, removes the memory, and persists a tombstone", async () => {
  await withTempDir(async (dir) => {
    const store = setStoreFor(dir);
    setMemoryTraceListener(null);

    const fake = new FakeHindsightClient();
    const retain = await retainReviewerLearning({ record: makeRecord(), client: fake });
    assert.ok(retain.memoryId);

    await undoReviewerLearning({ memoryId: retain.memoryId as string, client: fake });

    assert.equal(fake.deleteCalls.length, 1);
    assert.equal(fake.deleteCalls[0].documentId, retain.memoryId);
    assert.equal(fake.memories.length, 0);

    const stored = JSON.parse(readFileSync(store.path, "utf8")) as { tombstones: string[] };
    assert.deepEqual(stored.tombstones, [retain.memoryId].sort());
  });
});

test("undoReviewerLearning surfaces failure as memory_unavailable without throwing", async () => {
  await withTempDir(async (dir) => {
    setStoreFor(dir);
    setMemoryTraceListener(null);
    const fake = new FakeHindsightClient();
    fake.failDelete = true;
    const recorder = traceRecorder();
    try {
      await assert.doesNotReject(() =>
        undoReviewerLearning({ memoryId: "learning-1234", client: fake }),
      );
      assert.equal(recorder.events.length, 1);
      assert.equal(recorder.events[0].stage, "undo");
      assert.match(recorder.events[0].reason, /simulated delete failure/);
    } finally {
      recorder.restore();
    }
  });
});

test("recallReviewerContext never treats memory as evidence: source field is the only signal", async () => {
  const fake = new FakeHindsightClient();
  await fake.retain(RAILOPS_BANK_ID, "evidence-looking text", {
    documentId: "doc-1",
    tags: ["reviewer_learning", "missing_refund"],
    metadata: { kind: "evidence" },
  });
  const ctx = await recallReviewerContext({
    topic: "missing_refund" as CaseTopic,
    query: "missing refund",
    client: fake,
  });
  assert.equal(ctx.source, "hindsight");
  assert.equal(ctx.reviewerGuidance[0], "evidence-looking text");
  assert.notEqual(ctx.source, "evidence");
});

test("init-memory script --dry-run makes no network calls and exits 0", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    "npx",
    ["--no-install", "tsx", "scripts/init-memory.ts", "--dry-run"],
    {
      cwd: process.cwd(),
      env: { ...process.env, HINDSIGHT_API_URL: "" },
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  assert.equal(result.status, 0, `dry-run exited non-zero: ${result.stderr}`);
  assert.match(result.stdout, /\[dry-run\] bank id: railops/);
  assert.match(result.stdout, /mental model "railops-tone"/);
  assert.match(result.stdout, /mental model "railops-escalation"/);
  assert.doesNotMatch(result.stdout, /\[apply\]/);
});

test("local tombstone store round-trips additions and removals", async () => {
  await withTempDir(async (dir) => {
    const store = createTombstoneStore(join(dir, "t.json"));
    assert.equal(store.load().size, 0);
    store.add("learning-a");
    store.add("learning-b");
    assert.deepEqual(Array.from(store.load()).sort(), ["learning-a", "learning-b"]);
    store.remove("learning-a");
    assert.deepEqual(Array.from(store.load()).sort(), ["learning-b"]);
    store.remove("learning-b");
    assert.equal(store.load().size, 0);
    const persisted = readFileSync(store.path, "utf8");
    assert.match(persisted, /\[\]/);
  });
});

test("tombstone store survives a corrupt file by returning an empty set", async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not-json");
    const store = createTombstoneStore(path);
    assert.equal(store.load().size, 0);
  });
});
