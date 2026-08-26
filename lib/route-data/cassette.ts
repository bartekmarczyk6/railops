import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DisruptionRecord, RouteRecord } from "../domain/types.ts";
import {
  CASSETTE_DISCLAIMER,
  type CassetteRoute,
  type RouteSeed,
} from "./types.ts";

export type CassetteInput = {
  origin: string;
  destination: string;
  date: string;
};

const SNAKE_DATE_REGEX = /[^a-z0-9]+/g;

export function cassetteKey(input: CassetteInput): string {
  const date = sanitizeSegment(input.date);
  const origin = sanitizeSegment(input.origin);
  const destination = sanitizeSegment(input.destination);
  if (!date || !origin || !destination) {
    throw new CassetteKeyError("cassette key parts must be non-empty");
  }
  return `${origin}-${destination}-${date}.json`;
}

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(SNAKE_DATE_REGEX, "-").replace(/^-|-$/g, "");
}

export class CassetteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CassetteError";
  }
}

export class CassetteKeyError extends CassetteError {
  constructor(message: string) {
    super(message);
    this.name = "CassetteKeyError";
  }
}

export class CassetteShapeError extends CassetteError {
  constructor(message: string) {
    super(message);
    this.name = "CassetteShapeError";
  }
}

function readCassetteFile(cassetteDir: string, fileName: string): CassetteRoute {
  const path = join(cassetteDir, fileName);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : "read failed";
    throw new CassetteError(`cannot read cassette ${fileName}: ${reason}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "parse failed";
    throw new CassetteShapeError(`cassette ${fileName} is not valid json: ${reason}`);
  }
  return parseCassetteBody(parsed, fileName);
}

function parseCassetteBody(body: unknown, fileName: string): CassetteRoute {
  if (!body || typeof body !== "object") {
    throw new CassetteShapeError(`cassette ${fileName} is not an object`);
  }
  const obj = body as Record<string, unknown>;
  if (obj._disclaimer !== CASSETTE_DISCLAIMER) {
    throw new CassetteShapeError(
      `cassette ${fileName} is missing the synthetic _disclaimer field`,
    );
  }
  const route = obj.route;
  if (!route || typeof route !== "object") {
    throw new CassetteShapeError(`cassette ${fileName} is missing route`);
  }
  const normalizedRoute = normalizeRoute(route as Record<string, unknown>, fileName);
  const disruption = obj.disruption == null
    ? null
    : normalizeDisruption(obj.disruption as Record<string, unknown>, normalizedRoute.id, fileName);
  return {
    _disclaimer: CASSETTE_DISCLAIMER,
    recordedAt: typeof obj.recordedAt === "string" ? obj.recordedAt : undefined,
    cassetteId: typeof obj.cassetteId === "string" ? obj.cassetteId : undefined,
    route: normalizedRoute,
    disruption,
  };
}

const ROUTE_REQUIRED_FIELDS = [
  "id",
  "origin",
  "destination",
  "scheduledDeparture",
  "scheduledArrival",
  "operator",
] as const;

function normalizeRoute(
  raw: Record<string, unknown>,
  fileName: string,
): RouteRecord {
  for (const field of ROUTE_REQUIRED_FIELDS) {
    if (typeof raw[field] !== "string" || (raw[field] as string).length === 0) {
      throw new CassetteShapeError(
        `cassette ${fileName} route is missing required string field ${field}`,
      );
    }
  }
  return {
    id: raw.id as string,
    origin: raw.origin as string,
    destination: raw.destination as string,
    scheduledDeparture: raw.scheduledDeparture as string,
    scheduledArrival: raw.scheduledArrival as string,
    actualDeparture: pickString(raw.actualDeparture),
    actualArrival: pickString(raw.actualArrival),
    operator: raw.operator as string,
  };
}

const DISRUPTION_TYPES = new Set(["delay", "cancellation", "missed_connection"]);

function normalizeDisruption(
  raw: Record<string, unknown>,
  routeId: string,
  fileName: string,
): DisruptionRecord {
  const type = raw.type;
  if (typeof type !== "string" || !DISRUPTION_TYPES.has(type)) {
    throw new CassetteShapeError(
      `cassette ${fileName} disruption has invalid type ${String(type)}`,
    );
  }
  if (
    typeof raw.scheduledDelayMinutes !== "number" ||
    typeof raw.actualDelayMinutes !== "number" ||
    typeof raw.cause !== "string" ||
    typeof raw.reportedAt !== "string"
  ) {
    throw new CassetteShapeError(`cassette ${fileName} disruption is missing required fields`);
  }
  return {
    id: typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : cryptoRandomUUID(),
    routeId: typeof raw.routeId === "string" ? raw.routeId : routeId,
    type: type as DisruptionRecord["type"],
    scheduledDelayMinutes: raw.scheduledDelayMinutes,
    actualDelayMinutes: raw.actualDelayMinutes,
    cause: raw.cause,
    reportedAt: raw.reportedAt,
  };
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cryptoRandomUUID(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${time}-${rand}`;
}

export type LoadCassetteOptions = {
  cassetteDir: string;
};

export async function loadCassetteRoute(
  input: CassetteInput,
  cassetteDir: string,
): Promise<RouteSeed> {
  const fileName = cassetteKey(input);
  const cassette = readCassetteFile(cassetteDir, fileName);
  return {
    source: "cassette",
    fetchedAt: new Date().toISOString(),
    route: cassette.route,
    disruption: cassette.disruption,
  };
}
