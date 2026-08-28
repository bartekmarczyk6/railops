import test, { after } from "node:test";
import assert from "node:assert/strict";

import {
  middleware,
  config,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  resetRateLimitBuckets,
} from "../middleware.ts";

function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { method: "POST", headers });
}

after(() => resetRateLimitBuckets());

test("config declares the three LLM routes", () => {
  const source = JSON.stringify(config.matcher);
  assert.ok(source.includes("/api/cases/email"));
  assert.ok(source.includes("/api/cases/:path*/run"));
  assert.ok(source.includes("/api/cases/:path*/rewrite"));
});

test("allows requests under the limit and blocks at the limit with a JSON 429", async () => {
  resetRateLimitBuckets();
  const req = () => makeRequest("/api/cases/email");
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    const res = middleware(req());
    assert.notEqual(res?.status, 429, `request ${i + 1} should pass`);
  }
  const blocked = middleware(req());
  assert.equal(blocked?.status, 429);
  assert.ok(blocked instanceof Response);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  const body = await blocked.json();
  assert.equal(body.error, "rate_limited");
  assert.equal(typeof body.message, "string");
});

test("one shared bucket per IP across all three routes", () => {
  resetRateLimitBuckets();
  const paths = ["/api/cases/email", "/api/cases/x/run", "/api/cases/x/rewrite"];
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    const res = middleware(makeRequest(paths[i % 3]));
    assert.notEqual(res?.status, 429, `request ${i + 1} should pass`);
  }
  for (const path of paths) {
    assert.equal(middleware(makeRequest(path))?.status, 429, `${path} should be blocked`);
  }
});

test("limits /api/cases/:id/run but never /api/cases/run", () => {
  resetRateLimitBuckets();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) middleware(makeRequest("/api/cases/x/run"));
  assert.equal(middleware(makeRequest("/api/cases/x/run"))?.status, 429);
  for (let i = 0; i < RATE_LIMIT_MAX + 5; i++) {
    assert.notEqual(middleware(makeRequest("/api/cases/run"))?.status, 429);
  }
});

test("non-matching paths are not rate-limited", () => {
  resetRateLimitBuckets();
  for (let i = 0; i < RATE_LIMIT_MAX + 5; i++) {
    const res = middleware(makeRequest("/"));
    assert.notEqual(res?.status, 429);
  }
});

test("separate IPs get separate buckets", () => {
  resetRateLimitBuckets();
  const req = (ip: string) => makeRequest("/api/cases/email", { "x-forwarded-for": ip });
  for (let i = 0; i < RATE_LIMIT_MAX; i++) middleware(req("1.1.1.1"));
  assert.equal(middleware(req("1.1.1.1"))?.status, 429);
  assert.notEqual(middleware(req("2.2.2.2"))?.status, 429);
});

test("x-real-ip takes precedence over x-forwarded-for", () => {
  resetRateLimitBuckets();
  const req = (xff: string) =>
    makeRequest("/api/cases/email", { "x-real-ip": "9.9.9.9", "x-forwarded-for": xff });
  for (let i = 0; i < RATE_LIMIT_MAX; i++) middleware(req(`10.0.0.${i}`));
  assert.equal(middleware(req("10.1.0.1"))?.status, 429);
});

test("window expiry resets the bucket", () => {
  let now = 1_000_000;
  resetRateLimitBuckets(() => now);
  const req = () => makeRequest("/api/cases/email");
  for (let i = 0; i < RATE_LIMIT_MAX; i++) middleware(req());
  assert.equal(middleware(req())?.status, 429);
  now += RATE_LIMIT_WINDOW_MS + 1;
  assert.notEqual(middleware(req())?.status, 429);
});
