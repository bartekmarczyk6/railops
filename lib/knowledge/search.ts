import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import bundledIndex from "../../knowledge/index.json";

import type {
  CaseTopic,
  KnowledgeExcerpt,
  KnowledgeIndex,
  KnowledgePassage,
} from "./types.ts";

const DEFAULT_LIMIT = 5;
export const DEFAULT_INDEX_PATH = "./knowledge/index.json";

export type SearchQuery = {
  topic: CaseTopic;
  terms: string[];
  limit?: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function scorePassage(
  passage: KnowledgePassage,
  queryTokens: string[],
): number {
  if (queryTokens.length === 0) return 0;
  const bodyTokens = tokenize(`${passage.title} ${passage.text}`);
  const headingTokens = new Set(tokenize(passage.heading));
  let score = 0;
  for (const term of queryTokens) {
    let bodyHits = 0;
    for (const token of bodyTokens) {
      if (token === term) bodyHits++;
    }
    score += bodyHits;
    if (headingTokens.has(term)) score += 5;
  }
  return score;
}

function sortExcerpts(excerpts: KnowledgeExcerpt[]): KnowledgeExcerpt[] {
  return [...excerpts].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

export function searchIndex(
  index: KnowledgeIndex,
  query: SearchQuery,
): KnowledgeExcerpt[] {
  const limit = Math.min(
    Math.max(query.limit ?? DEFAULT_LIMIT, 1),
    DEFAULT_LIMIT,
  );
  const filtered = index.passages.filter((p) => p.topics.includes(query.topic));
  const queryTokens = query.terms.map((t) => t.toLowerCase());
  const scored: KnowledgeExcerpt[] = filtered.map((p) => ({
    ...p,
    score: scorePassage(p, queryTokens),
  }));
  return sortExcerpts(scored).slice(0, limit);
}

function loadIndexSync(indexPath: string): KnowledgeIndex {
  if (indexPath === DEFAULT_INDEX_PATH) {
    const parsed = bundledIndex as unknown as KnowledgeIndex;
    if (!Array.isArray(parsed.passages)) {
      throw new Error("bundled knowledge index is missing passages array");
    }
    return parsed;
  }
  const resolved = resolve(process.cwd(), indexPath);
  const raw = readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as KnowledgeIndex;
  if (!Array.isArray(parsed.passages)) {
    throw new Error(`index file ${resolved} is missing passages array`);
  }
  return parsed;
}

let cachedDefault: KnowledgeIndex | null = null;

export function searchKnowledge(
  query: SearchQuery,
  indexPath: string = DEFAULT_INDEX_PATH,
): KnowledgeExcerpt[] {
  const index =
    indexPath === DEFAULT_INDEX_PATH
      ? (cachedDefault ??= loadIndexSync(DEFAULT_INDEX_PATH))
      : loadIndexSync(indexPath);
  return searchIndex(index, query);
}

export function resetKnowledgeIndexCache(): void {
  cachedDefault = null;
}
