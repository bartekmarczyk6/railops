import type { DisruptionRecord, RouteRecord } from "../domain/types.ts";

export type RouteSource = "cassette" | "plk";

export type RouteSeed = {
  source: RouteSource;
  fetchedAt: string;
  route: RouteRecord;
  disruption: DisruptionRecord | null;
};

export type CassetteRoute = {
  _disclaimer: "synthetic";
  recordedAt?: string;
  cassetteId?: string;
  route: RouteRecord;
  disruption: DisruptionRecord | null;
};

export const CASSETTE_DISCLAIMER: "synthetic" = "synthetic";
