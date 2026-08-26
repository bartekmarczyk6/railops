import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { parseFrontmatter } from "./frontmatter.ts";
import type {
  CaseTopic,
  KnowledgeIndex,
  KnowledgePassage,
} from "./types.ts";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

function slugify(heading: string): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "section";
}

function splitByHeadings(body: string): { heading: string; text: string }[] {
  const lines = body.split(/\r?\n/);
  const matches: { index: number; heading: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(HEADING_RE);
    if (m) {
      matches.push({ index: i, heading: m[2]!.trim() });
    }
  }
  if (matches.length === 0) {
    const trimmed = body.trim();
    if (trimmed.length === 0) return [];
    return [{ heading: "Body", text: trimmed }];
  }

  const passages: { heading: string; text: string }[] = [];
  let prelude = lines.slice(0, matches[0]!.index).join("\n").trim();
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];
    const start = current.index + 1;
    const end = next ? next.index : lines.length;
    const sectionLines = lines.slice(start, end);
    const sectionBody = sectionLines.join("\n").trim();
    const text =
      i === 0 && prelude.length > 0
        ? `${prelude}\n\n${sectionBody}`.trim()
        : sectionBody;
    passages.push({ heading: current.heading, text });
  }
  return passages;
}

function passageId(sourceId: string, index: number, heading: string): string {
  return `${sourceId}__${String(index + 1).padStart(2, "0")}__${slugify(
    heading,
  )}`;
}

function listMarkdownFiles(dir: string): Promise<string[]> {
  return readdir(dir, { withFileTypes: true }).then((entries) => {
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(entry.name);
      }
    }
    return files.sort();
  });
}

async function buildPassagesForFile(
  filePath: string,
): Promise<KnowledgePassage[]> {
  const raw = await readFile(filePath, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const sections = splitByHeadings(body);

  const allTopics: CaseTopic[] = meta.topics;
  const authority: string = meta.authority;
  const version: number = meta.version;
  const sourceId: string = meta.id;
  const title: string = meta.title;

  const seenIds = new Set<string>();
  const passages: KnowledgePassage[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    let id = passageId(sourceId, i, section.heading);
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${sourceId}__${String(i + 1).padStart(2, "0")}__${slugify(
        section.heading,
      )}-${suffix}`;
      suffix++;
    }
    seenIds.add(id);
    passages.push({
      id,
      sourceId,
      title,
      heading: section.heading,
      topics: allTopics,
      authority,
      version,
      text: section.text,
    });
  }
  return passages;
}

function sortPassages(passages: KnowledgePassage[]): KnowledgePassage[] {
  return [...passages].sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

export async function buildKnowledgeIndex(
  sourceDir: string,
  outputFile: string,
): Promise<void> {
  const files = await listMarkdownFiles(sourceDir);
  const all: KnowledgePassage[] = [];
  for (const file of files) {
    const filePath = resolve(sourceDir, file);
    const passages = await buildPassagesForFile(filePath);
    for (const p of passages) all.push(p);
  }
  const index: KnowledgeIndex = { passages: sortPassages(all) };
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, JSON.stringify(index, null, 2) + "\n", "utf8");
}

export async function loadKnowledgeIndex(
  indexPath: string,
): Promise<KnowledgeIndex> {
  const resolved = resolve(process.cwd(), indexPath);
  const raw = await readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as KnowledgeIndex;
  if (!Array.isArray(parsed.passages)) {
    throw new Error(`index file ${resolved} is missing passages array`);
  }
  return parsed;
}
