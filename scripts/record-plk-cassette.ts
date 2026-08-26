import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cassetteKey,
  type CassetteInput,
} from "../lib/route-data/cassette.ts";
import {
  isPlkKeyConfigured,
  redactPlkKey,
  PLK_API_KEY_ENV,
} from "../lib/route-data/plk.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cassetteDir = resolve(repoRoot, "cassettes/plk");

const USAGE = [
  "Usage: tsx scripts/record-plk-cassette.ts [--apply] --origin <station> --destination <station> --date <YYYY-MM-DD>",
  "",
  "Defaults to a dry-run. Pass --apply to actually issue the live request.",
  "Requires PLK_API_KEY=... in the environment when --apply is set.",
].join("\n");

const REDACT = redactEnv();

function redactEnv(): NodeJS.ProcessEnv {
  const out = { ...process.env };
  if (out[PLK_API_KEY_ENV]) {
    out[PLK_API_KEY_ENV] = "***";
  }
  return out;
}

type CliOptions = {
  apply: boolean;
  origin?: string;
  destination?: string;
  date?: string;
};

function parseArgs(argv: readonly string[]): CliOptions {
  const out: CliOptions = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.apply = false;
      continue;
    }
    if (arg === "--origin") {
      out.origin = argv[++i];
      continue;
    }
    if (arg === "--destination") {
      out.destination = argv[++i];
      continue;
    }
    if (arg === "--date") {
      out.date = argv[++i];
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function fail(message: string): never {
  process.stderr.write(`record-plk-cassette: ${message}\n`);
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.origin || !opts.destination || !opts.date) {
    fail("--origin, --destination and --date are required");
  }
  const input: CassetteInput = {
    origin: opts.origin,
    destination: opts.destination,
    date: opts.date,
  };
  const fileName = cassetteKey(input);
  const fullPath = resolve(cassetteDir, fileName);

  if (!opts.apply) {
    process.stdout.write(
      [
        `[dry-run] cassette key: ${fileName}`,
        `[dry-run] destination: ${cassetteDir}`,
        `[dry-run] origin -> destination: ${opts.origin} -> ${opts.destination}`,
        `[dry-run] date: ${opts.date}`,
        "[dry-run] pass --apply to actually invoke live PLK API",
      ].join("\n") + "\n",
    );
    return;
  }

  if (!isPlkKeyConfigured(process.env)) {
    fail(`PLK_API_KEY is required when --apply is set (env=${REDACT[PLK_API_KEY_ENV] ?? "<unset>"})`);
  }

  const rendered = redactPlkKey((process.env[PLK_API_KEY_ENV] as string).trim());
  process.stderr.write(`[apply] running live call with redacted key=${rendered}\n`);

  const nodeArgs = [
    "--import",
    "tsx",
    "scripts/_record-plk-live.ts",
    "--origin",
    opts.origin,
    "--destination",
    opts.destination,
    "--date",
    opts.date,
    "--out",
    fullPath,
  ];

  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  mkdirSync(cassetteDir, { recursive: true });
  writeFileSync(
    `${fullPath}.meta.json`,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        origin: opts.origin,
        destination: opts.destination,
        date: opts.date,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stdout.write(`[apply] wrote ${fullPath}\n`);
}

void main().catch((err) => {
  process.stderr.write(`record-plk-cassette: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
