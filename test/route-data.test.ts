import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cassetteKey } from "../lib/route-data/cassette.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

async function withCassetteDir<T>(fn: (cassetteDir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "railops-cassette-"));
  try {
    mkdirSync(dir, { recursive: true });
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeCassette(
  dir: string,
  name: string,
  body: Record<string, unknown>,
): void {
  writeFileSync(join(dir, name), JSON.stringify(body, null, 2));
}

function writeCassetteFor(
  dir: string,
  input: { origin: string; destination: string; date: string },
  body: Record<string, unknown>,
): string {
  const name = cassetteKey(input);
  writeCassette(dir, name, body);
  return name;
}

function envWithoutKey(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PLK_API_KEY;
  return env;
}

function envWithKey(key: string): NodeJS.ProcessEnv {
  return { ...process.env, PLK_API_KEY: key };
}

function makeSyntheticRouteFixture(): Record<string, unknown> {
  return {
    _disclaimer: "synthetic",
    recordedAt: "2026-08-20T08:00:00.000Z",
    cassetteId: "warszawa-krakow-2026-09-01",
    route: {
      id: "11111111-1111-4111-8111-111111111111",
      origin: "Warszawa Centralna",
      destination: "Krakow Glowny",
      scheduledDeparture: "2026-09-01T07:30:00.000Z",
      scheduledArrival: "2026-09-01T10:45:00.000Z",
      actualDeparture: "2026-09-01T07:42:00.000Z",
      actualArrival: "2026-09-01T11:05:00.000Z",
      operator: "PKP Intercity",
    },
    disruption: {
      id: "22222222-2222-4222-8222-222222222222",
      routeId: "11111111-1111-4111-8111-111111111111",
      type: "delay",
      scheduledDelayMinutes: 0,
      actualDelayMinutes: 20,
      cause: "signalling failure",
      reportedAt: "2026-09-01T07:10:00.000Z",
    },
  };
}

test("getRouteSeed: defaults to cassette when PLK_API_KEY is absent", async () => {
  await withCassetteDir(async (dir) => {
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      makeSyntheticRouteFixture(),
    );
    const { getRouteSeed } = await import("../lib/route-data/source.ts");
    const seed = await getRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { cassetteDir: dir, env: envWithoutKey() },
    );
    assert.equal(seed.source, "cassette");
    assert.equal(seed.route.origin, "Warszawa Centralna");
    assert.equal(seed.route.destination, "Krakow Glowny");
    assert.equal(seed.disruption?.type, "delay");
    assert.ok(!Number.isNaN(Date.parse(seed.fetchedAt)));
  });
});

test("getRouteSeed: cassette content is deterministic for identical input", async () => {
  await withCassetteDir(async (dir) => {
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      makeSyntheticRouteFixture(),
    );
    const { getRouteSeed } = await import("../lib/route-data/source.ts");
    const a = await getRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { cassetteDir: dir, env: envWithoutKey() },
    );
    const b = await getRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { cassetteDir: dir, env: envWithoutKey() },
    );
    assert.equal(a.source, "cassette");
    assert.equal(b.source, "cassette");
    assert.equal(JSON.stringify(a.route), JSON.stringify(b.route));
    assert.equal(JSON.stringify(a.disruption), JSON.stringify(b.disruption));
    assert.ok(!Number.isNaN(Date.parse(a.fetchedAt)));
    assert.ok(!Number.isNaN(Date.parse(b.fetchedAt)));
  });
});

test("getRouteSeed: each cassette resolution always carries a fetchedAt timestamp", async () => {
  await withCassetteDir(async (dir) => {
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      makeSyntheticRouteFixture(),
    );
    const { getRouteSeed } = await import("../lib/route-data/source.ts");
    const seed = await getRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { cassetteDir: dir, env: envWithoutKey() },
    );
    assert.ok(typeof seed.fetchedAt === "string");
    assert.ok(seed.fetchedAt.length > 0);
    assert.ok(!Number.isNaN(Date.parse(seed.fetchedAt)));
  });
});

test("getRouteSeed: throws when cassette missing and no PLK_API_KEY", async () => {
  await withCassetteDir(async (dir) => {
    const { getRouteSeed } = await import("../lib/route-data/source.ts");
    await assert.rejects(
      getRouteSeed(
        { origin: "Unknown", destination: "Nowhere", date: "2026-09-01" },
        { cassetteDir: dir, env: envWithoutKey() },
      ),
      /cassette.*missing|not.*found|no cassette/i,
    );
  });
});

test("cassette: loadCassetteRoute rejects a cassette without _disclaimer", async () => {
  await withCassetteDir(async (dir) => {
    const body = makeSyntheticRouteFixture();
    delete body._disclaimer;
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      body,
    );
    const { loadCassetteRoute } = await import("../lib/route-data/cassette.ts");
    await assert.rejects(
      loadCassetteRoute(
        { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
        dir,
      ),
      /disclaimer|synthetic/i,
    );
  });
});

