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
import { POST as rewriteRoute } from "../app/api/cases/[id]/rewrite/route.ts";
import { runCase as runCaseDirect, type LlmClient } from "../lib/pipeline/run-case.ts";
import type { StoredCase, TraceEvent } from "../lib/storage/types.ts";
import type { DecisionDraft } from "../lib/llm/types.ts";

const SECRET_PATTERNS = [
  /gsk_[A-Za-z0-9_-]{6,}/,
  /sk-[A-Za-z0-9]{6,}/,
  /PLK_API_KEY/,
  /GROQ_API_KEY/,
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

async function readSseStream(response: Response): Promise<{
  events: TraceEvent[];
  streamFrames: Array<{ type: "stream"; stage: string; partial: Record<string, unknown> }>;
}> {
  assert.ok(response.body, "response must have a body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: TraceEvent[] = [];
  const streamFrames: Array<{ type: "stream"; stage: string; partial: Record<string, unknown> }> = [];
  const pushPayload = (payload: string): void => {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.type === "stream") {
      streamFrames.push(parsed as unknown as (typeof streamFrames)[number]);
    } else {
      events.push(parsed as unknown as TraceEvent);
    }
  };
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
            pushPayload(payload);
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
          pushPayload(payload);
        }
      }
    }
  }
  return { events, streamFrames };
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

async function runRequestWithBody(id: string, body: unknown): Promise<Response> {
  return runCaseStream(
    makeJsonRequest(`http://localhost/api/cases/${id}/run`, body) as unknown as Parameters<typeof runCaseStream>[0],
    { params: paramsPromise({ id }) },
  );
}

async function runRequestWithRaw(id: string, body: string, contentType: string): Promise<Response> {
  return runCaseStream(
    new Request(`http://localhost/api/cases/${id}/run`, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    }) as unknown as Parameters<typeof runCaseStream>[0],
    { params: paramsPromise({ id }) },
  );
}

async function rewriteRequest(id: string, body: unknown): Promise<Response> {
  return rewriteRoute(
    makeJsonRequest(`http://localhost/api/cases/${id}/rewrite`, body) as unknown as Parameters<typeof rewriteRoute>[0],
    { params: paramsPromise({ id }) },
  );
}

async function waitForEmail(caseId: string, timeoutMs = 5000): Promise<StoredCase> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const stored = state.cases.find((c) => c.caseId === caseId);
    if (stored && stored.email !== null) return stored;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`email for case ${caseId} was not prepared within ${timeoutMs}ms`);
}

