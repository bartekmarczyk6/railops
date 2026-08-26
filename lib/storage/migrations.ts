import type { AppState } from "./types.js";
import { CURRENT_SCHEMA_VERSION } from "./types.js";

export type Migration = {
  from: number;
  to: number;
  apply: (state: AppState) => AppState;
};

export const MIGRATIONS: readonly Migration[] = [];

export function migrate(state: AppState): AppState {
  let current = state;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const next = MIGRATIONS.find((m) => m.from === current.schemaVersion);
    if (next === undefined) break;
    current = { ...next.apply(current), schemaVersion: next.to };
  }
  return current;
}
