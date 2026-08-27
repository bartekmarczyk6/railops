import type { AppState, StoredCase } from "./types.js";
import { CURRENT_SCHEMA_VERSION } from "./types.js";

export type Migration = {
  from: number;
  to: number;
  apply: (state: AppState) => AppState;
};

function migrateCaseToV2(raw: StoredCase): StoredCase {
  const legacy = raw as Partial<StoredCase>;
  return {
    ...raw,
    email: legacy.email ?? null,
    emailError: legacy.emailError ?? null,
    supplements: legacy.supplements ?? {},
  };
}

export const MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    to: 2,
    apply: (state) => ({
      ...state,
      cases: state.cases.map(migrateCaseToV2),
    }),
  },
];

export function migrate(state: AppState): AppState {
  let current = state;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const next = MIGRATIONS.find((m) => m.from === current.schemaVersion);
    if (next === undefined) break;
    current = { ...next.apply(current), schemaVersion: next.to };
  }
  return current;
}
