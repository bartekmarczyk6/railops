import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const requiredScripts = [
  "dev",
  "build",
  "typecheck",
  "test",
  "baml:generate",
  "knowledge:index",
];

const requiredCssTokens = [
  "--primary",
  "--surface",
  "--text",
  "--verified",
  "--warning",
  "--fixture",
  "--error",
];

test("foundation: package.json exposes required scripts", async () => {
  const raw = await readFile(resolve(repoRoot, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  for (const name of requiredScripts) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(scripts, name),
      `package.json script "${name}" is missing`,
    );
  }
});

test("foundation: app/globals.css defines required semantic tokens", async () => {
  const css = await readFile(resolve(repoRoot, "app", "globals.css"), "utf8");
  for (const token of requiredCssTokens) {
    assert.ok(
      css.includes(token),
      `globals.css is missing required CSS variable "${token}"`,
    );
  }
});