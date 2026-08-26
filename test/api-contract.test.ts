import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RAILOPS_DATA_DIR = mkdtempSync(join(tmpdir(), "railops-api-"));
process.env.RAILOPS_FAKE_LLM = "1";

import { resetState, readState } from "../lib/storage/store.ts";
import { POST as createCase, GET as listCases } from "../app/api/cases/route.ts";
import { GET as getCaseById } from "../app/api/cases/[id]/route.ts";
import { POST as runCaseStream } from "../app/api/cases/[id]/run/route.ts";
import { POST as reviewCaseRoute } from "../app/api/cases/[id]/review/route.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";
import type { DecisionDraft } from "../lib/llm/types.ts";

const SECRET_PATTERNS = [
  /gsk_[A-Za-z0-9_-]{6,}/,
  /sk-[A-Za-z0-9]{6,}/,
  /PLK_API_KEY/,
  /GROQ_API_KEY/,
  /OPENROUTER_API_KEY/,
  /HINDSIGHT_API_KEY/,
  /HINDSIGHT_API_URL/,
];

function withFreshStore<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env.RAILOPS_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), "railops-api-"));
  process.env.RAILOPS_DATA_DIR = dir;
  resetState();
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      resetState();
      process.env.RAILOPS_DATA_DIR = prev;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });
}

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

function paramsPromise<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function makeDecision(): DecisionDraft {
  return {
    outcome: "information",
    proposedAmount: null,
    decisionBasis: [
      { claim: "test", evidenceRef: "record:ticket:TKT-000000", note: "ok" },
    ],
    response: "ok",
    evidenceRefs: ["record:ticket:TKT-000000"],
  };
}

function bodyContainsSecret(body: string): boolean {
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(body)) return true;
  }
  return false;
}

async function readSseStream(response: Response): Promise<TraceEvent[]> {
  assert.ok(response.body, "response must have a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: TraceEvent[] = [];
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx >= 0) {
      const chunk = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload.length > 0) {
            events.push(JSON.parse(payload) as TraceEvent);
          }
        }
      }
      sepIdx = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim().length > 0) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload.length > 0) {
          events.push(JSON.parse(payload) as TraceEvent);
        }
      }
    }
  }
  return events;
}

async function createCaseRequest(input: {
  topic?: string;
  truthMode?: string;
  [key: string]: unknown;
}): Promise<Response> {
  return createCase(
    makeJsonRequest("http://localhost/api/cases", input) as unknown as Parameters<typeof createCase>[0],
  );
}

async function getRequest(url: string): Promise<Response> {
  return getCaseById(
    makeGetRequest(url) as unknown as Parameters<typeof getCaseById>[0],
    { params: paramsPromise({ id: url.split("/").pop() ?? "" }) },
  );
}

async function runRequest(id: string): Promise<Response> {
  return runCaseStream(
    makeJsonRequest(`http://localhost/api/cases/${id}/run`, {}) as unknown as Parameters<typeof runCaseStream>[0],
    { params: paramsPromise({ id }) },
  );
}

async function reviewRequest(id: string, body: unknown): Promise<Response> {
  return reviewCaseRoute(
    makeJsonRequest(`http://localhost/api/cases/${id}/review`, body) as unknown as Parameters<typeof reviewCaseRoute>[0],
    { params: paramsPromise({ id }) },
  );
}

test("POST /api/cases with invalid topic returns 400", async () => {
  await withFreshStore(async () => {
    const res = await createCaseRequest({ topic: "not_a_real_topic", truthMode: "supported_by_records" });
    assert.equal(res.status, 400);
    const body = await res.text();
    assert.ok(!bodyContainsSecret(body), `body leaked secret: ${body}`);
  });
});

test("POST /api/cases with invalid truthMode returns 400", async () => {
  await withFreshStore(async () => {
    const res = await createCaseRequest({ topic: "delay_refund", truthMode: "made_up" });
    assert.equal(res.status, 400);
  });
});

test("POST /api/cases with valid topic+truthMode returns 200 and persists the case", async () => {
  await withFreshStore(async () => {
    const res = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { caseId: string };
    assert.equal(typeof body.caseId, "string");
    assert.ok(body.caseId.length > 0);
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const created = state.cases.find((c) => c.caseId === body.caseId);
    assert.ok(created, "case must be persisted in store");
    assert.equal(created?.topic, "delay_refund");
    assert.equal(created?.truthMode, "supported_by_records");
    assert.equal(created?.state, "created");
    assert.equal(created?.version, 1);
  });
});

test("GET /api/cases returns array of cases and stats", async () => {
  await withFreshStore(async () => {
    const a = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const b = await createCaseRequest({ topic: "ticket_change", truthMode: "supported_by_records" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const res = await listCases();
    assert.equal(res.status, 200);
    const body = (await res.json()) as { cases: StoredCase[]; stats: { total: number } };
    assert.ok(Array.isArray(body.cases));
    assert.equal(body.cases.length, 2);
    assert.ok(body.stats);
    assert.equal(body.stats.total, 2);
    const text = JSON.stringify(body);
    assert.ok(!bodyContainsSecret(text), "list response must not include any secret");
  });
});

test("GET /api/cases/:id for missing case returns 404", async () => {
  await withFreshStore(async () => {
    const res = await getRequest("http://localhost/api/cases/does-not-exist");
    assert.equal(res.status, 404);
  });
});

test("GET /api/cases/:id for existing case returns the full StoredCase", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await getRequest(`http://localhost/api/cases/${caseId}`);
    assert.equal(res.status, 200);
    const stored = (await res.json()) as StoredCase;
    assert.equal(stored.caseId, caseId);
    assert.equal(stored.topic, "delay_refund");
    assert.equal(stored.truthMode, "supported_by_records");
    assert.ok(stored.pkg);
    assert.ok(Array.isArray(stored.trace));
    assert.ok(Array.isArray(stored.reviewHistory));
    const text = JSON.stringify(stored);
    assert.ok(!bodyContainsSecret(text), "case response must not include any secret");
  });
});