function makeFollowUpLlm(): LlmClient {
  return {
    generateCustomerEmail: async () => ({
      subject: "Delay refund request",
      body: "My train was delayed. Please refund.",
      mentionedFacts: ["fact:delay"],
    }),
    extractCaseClaims: async () => ({
      requestedAction: "refund",
      claims: [{ kind: "delay_minutes", description: "Claimed 45 minute delay", value: 45 }],
      missingFields: ["claimed_delay_minutes"],
      referencedTicketNumbers: [],
      referencedStations: [],
    }),
    draftDecision: async () => makeDecision(),
    critiqueDecision: async () => ({ passed: true, findings: [], correctedDraft: null }),
    interpretFollowUp: async ({ claimsJson, messageText }) => {
      let parsedClaims: { missingFields?: string[] } = {};
      try {
        parsedClaims = JSON.parse(claimsJson);
      } catch {
        parsedClaims = {};
      }
      const missing = parsedClaims.missingFields ?? [];
      return {
        intent: "answer",
        answers: missing.map((field) => ({ field, value: messageText })),
      };
    },
    draftFollowUp: async ({ claimsJson }) => {
      let parsedClaims: { missingFields?: string[] } = {};
      try {
        parsedClaims = JSON.parse(claimsJson);
      } catch {
        parsedClaims = {};
      }
      const missing = parsedClaims.missingFields ?? [];
      return {
        message: `Could you confirm the ${missing.join(", ") || "missing details"}?`,
        requestedFields: missing.slice(0, 3),
      };
    },
  };
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

test("POST /api/cases prepares the passenger email in the background", async () => {
  await withFreshStore(async () => {
    const res = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    assert.equal(res.status, 200);
    const { caseId } = (await res.json()) as { caseId: string };
    const withEmail = await waitForEmail(caseId);
    assert.ok(withEmail.email, "email must be persisted onto the case");
    assert.equal(withEmail.email?.from, withEmail.pkg.account.email);
    assert.equal(typeof withEmail.email?.subject, "string");
    assert.ok((withEmail.email?.subject ?? "").length > 0);
    assert.equal(typeof withEmail.email?.body, "string");
    assert.ok(Array.isArray(withEmail.email?.mentionedFacts));
    assert.equal(typeof withEmail.email?.receivedAt, "string");
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
    const { events, streamFrames } = await readSseStream(res);
    assert.ok(events.length > 0, "at least one event should be streamed");
    assert.equal(events[0]?.stage, "reading_email", "first streamed event must be reading_email");
    assert.ok(
      events.some((e) => e.stage === "locating_account"),
      "locating_account stage must appear in the stream",
    );
    for (const ev of events) {
      assert.equal(typeof ev.stage, "string");
      assert.equal(typeof ev.status, "string");
      assert.equal(typeof ev.summary, "string");
      assert.equal(typeof ev.id, "string");
    }
    assert.ok(streamFrames.length > 0, "at least one token stream frame should be streamed");
    for (const frame of streamFrames) {
      assert.equal(frame.type, "stream");
      assert.ok(
        frame.stage === "generating_email" || frame.stage === "drafting",
        `unexpected stream stage: ${frame.stage}`,
      );
      assert.ok(frame.partial && typeof frame.partial === "object");
    }
    const text = JSON.stringify({ events, streamFrames });
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

test("POST /api/cases/:id/run with answers resumes a follow-up case from evaluating_rules", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    for await (const _ev of runCaseDirect(caseId, {
      dataDir: process.env.RAILOPS_DATA_DIR!,
      runId: "run-followup",
      llm: makeFollowUpLlm(),
    })) {
      void _ev;
    }
    const afterRun = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const followUpCase = afterRun.cases.find((c) => c.caseId === caseId);
    assert.equal(followUpCase?.state, "reviewable");
    const followUpEvent = afterRun.events.find(
      (e) => e.caseId === caseId && e.stage === "reviewable" && e.status === "completed",
    );
    assert.equal(
      (followUpEvent?.payload as { outcome?: string })?.outcome,
      "follow_up",
      "initial run must end in follow_up",
    );

    const res = await runRequestWithBody(caseId, { answers: { claimed_delay_minutes: "45" } });
    assert.equal(res.status, 200);
    const { events } = await readSseStream(res);
    assert.ok(events.length > 0, "resume must stream events");
    assert.equal(events[0]?.stage, "evaluating_rules", "resume stream starts at evaluating_rules");
    assert.ok(
      events.some((e) => e.stage === "drafting" && e.status === "completed"),
      "resume must draft a decision",
    );
    const last = events[events.length - 1];
    assert.equal(last?.stage, "reviewable");
    assert.equal(last?.status, "completed");
    assert.equal(
      (last?.payload as { outcome?: string })?.outcome,
      "reviewable",
      "supplemented answers clear the follow-up",
    );
    const after = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const resumed = after.cases.find((c) => c.caseId === caseId);
    assert.equal(resumed?.state, "reviewable");
    assert.deepEqual(resumed?.supplements, { claimed_delay_minutes: "45" });
    const text = JSON.stringify(events);
    assert.ok(!bodyContainsSecret(text), "resume events must not include any secret");
  });
});

test("POST /api/cases/:id/run with empty answers object resumes a follow-up case", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    for await (const _ev of runCaseDirect(caseId, {
      dataDir: process.env.RAILOPS_DATA_DIR!,
      runId: "run-followup",
      llm: makeFollowUpLlm(),
    })) {
      void _ev;
    }
    const res = await runRequestWithBody(caseId, { answers: {} });
    assert.equal(res.status, 200);
    const { events } = await readSseStream(res);
    assert.ok(events.length > 0, "resume must stream events");
    assert.equal(events[0]?.stage, "evaluating_rules", "resume stream starts at evaluating_rules");
    const last = events[events.length - 1];
    assert.equal(last?.stage, "reviewable");
    assert.equal(last?.status, "completed");
    assert.equal(
      (last?.payload as { outcome?: string })?.outcome,
      "follow_up",
      "unanswered fields return the case to follow-up",
    );
  });
});

