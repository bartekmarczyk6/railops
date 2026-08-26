import {
  loadCassetteRoute,
  CassetteError,
  type CassetteInput,
} from "./cassette.ts";
import {
  fetchLivePlkRouteSeed,
  isPlkKeyConfigured,
} from "./plk.ts";
import type { RouteSeed } from "./types.ts";

export type GetRouteSeedInput = CassetteInput;

export type GetRouteSeedOptions = {
  cassetteDir?: string;
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_CASSETTE_DIR = "cassettes/plk";

export class RouteSeedUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteSeedUnavailable";
  }
}

export async function getRouteSeed(
  input: GetRouteSeedInput,
  options: GetRouteSeedOptions = {},
): Promise<RouteSeed> {
  const env = options.env ?? process.env;
  const cassetteDir = options.cassetteDir ?? DEFAULT_CASSETTE_DIR;
  if (isPlkKeyConfigured(env)) {
    return fetchLivePlkRouteSeed(input, { env });
  }
  try {
    return await loadCassetteRoute(input, cassetteDir);
  } catch (err) {
    if (err instanceof CassetteError) {
      throw new RouteSeedUnavailable(
        `cassette missing for ${input.origin} -> ${input.destination} on ${input.date}: ${err.message}`,
      );
    }
    throw err;
  }
}