test("POST /api/cases/:id/run returns text/event-stream content-type and stream closes when generator returns", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await runRequest(caseId);
    const contentType = res.headers.get("content-type") ?? "";
    assert.match(contentType, /text\/event-stream/);
    const events = await readSseStream(res);
    assert.ok(events.length > 0, "at least one event should be streamed");
    for (const ev of events) {
      assert.equal(typeof ev.stage, "string");
      assert.equal(typeof ev.status, "string");
      assert.equal(typeof ev.summary, "string");
      assert.equal(typeof ev.id, "string");
    }
    const text = JSON.stringify(events);
    assert.ok(!bodyContainsSecret(text), "streamed events must not include any secret");
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const stored = state.cases.find((c) => c.caseId === caseId);
    assert.ok(stored, "case must remain in store after run");
  });
});

test("POST /api/cases/:id/review with invalid action returns 400", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await reviewRequest(caseId, { action: "yolo", expectedVersion: 1 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/cases/:id/review with reject but no feedback returns 400", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await reviewRequest(caseId, { action: "reject", expectedVersion: 1 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/cases/:id/review with wrong expectedVersion returns 409", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await reviewRequest(caseId, {
      action: "approve",
      expectedVersion: 99,
    });
    assert.equal(res.status, 409);
  });
});

test("POST /api/cases/:id/review with edit but no editedDraft returns 400", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await reviewRequest(caseId, { action: "edit", expectedVersion: 1 });
    assert.equal(res.status, 400);
  });
});

test("POST /api/cases/:id/review approve happy path returns 200 and transitions to approved", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const stateBefore = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const storedBefore = stateBefore.cases.find((c) => c.caseId === caseId);
    assert.equal(storedBefore?.state, "created");
    const runRes = await runRequest(caseId);
    await readSseStream(runRes);
    const after = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const afterCase = after.cases.find((c) => c.caseId === caseId);
    assert.ok(afterCase, "case must exist after run");
    assert.equal(afterCase?.state, "reviewable", `expected reviewable, got ${afterCase?.state}`);
    const expectedVersion = afterCase!.version;
    const res = await reviewRequest(caseId, { action: "approve", expectedVersion });
    assert.equal(res.status, 200);
    const updated = (await res.json()) as StoredCase;
    assert.equal(updated.state, "approved");
    assert.equal(updated.reviewHistory.length, 1);
    assert.equal(updated.reviewHistory[0]?.action, "approve");
    const text = JSON.stringify(updated);
    assert.ok(!bodyContainsSecret(text), "review response must not include any secret");
  });
});

test("POST /api/cases/:id/review reject with feedback returns 200 and transitions to rejected", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const runRes = await runRequest(caseId);
    await readSseStream(runRes);
    const after = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const afterCase = after.cases.find((c) => c.caseId === caseId);
    const expectedVersion = afterCase!.version;
    const res = await reviewRequest(caseId, {
      action: "reject",
      feedback: "evidence insufficient",
      expectedVersion,
    });
    assert.equal(res.status, 200);
    const updated = (await res.json()) as StoredCase;
    assert.equal(updated.state, "rejected");
  });
});

test("POST /api/cases/:id/review edit with editedDraft returns 200 and transitions to revising", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const runRes = await runRequest(caseId);
    await readSseStream(runRes);
    const after = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const afterCase = after.cases.find((c) => c.caseId === caseId);
    const expectedVersion = afterCase!.version;
    const res = await reviewRequest(caseId, {
      action: "edit",
      editedDraft: makeDecision(),
      expectedVersion,
    });
    assert.equal(res.status, 200);
    const updated = (await res.json()) as StoredCase;
    assert.equal(updated.state, "revising");
  });
});

test("POST /api/cases/:id/review edit twice returns 409 (one-revision limit)", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const runRes = await runRequest(caseId);
    await readSseStream(runRes);
    const after = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const afterCase = after.cases.find((c) => c.caseId === caseId);
    const expectedVersion = afterCase!.version;
    const first = await reviewRequest(caseId, {
      action: "edit",
      editedDraft: makeDecision(),
      expectedVersion,
    });
    assert.equal(first.status, 200);
    const after1 = (await first.json()) as StoredCase;
    const second = await reviewRequest(caseId, {
      action: "edit",
      editedDraft: makeDecision(),
      expectedVersion: after1.version,
    });
    assert.equal(second.status, 409);
  });
});

test("POST /api/cases/:id/run on missing case returns 404", async () => {
  await withFreshStore(async () => {
    const res = await runRequest("nope");
    assert.equal(res.status, 404);
  });
});

test("POST /api/cases/:id/review on missing case returns 404", async () => {
  await withFreshStore(async () => {
    const res = await reviewRequest("nope", { action: "approve", expectedVersion: 1 });
    assert.equal(res.status, 404);
  });
});

test("GET /api/cases/:id response never contains a secret pattern", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await getRequest(`http://localhost/api/cases/${caseId}`);
    const text = await res.text();
    assert.ok(!bodyContainsSecret(text), `case response leaked secret: ${text.slice(0, 200)}`);
  });
});