test("POST /api/cases/:id/run with invalid answers shape returns 400 invalid_input", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const notObject = await runRequestWithBody(caseId, { answers: "yes" });
    assert.equal(notObject.status, 400);
    const badValue = await runRequestWithBody(caseId, { answers: { field: 42 } });
    assert.equal(badValue.status, 400);
  });
});

test("POST /api/cases/:id/rewrite returns the rewritten selection", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await rewriteRequest(caseId, {
      selection: "the refund amount",
      instruction: "Shorten",
      response: "We reviewed your request and approved the refund amount.",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { rewritten?: string };
    assert.equal(typeof body.rewritten, "string");
    assert.ok(body.rewritten!.includes("Shorten"), "fake rewrite echoes the instruction");
    assert.ok(body.rewritten!.includes("the refund amount"), "fake rewrite echoes the selection");
    const text = JSON.stringify(body);
    assert.ok(!bodyContainsSecret(text), "rewrite response must not include any secret");
  });
});

test("POST /api/cases/:id/rewrite on missing case returns 404", async () => {
  await withFreshStore(async () => {
    const res = await rewriteRequest("nope", {
      selection: "x",
      instruction: "y",
      response: "z",
    });
    assert.equal(res.status, 404);
  });
});

test("POST /api/cases/:id/rewrite with missing fields returns 400 invalid_input", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const res = await rewriteRequest(caseId, { selection: "", instruction: "Shorten", response: "text" });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error?: string }).error, "invalid_input");
  });
});

test("POST /api/cases/:id/run with message serializes the free-form message into a resume", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    for await (const _ev of runCaseDirect(caseId, {
      dataDir: process.env.RAILOPS_DATA_DIR!,
      runId: "run-followup",
      llm: makeFollowUpLlm(),
    })) {
      void _ev;
    }
    const res = await runRequestWithBody(caseId, { message: "It was 45 minutes" });
    assert.equal(res.status, 200);
    const { events } = await readSseStream(res);
    assert.ok(events.length > 0, "message resume must stream events");
    assert.equal(events[0]?.stage, "evaluating_rules", "message resume stream starts at evaluating_rules");
    assert.ok(
      events.some((e) => e.stage === "drafting" && e.status === "completed"),
      "message resume must draft a decision when answered",
    );
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const finalCase = state.cases.find((c) => c.caseId === caseId);
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "It was 45 minutes" });
  });
});

test("POST /api/cases/:id/run still serializes answers as before when no message is supplied", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    for await (const _ev of runCaseDirect(caseId, {
      dataDir: process.env.RAILOPS_DATA_DIR!,
      runId: "run-followup",
      llm: makeFollowUpLlm(),
    })) {
      void _ev;
    }
    const res = await runRequestWithBody(caseId, { answers: { claimed_delay_minutes: "45" } });
    assert.equal(res.status, 200);
    await readSseStream(res);
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const finalCase = state.cases.find((c) => c.caseId === caseId);
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "45" });
  });
});

test("POST /api/cases/:id/run accepts both message and answers in the same body", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    for await (const _ev of runCaseDirect(caseId, {
      dataDir: process.env.RAILOPS_DATA_DIR!,
      runId: "run-followup",
      llm: makeFollowUpLlm(),
    })) {
      void _ev;
    }
    const res = await runRequestWithBody(caseId, {
      message: "It was 45 minutes",
      answers: { claimed_delay_minutes: "ignored" },
    });
    assert.equal(res.status, 200);
    await readSseStream(res);
    const state = await readState({ dataDir: process.env.RAILOPS_DATA_DIR! });
    const finalCase = state.cases.find((c) => c.caseId === caseId);
    assert.deepEqual(finalCase?.supplements, { claimed_delay_minutes: "It was 45 minutes" });
  });
});

test("POST /api/cases/:id/run rejects non-string message with 400 invalid_input", async () => {
  await withFreshStore(async () => {
    const created = await createCaseRequest({ topic: "delay_refund", truthMode: "supported_by_records" });
    const { caseId } = (await created.json()) as { caseId: string };
    const numberMessage = await runRequestWithRaw(
      caseId,
      JSON.stringify({ message: 42 }),
      "application/json",
    );
    assert.equal(numberMessage.status, 400);
    assert.equal(((await numberMessage.json()) as { error?: string }).error, "invalid_input");
    const arrayMessage = await runRequestWithRaw(
      caseId,
      JSON.stringify({ message: ["nope"] }),
      "application/json",
    );
    assert.equal(arrayMessage.status, 400);
  });
});
