import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export {
  sanitizeLearningText,
  buildLearningContent,
  learningTags,
  learningMetadata,
} from "./sanitize.ts";

export type TombstoneStore = {
  load(): ReadonlySet<string>;
  add(memoryId: string): void;
  remove(memoryId: string): void;
  path: string;
};

export function createTombstoneStore(filePath: string): TombstoneStore {
  const path = resolve(filePath);
  return {
    path,
    load(): ReadonlySet<string> {
      if (!existsSync(path)) return new Set();
      try {
        const raw = readFileSync(path, "utf8");
        const parsed = JSON.parse(raw) as { tombstones?: unknown };
        if (!parsed || !Array.isArray(parsed.tombstones)) return new Set();
        const ids = parsed.tombstones.filter((v): v is string => typeof v === "string");
        return new Set(ids);
      } catch {
        return new Set();
      }
    },
    add(memoryId: string): void {
      const current = new Set(this.load());
      current.add(memoryId);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ tombstones: Array.from(current).sort() }, null, 2));
    },
    remove(memoryId: string): void {
      const current = new Set(this.load());
      if (!current.delete(memoryId)) return;
      if (current.size === 0) {
        if (existsSync(path)) writeFileSync(path, "[]");
        return;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ tombstones: Array.from(current).sort() }, null, 2));
    },
  };
}

export const DEFAULT_TOMBSTONE_PATH = ".railops/memory/tombstones.json";

export function defaultTombstonePath(repoRoot: string): string {
  return join(repoRoot, ".railops", "memory", "tombstones.json");
}