test("cassette: loadCassetteRoute rejects a malformed JSON file", async () => {
  await withCassetteDir(async (dir) => {
    const name = cassetteKey({
      origin: "Warszawa Centralna",
      destination: "Krakow Glowny",
      date: "2026-09-01",
    });
    writeFileSync(join(dir, name), "{not-json");
    const { loadCassetteRoute } = await import("../lib/route-data/cassette.ts");
    await assert.rejects(
      loadCassetteRoute(
        { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
        dir,
      ),
      /parse|json/i,
    );
  });
});

test("cassette: loadCassetteRoute rejects a cassette with a route missing required fields", async () => {
  await withCassetteDir(async (dir) => {
    const body = makeSyntheticRouteFixture();
    delete (body.route as Record<string, unknown>).origin;
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      body,
    );
    const { loadCassetteRoute } = await import("../lib/route-data/cassette.ts");
    await assert.rejects(
      loadCassetteRoute(
        { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
        dir,
      ),
      /route|origin/i,
    );
  });
});

test("PLK adapter: throws PlkKeyMissing when PLK_API_KEY is absent", async () => {
  const { fetchLivePlkRouteSeed } = await import("../lib/route-data/plk.ts");
  await assert.rejects(
    fetchLivePlkRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { env: envWithoutKey() },
    ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { name: string }).name, "PlkKeyMissing");
      return true;
    },
  );
});

test("PLK adapter: throws PlkNotImplemented when key is present (current stub state)", async () => {
  const { fetchLivePlkRouteSeed } = await import("../lib/route-data/plk.ts");
  const KEY = "sk_live_test_secret_DO_NOT_LOG_1234567890";
  let captured = "";
  try {
    await fetchLivePlkRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { env: envWithKey(KEY) },
    );
  } catch (err) {
    captured = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  assert.match(captured, /^PlkNotImplemented:/);
  assert.ok(!captured.includes(KEY), "PLK_API_KEY must never appear in error messages");
});

test("PLK adapter: PlkKeyMissing error does not contain key hints when secret is supplied whitespace", async () => {
  const { fetchLivePlkRouteSeed } = await import("../lib/route-data/plk.ts");
  let captured = "";
  try {
    await fetchLivePlkRouteSeed(
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      { env: envWithKey("   ") },
    );
  } catch (err) {
    captured = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  assert.match(captured, /^PlkKeyMissing:/);
});

test("getRouteSeed: when PLK_API_KEY is present the live PlkNotImplemented bubbles out", async () => {
  await withCassetteDir(async (dir) => {
    writeCassetteFor(
      dir,
      { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
      makeSyntheticRouteFixture(),
    );
    const { getRouteSeed } = await import("../lib/route-data/source.ts");
    const KEY = "sk_live_bubble_test_secret_DO_NOT_LOG";
    await assert.rejects(
      getRouteSeed(
        { origin: "Warszawa Centralna", destination: "Krakow Glowny", date: "2026-09-01" },
        { cassetteDir: dir, env: envWithKey(KEY) },
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { name: string }).name, "PlkNotImplemented");
        const msg = (err as Error).message;
        assert.ok(!msg.includes(KEY), "key must never leak through the error path");
        return true;
      },
    );
  });
});

test("cassettes under cassettes/plk/: at least 3 synthetic fixtures exist with disclaimer", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const cassetteDir = resolve(repoRoot, "cassettes/plk");
  const entries = readdirSync(cassetteDir).filter((n) => n.endsWith(".json"));
  assert.ok(entries.length >= 3, `expected >=3 cassettes, found ${entries.length}`);
  for (const entry of entries) {
    const parsed = JSON.parse(readFileSync(join(cassetteDir, entry), "utf8")) as {
      _disclaimer?: string;
      route?: { origin?: string; destination?: string };
    };
    assert.equal(parsed._disclaimer, "synthetic", `cassette ${entry} is not synthetic`);
    assert.ok(parsed.route?.origin && parsed.route?.destination, `cassette ${entry} missing route endpoints`);
  }
});

test("record-plk-cassette script: explicit dry-run mode makes no live calls", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/record-plk-cassette.ts", "--dry-run", "--origin", "Warszawa Centralna", "--destination", "Krakow Glowny", "--date", "2026-09-01"],
    {
      cwd: repoRoot,
      env: { ...process.env, PLK_API_KEY: "" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, `record-plk-cassette dry-run failed: ${result.stderr}`);
  assert.match(result.stdout, /\[dry-run\]/);
  assert.doesNotMatch(result.stdout, /\[apply\]/);
});

test("record-plk-cassette script: dry-run is default and succeeds even when PLK_API_KEY is set", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/record-plk-cassette.ts", "--origin", "Warszawa Centralna", "--destination", "Krakow Glowny", "--date", "2026-09-01"],
    {
      cwd: repoRoot,
      env: { ...process.env, PLK_API_KEY: "sk_live_test_key_present_kept_dry_run" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, `dry-run exited non-zero: ${result.stderr}`);
  assert.match(result.stdout, /\[dry-run\]/);
  assert.doesNotMatch(result.stdout, /\[apply\]/);
});

test("record-plk-cassette script: refuses to apply without PLK_API_KEY even with --apply", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/record-plk-cassette.ts", "--apply", "--origin", "Warszawa Centralna", "--destination", "Krakow Glowny", "--date", "2026-09-01"],
    {
      cwd: repoRoot,
      env: { ...process.env, PLK_API_KEY: "" },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0, "script must refuse to run without PLK_API_KEY");
  assert.match(result.stdout + result.stderr, /PLK_API_KEY/);
});

test("record-plk-cassette script: refuses to apply with empty/whitespace PLK_API_KEY", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/record-plk-cassette.ts", "--apply", "--origin", "Warszawa Centralna", "--destination", "Krakow Glowny", "--date", "2026-09-01"],
    {
      cwd: repoRoot,
      env: { ...process.env, PLK_API_KEY: "  " },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /PLK_API_KEY/);
});
