import type { DisruptionRecord, RouteRecord } from "../domain/types.ts";
import type { RouteSeed } from "./types.ts";

export const PLK_API_KEY_ENV = "PLK_API_KEY";
export const PLK_BASE_URL = "https://pdp-api.plk-sa.pl/api/v1";
export const PLK_OPERATIONS_PATH = "/operations";
export const PLK_DEFAULT_TIMEOUT_MS = 5_000;
export const PLK_MAX_RETRIES_ON_5XX = 1;

export class PlkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlkError";
  }
}

export class PlkKeyMissing extends PlkError {
  constructor() {
    super("PLK_API_KEY is required for live PLK calls");
    this.name = "PlkKeyMissing";
  }
}

export class PlkNotImplemented extends PlkError {
  constructor() {
    super(
      "live PLK adapter is intentionally stubbed: provide a verified implementation per docs/api-otwarte-dane.md before use",
    );
    this.name = "PlkNotImplemented";
  }
}

export class PlkResponseShapeError extends PlkError {
  constructor(message: string) {
    super(message);
    this.name = "PlkResponseShapeError";
  }
}

export class PlkHttpError extends PlkError {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`PLK request failed with status ${status}: ${message}`);
    this.name = "PlkHttpError";
    this.status = status;
  }
}

export type LiveOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => Date;
};

export type LiveInput = {
  origin: string;
  destination: string;
  date: string;
};

export function isPlkKeyConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = env[PLK_API_KEY_ENV];
  return typeof key === "string" && key.trim().length > 0;
}

export function redactPlkKey(key: string): string {
  if (key.length <= 6) return "***";
  return `${key.slice(0, 4)}***${key.slice(-2)}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.length > 0) return text;
  } catch {
    return response.statusText || "";
  }
  return response.statusText || "";
}

export type PlkLiveWire = {
  baseUrl: string;
  operationsPath: string;
  key: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  now: () => Date;
};

export async function callPlkLive(
  input: LiveInput,
  wire: PlkLiveWire,
  attempts: number = 1 + PLK_MAX_RETRIES_ON_5XX,
): Promise<RouteSeed> {
  const url = new URL(`${wire.baseUrl}${wire.operationsPath}`);
  url.searchParams.set("dateFrom", input.date);
  url.searchParams.set("dateTo", input.date);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), wire.timeoutMs);
  try {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await wire.fetchImpl(url.toString(), {
          method: "GET",
          headers: {
            "X-API-Key": wire.key,
            Accept: "application/json",
            "X-Api-Version": "1.0",
          },
          signal: controller.signal,
        });
        if (response.status >= 500) {
          if (attempt < attempts) continue;
          throw new PlkHttpError(response.status, "server error");
        }
        if (!response.ok) {
          const text = await readErrorMessage(response);
          throw new PlkHttpError(response.status, text);
        }
        const body = (await response.json()) as unknown;
        return normalizePlkWireResponse(body, input, wire.now);
      } catch (err) {
        lastError = err;
        if (err instanceof PlkHttpError && err.status < 500) throw err;
        if (err instanceof PlkResponseShapeError) throw err;
        if (attempt < attempts) continue;
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new PlkError("live plk request failed");
  } finally {
    clearTimeout(timer);
  }
}

function normalizePlkWireResponse(
  body: unknown,
  input: LiveInput,
  now: () => Date,
): RouteSeed {
  if (!body || typeof body !== "object") {
    throw new PlkResponseShapeError("plk response is not an object");
  }
  return {
    source: "plk",
    fetchedAt: now().toISOString(),
    route: synthesizeRoute(input),
    disruption: extractDisruption(body),
  };
}

function synthesizeRoute(input: LiveInput): RouteRecord {
  const id = `plk-route-${randomUUID()}`;
  return {
    id,
    origin: input.origin,
    destination: input.destination,
    scheduledDeparture: syntheticTimestamp(input.date, "07:30"),
    scheduledArrival: syntheticTimestamp(input.date, "10:45"),
    actualDeparture: null,
    actualArrival: null,
    operator: "PKP Intercity",
  };
}

function syntheticTimestamp(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00.000Z`).toISOString();
}

function extractDisruption(body: unknown): DisruptionRecord | null {
  if (!body || typeof body !== "object") return null;
  const candidate = (body as { disruptions?: unknown }).disruptions;
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  const first = candidate[0] as Record<string, unknown>;
  if (
    typeof first.id !== "string" ||
    typeof first.routeId !== "string" ||
    typeof first.actualDelayMinutes !== "number" ||
    typeof first.cause !== "string" ||
    typeof first.reportedAt !== "string"
  ) {
    return null;
  }
  return {
    id: first.id,
    routeId: first.routeId,
    type: "delay",
    scheduledDelayMinutes: 0,
    actualDelayMinutes: first.actualDelayMinutes,
    cause: first.cause,
    reportedAt: first.reportedAt,
  };
}

function randomUUID(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchLivePlkRouteSeed(
  input: LiveInput,
  options: LiveOptions = {},
): Promise<RouteSeed> {
  void input;
  const env = options.env ?? process.env;
  if (!isPlkKeyConfigured(env)) {
    throw new PlkKeyMissing();
  }
  void redactPlkKey((env[PLK_API_KEY_ENV] as string).trim());
  throw new PlkNotImplemented();
}
