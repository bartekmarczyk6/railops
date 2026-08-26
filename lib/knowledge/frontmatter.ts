import { isCaseTopic, type CaseTopic } from "./types.ts";

export type KnowledgeFrontmatter = {
  id: string;
  title: string;
  topics: CaseTopic[];
  authority: string;
  version: number;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(raw: string): string | number {
  const trimmed = stripQuotes(raw.trim());
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  return trimmed;
}

function parseTopics(raw: string): CaseTopic[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`topics must be a YAML inline list, got: ${raw}`);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  const parts = inner
    .split(",")
    .map((part) => stripQuotes(part.trim()))
    .filter((part) => part.length > 0);
  const topics: CaseTopic[] = [];
  for (const part of parts) {
    if (!isCaseTopic(part)) {
      throw new Error(`unknown topic literal: ${part}`);
    }
    topics.push(part);
  }
  return topics;
}

function assignField(
  meta: Record<string, string | number | CaseTopic[]>,
  key: string,
  raw: string,
): void {
  if (key === "topics") {
    meta[key] = parseTopics(raw);
    return;
  }
  const scalar = parseScalar(raw);
  meta[key] = scalar;
}

export function parseFrontmatter(content: string): {
  meta: KnowledgeFrontmatter;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("front matter is missing");
  }
  const yaml = match[1] ?? "";
  const body = content.slice(match[0].length);

  const partial: Record<string, string | number | CaseTopic[]> = {};
  for (const line of yaml.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    assignField(partial, m[1]!, m[2]!);
  }

  const id = partial.id;
  const title = partial.title;
  const topics = partial.topics;
  const authority = partial.authority;
  const version = partial.version;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error("front matter is missing required field: id");
  }
  if (typeof title !== "string" || title.length === 0) {
    throw new Error("front matter is missing required field: title");
  }
  if (!Array.isArray(topics)) {
    throw new Error("front matter is missing required field: topics");
  }
  if (typeof authority !== "string" || authority.length === 0) {
    throw new Error("front matter is missing required field: authority");
  }
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error("front matter is missing required field: version");
  }

  return {
    meta: { id, title, topics, authority, version },
    body,
  };
}
