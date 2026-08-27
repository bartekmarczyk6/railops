import { emptyAppState, type AppState } from "./types.js";
import { migrate } from "./migrations.js";

export type { AppState } from "./types.js";

export type ReadOptions = {
  dataDir: string;
};

export type UpdateOptions = {
  dataDir: string;
};

const stores = new Map<string, AppState>();

export function resetState(): void {
  stores.clear();
}

export function seedState(dataDir: string, state: AppState): void {
  stores.set(dataDir, state);
}

export function dropState(dataDir: string): void {
  stores.delete(dataDir);
}

export async function readState(options: ReadOptions): Promise<AppState> {
  const state = stores.get(options.dataDir);
  if (!state) return emptyAppState();
  return migrate(state);
}

export async function updateState(
  mutator: (state: AppState) => AppState,
  options: UpdateOptions,
): Promise<AppState> {
  const current = migrate(stores.get(options.dataDir) ?? emptyAppState());
  const next = mutator(current);
  if (next.schemaVersion !== current.schemaVersion) {
    next.schemaVersion = current.schemaVersion;
  }
  stores.set(options.dataDir, next);
  return next;
}
