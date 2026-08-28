import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const readScript = (rel: string): Promise<string> => readFile(resolve(repoRoot, rel), "utf8");

const splitLines = (text: string): string[] => text.split(/\r?\n/);

const SECRET_PATTERNS = [
  /gsk_[A-Za-z0-9]{20,}/,
  /sk-or-v1-[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
];

function findBash(): string {
  if (process.platform === "win32") {
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
    if (existsSync(gitBash)) return gitBash;
  }
  return "bash";
}

function bashAvailable(): boolean {
  try {
    execFileSync(findBash(), ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pwshAvailable(): boolean {
  try {
    execFileSync("pwsh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function envWithNodeOnPath(): NodeJS.ProcessEnv {
  const nodeDir = dirname(process.execPath);
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  return { ...process.env, [pathKey]: `${nodeDir}${delimiter}${process.env[pathKey] ?? ""}` };
}

test("wizard: setup.sh declares a bash shebang and strict mode", async () => {
  const sh = await readScript("scripts/setup.sh");
  const firstLine = splitLines(sh)[0];
  assert.equal(firstLine, "#!/usr/bin/env bash", "setup.sh must start with #!/usr/bin/env bash");
  assert.match(sh, /set -euo pipefail/, "setup.sh must run with set -euo pipefail");
});

test("wizard: setup.sh supports --dry-run and guards every install", async () => {
  const sh = await readScript("scripts/setup.sh");
  assert.match(sh, /--dry-run/, "setup.sh must accept --dry-run");
  assert.ok(!sh.includes("git clone"), "setup.sh must not clone repositories");

  const runStart = sh.indexOf("run() {");
  assert.ok(runStart >= 0, "setup.sh must route mutations through a run() helper");
  const runBody = sh.slice(runStart, runStart + 400);
  assert.match(runBody, /DRY_RUN/, "run() must short-circuit when DRY_RUN is set");

  const installLines = splitLines(sh).filter((line) => /\binstall\b/.test(line));
  const unguarded = installLines.filter(
    (line) =>
      !/^\s*run\b/.test(line) &&
      !/(say|note|ok|warn|fail|printf|has |command -v|require_cmd)/.test(line) &&
      !/dry-run/i.test(line),
  );
  assert.deepEqual(unguarded, [], `install calls must go through run(): ${unguarded.join(" | ")}`);
});

test("wizard: setup.sh contains no hard-coded API keys", async () => {
  const sh = await readScript("scripts/setup.sh");
  for (const pattern of SECRET_PATTERNS) {
    assert.ok(!pattern.test(sh), `setup.sh matches secret pattern ${pattern}`);
  }
});

test("wizard: setup.sh never installs postgres or hermes", async () => {
  const sh = await readScript("scripts/setup.sh");
  assert.ok(!/pg_isready/i.test(sh), "setup.sh must not reference pg_isready");
  assert.ok(!/postgres/i.test(sh), "setup.sh must not reference postgres");
  assert.ok(!/hermes/i.test(sh), "setup.sh must not reference hermes");
});

test("wizard: setup.sh reads secrets hidden and never prints them", async () => {
  const sh = await readScript("scripts/setup.sh");
  assert.match(sh, /read -rs/, "setup.sh must prompt for secrets with read -rs");
  assert.match(sh, /\.env\.local/, "setup.sh must write secrets to .env.local");
  const printed = splitLines(sh).filter((line) =>
    /^\s*(printf|echo|say|note|ok|warn|fail)\b/.test(line),
  );
  for (const line of printed) {
    assert.ok(
      !/\$(GROQ_API_KEY|PLK_API_KEY|groq_input|plk_input)\b/.test(line),
      `secret variable appears in an output line: ${line.trim()}`,
    );
  }
});

test("wizard: setup.sh always bounds curl with --max-time", async () => {
  const sh = await readScript("scripts/setup.sh");
  const curlLines = splitLines(sh).filter((line) => /\bcurl\s+-/.test(line));
  assert.ok(curlLines.length > 0, "setup.sh should use curl for health checks");
  for (const line of curlLines) {
    assert.match(line, /--max-time/, `curl without timeout: ${line.trim()}`);
  }
});

test("wizard: setup.ps1 supports -DryRun, .env.local, and secure prompts", async () => {
  const ps1 = await readScript("scripts/setup.ps1");
  assert.match(ps1, /\[switch\]\$DryRun/, "setup.ps1 must accept -DryRun");
  assert.match(ps1, /\.env\.local/, "setup.ps1 must write secrets to .env.local");
  assert.match(ps1, /Read-Host\s+.*-AsSecureString/, "setup.ps1 must read secrets via Read-Host -AsSecureString");
  assert.match(ps1, /Read-Secret[^\n]*Groq/i, "setup.ps1 must use the secure prompt for the Groq key");
  assert.match(ps1, /\$ErrorActionPreference\s*=\s*'Stop'/, "setup.ps1 must set ErrorActionPreference to Stop");
  for (const pattern of SECRET_PATTERNS) {
    assert.ok(!pattern.test(ps1), `setup.ps1 matches secret pattern ${pattern}`);
  }
  assert.ok(!/pg_isready|postgres|hermes/i.test(ps1), "setup.ps1 must not reference postgres/hermes tooling");
});

test("wizard: setup.ps1 never echoes captured secret variables", async () => {
  const ps1 = await readScript("scripts/setup.ps1");
  const outputLines = splitLines(ps1).filter((line) =>
    /(Write-Host|Write-Output|\bSay\b|\bNote\b|\bOk\b|\bWarn\b|\bFail\b)/.test(line),
  );
  for (const line of outputLines) {
    assert.ok(
      !/(Write-Host|Write-Output|\bSay\b|\bNote\b|\bOk\b|\bWarn\b|\bFail\b)[^\n]*\$(GroqKey|PlkKey)\b/.test(line),
      `secret variable appears in an output line: ${line.trim()}`,
    );
  }
});

test("wizard: setup.ps1 bounds web requests with -TimeoutSec", async () => {
  const ps1 = await readScript("scripts/setup.ps1");
  const requestLines = splitLines(ps1).filter((line) => /Invoke-WebRequest/.test(line));
  assert.ok(requestLines.length > 0, "setup.ps1 should use Invoke-WebRequest for health checks");
  for (const line of requestLines) {
    assert.match(line, /-TimeoutSec/, `web request without timeout: ${line.trim()}`);
  }
});

test("wizard: setup.ps1 parses without errors", async () => {
  const target = resolve(repoRoot, "scripts/setup.ps1").replace(/\\/g, "/");
  if (pwshAvailable()) {
    const command =
      "$t = $null; $e = $null; " +
      `$null = [System.Management.Automation.Language.Parser]::ParseFile('${target}', [ref]$t, [ref]$e); ` +
      "if ($e -and $e.Count -gt 0) { $e | ForEach-Object { Write-Error $_.Message }; exit 1 }";
    execFileSync("pwsh", ["-NoProfile", "-Command", command], { stdio: "pipe" });
    return;
  }
  const ps1 = await readScript("scripts/setup.ps1");
  const open = (ps1.match(/\{/g) ?? []).length;
  const close = (ps1.match(/\}/g) ?? []).length;
  assert.equal(open, close, "setup.ps1 has unbalanced braces (pwsh unavailable for a real parse)");
});

test("wizard: verify scripts check syntax and dry-run behavior", async () => {
  const vsh = await readScript("scripts/verify-setup.sh");
  assert.match(vsh, /bash -n/, "verify-setup.sh must run bash -n syntax checks");
  assert.match(vsh, /--dry-run/, "verify-setup.sh must exercise the dry-run mode");
  const vps = await readScript("scripts/verify-setup.ps1");
  assert.match(vps, /ParseFile/, "verify-setup.ps1 must parse setup.ps1 with the PowerShell parser");
  assert.match(vps, /-DryRun/, "verify-setup.ps1 must exercise the dry-run mode");
});

test(
  "wizard: verify-setup.sh passes on this repo (syntax + idempotent dry-run)",
  { timeout: 120_000 },
  () => {
    assert.ok(bashAvailable(), "bash is required to verify setup.sh (install Git Bash on Windows)");
    execFileSync(findBash(), ["scripts/verify-setup.sh"], {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120_000,
      env: envWithNodeOnPath(),
    });
  },
);

test(
  "wizard: verify-setup.ps1 passes on this repo (parse + idempotent dry-run)",
  { timeout: 180_000 },
  () => {
    assert.ok(pwshAvailable(), "PowerShell 7+ is required to verify setup.ps1");
    execFileSync("pwsh", ["-NoProfile", "-File", "scripts/verify-setup.ps1"], {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 180_000,
      env: envWithNodeOnPath(),
    });
  },
);
