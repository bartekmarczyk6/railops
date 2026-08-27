import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { parseFrontmatter } from "../lib/knowledge/frontmatter.ts";
import {
  buildKnowledgeIndex,
  loadKnowledgeIndex,
} from "../lib/knowledge/indexer.ts";
import {
  resetKnowledgeIndexCache,
  searchKnowledge,
} from "../lib/knowledge/search.ts";
import type { SearchQuery } from "../lib/knowledge/search.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const knowledgeDir = resolve(repoRoot, "knowledge");

const frontmatterDoc = [
  "---",
  "id: sample-doc",
  "title: Sample document",
  "topics: [delay_refund]",
  "authority: demo-policy",
  "version: 2",
  "---",
  "",
  "Body text.",
].join("\n");

test("frontmatter parses required fields and strips body", () => {
  const { meta, body } = parseFrontmatter(frontmatterDoc);
  assert.equal(meta.id, "sample-doc");
  assert.equal(meta.title, "Sample document");
  assert.deepEqual(meta.topics, ["delay_refund"]);
  assert.equal(meta.authority, "demo-policy");
  assert.equal(meta.version, 2);
  assert.equal(body.trim(), "Body text.");
});

test("buildKnowledgeIndex emits one passage per heading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const doc = [
      "---",
      "id: split-doc",
      "title: Three heading doc",
      "topics: [delay_refund]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## First heading",
      "",
      "First body.",
      "",
      "## Second heading",
      "",
      "Second body.",
      "",
      "## Third heading",
      "",
      "Third body.",
    ].join("\n");
    await writeFile(join(dir, "split-doc.md"), doc, "utf8");

    const output = join(dir, "index.json");
    await buildKnowledgeIndex(dir, output);
    const raw = await readFile(output, "utf8");
    const parsed = JSON.parse(raw) as {
      passages: { heading: string }[];
    };
    assert.equal(parsed.passages.length, 3);
    assert.deepEqual(
      parsed.passages.map((p) => p.heading),
      ["First heading", "Second heading", "Third heading"],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge filters by topic", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const delayDoc = [
      "---",
      "id: delay-doc",
      "title: Delay doc",
      "topics: [delay_refund]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## Delay heading",
      "",
      "Delay content mentioning refund.",
    ].join("\n");
    const ticketDoc = [
      "---",
      "id: ticket-doc",
      "title: Ticket doc",
      "topics: [ticket_change]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## Ticket heading",
      "",
      "Ticket change content.",
    ].join("\n");
    await writeFile(join(dir, "delay.md"), delayDoc, "utf8");
    await writeFile(join(dir, "ticket.md"), ticketDoc, "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const excerpts = searchKnowledge(
      { topic: "delay_refund", terms: [] },
      indexFile,
    );
    assert.ok(excerpts.length >= 1);
    for (const ex of excerpts) {
      assert.ok(
        ex.topics.includes("delay_refund"),
        `unexpected topic in ${ex.id}`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge ranks passenger-name passage above unrelated under shared topic", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const doc = [
      "---",
      "id: name-doc",
      "title: Passenger name changes",
      "topics: [passenger_name_change]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## Passenger name spelling correction",
      "",
      "Use the passenger name as it appears on the booking to confirm identity.",
      "Provide the corrected passenger name and a reason for the change.",
      "",
      "## Document retention notes",
      "",
      "All passenger name change records must be retained for audit.",
    ].join("\n");
    await writeFile(join(dir, "name.md"), doc, "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const excerpts = searchKnowledge(
      {
        topic: "passenger_name_change",
        terms: ["passenger", "name"],
      },
      indexFile,
    );
    assert.ok(excerpts.length >= 2);
    assert.match(
      excerpts[0]!.heading,
      /name|passenger/i,
      "top hit should mention passenger name",
    );
    assert.ok(
      excerpts[0]!.score >= excerpts[1]!.score,
      "ranked order should put matching passage first",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge enforces a maximum of five excerpts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const parts = ["---", "id: many-doc", "title: Many", `topics: [delay_refund]`, "authority: demo-policy", "version: 1", "---", ""];
    for (let i = 0; i < 8; i++) {
      parts.push(`## Heading number ${i}`);
      parts.push("");
      parts.push(`Body for heading ${i} mentioning refund.`);
      parts.push("");
    }
    await writeFile(join(dir, "many.md"), parts.join("\n"), "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const limitedTwo = searchKnowledge(
      { topic: "delay_refund", terms: [], limit: 2 },
      indexFile,
    );
    assert.equal(limitedTwo.length, 2);

    const limitedDefault = searchKnowledge(
      { topic: "delay_refund", terms: [] },
      indexFile,
    );
    assert.ok(limitedDefault.length <= 5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge returns no passages when no documents match the topic", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const doc = [
      "---",
      "id: only-delay",
      "title: Only delay",
      "topics: [delay_refund]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## Delay info",
      "",
      "Refund eligibility details.",
    ].join("\n");
    await writeFile(join(dir, "only.md"), doc, "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const excerpts = searchKnowledge(
      { topic: "cancelled_train_refund", terms: [] },
      indexFile,
    );
    assert.deepEqual(excerpts, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge preserves source metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const doc = [
      "---",
      "id: meta-doc",
      "title: Metadata source",
      "topics: [missed_connection]",
      "authority: demo-policy",
      "version: 4",
      "---",
      "",
      "## Connection window",
      "",
      "Connection window guidance text.",
    ].join("\n");
    await writeFile(join(dir, "meta.md"), doc, "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const excerpts = searchKnowledge(
      { topic: "missed_connection", terms: [] },
      indexFile,
    );
    assert.equal(excerpts.length, 1);
    const ex = excerpts[0]!;
    assert.equal(ex.sourceId, "meta-doc");
    assert.equal(ex.title, "Metadata source");
    assert.equal(ex.heading, "Connection window");
    assert.equal(ex.version, 4);
    assert.deepEqual(ex.topics, ["missed_connection"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("searchKnowledge is deterministic across repeated calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "railops-knowledge-"));
  try {
    const doc = [
      "---",
      "id: det-doc",
      "title: Determinism doc",
      "topics: [delay_refund]",
      "authority: demo-policy",
      "version: 1",
      "---",
      "",
      "## First",
      "",
      "First body that mentions refund eligibility.",
      "",
      "## Second",
      "",
      "Second body that mentions refund eligibility.",
    ].join("\n");
    await writeFile(join(dir, "det.md"), doc, "utf8");
    const indexFile = join(dir, "index.json");
    await buildKnowledgeIndex(dir, indexFile);

    const query: SearchQuery = {
      topic: "delay_refund",
      terms: ["refund"],
    };
    const first = searchKnowledge(query, indexFile);
    const second = searchKnowledge(query, indexFile);
    assert.deepEqual(second, first);
    assert.equal(typeof first[0]?.score, "number");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("committed knowledge directory contains required starter docs", async () => {
  const files: string[] = [];
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(knowledgeDir)) {
    if (entry.endsWith(".md")) files.push(entry);
  }
  assert.ok(files.includes("delay-refund.md"));
  assert.ok(files.includes("cancelled-train.md"));
  assert.ok(files.includes("missed-connection.md"));
  assert.ok(files.includes("ticket-changes.md"));
  assert.ok(files.includes("name-changes.md"));
  assert.ok(files.includes("missing-refund.md"));
  assert.ok(files.includes("payment-without-ticket.md"));
  assert.ok(files.includes("validation-discount-penalty.md"));
  assert.ok(files.includes("response-examples.md"));
});

test("committed knowledge index loads and exposes passages for each topic", async () => {
  const indexPath = resolve(knowledgeDir, "index.json");
  const index = await loadKnowledgeIndex(indexPath);
  const byTopic: Record<string, number> = {};
  for (const p of index.passages) {
    for (const t of p.topics) {
      byTopic[t] = (byTopic[t] ?? 0) + 1;
    }
  }
  for (const topic of [
    "delay_refund",
    "cancelled_train_refund",
    "missed_connection",
    "ticket_change",
    "passenger_name_change",
    "missing_refund",
    "payment_without_ticket",
    "validation_discount_penalty",
  ]) {
    assert.ok(
      (byTopic[topic] ?? 0) > 0,
      `committed index is missing passages for topic ${topic}`,
    );
  }
});

test("searchKnowledge with default path uses the bundled index", () => {
  resetKnowledgeIndexCache();
  const results = searchKnowledge({
    topic: "delay_refund",
    terms: ["delay", "refund"],
  });
  assert.ok(
    results.length > 0,
    "bundled index should return excerpts for delay_refund",
  );
  for (const excerpt of results) {
    assert.ok(excerpt.topics.includes("delay_refund"));
  }
});
