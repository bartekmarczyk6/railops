import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { emptyAppState, type AppState } from "./types.js";
import { migrate } from "./migrations.js";

export type { AppState } from "./types.js";

export type ReadOptions = {
  dataDir: string;
};

export type UpdateOptions = {
  dataDir: string;
};

const FILE_NAME = "state.json";
const TMP_NAME = "state.json.tmp";

type Mutex = {
  chain: Promise<unknown>;
};

let active: { mutex: Mutex; dataDir: string } | null = null;

export function resetState(): void {
  active = null;
}

function isRetriableRenameError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function atomicWrite(targetPath: string, data: string): Promise<void> {
  const tmpPath = join(dirname(targetPath), `${TMP_NAME}.${process.pid}.${Date.now()}`);
  await mkdir(dirname(tmpPath), { recursive: true });
  await writeFile(tmpPath, data, { encoding: "utf8", flag: "wx" });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(tmpPath, targetPath);
      return;
    } catch (err) {
      if (isRetriableRenameError(err) && attempt < 4) {
        lastErr = err;
        await sleep(5 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("rename failed after retries");
}

function parseState(raw: string): AppState {
  const parsed = JSON.parse(raw) as Partial<AppState> | null;
  if (parsed === null || typeof parsed !== "object") {
    return emptyAppState();
  }
  const base: AppState = {
    schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0,
    cases: Array.isArray(parsed.cases) ? (parsed.cases as AppState["cases"]) : [],
    events: Array.isArray(parsed.events) ? (parsed.events as AppState["events"]) : [],
    learning: Array.isArray(parsed.learning) ? (parsed.learning as AppState["learning"]) : [],
  };
  return base;
}

export async function readState(options: ReadOptions): Promise<AppState> {
  const filePath = resolve(options.dataDir, FILE_NAME);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyAppState();
    }
    throw err;
  }
  let state: AppState;
  try {
    state = parseState(raw);
  } catch {
    return emptyAppState();
  }
  return migrate(state);
}

export async function updateState(
  mutator: (state: AppState) => AppState,
  options: UpdateOptions,
): Promise<AppState> {
  const dataDir = resolve(options.dataDir);
  if (active === null || active.dataDir !== dataDir) {
    active = { mutex: { chain: Promise.resolve() }, dataDir };
  }
  const entry = active;

  const run = async (): Promise<AppState> => {
    const current = await readState({ dataDir });
    const next = mutator(current);
    if (next.schemaVersion !== current.schemaVersion) {
      next.schemaVersion = current.schemaVersion;
    }
    const filePath = join(dataDir, FILE_NAME);
    await atomicWrite(filePath, JSON.stringify(next));
    return next;
  };

  const previous = entry.mutex.chain;
  const result = previous.then(run, run);
  entry.mutex.chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
