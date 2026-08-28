"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredCase, TraceEvent } from "@/lib/storage/types.ts";

export type CaseRunStatus = "idle" | "running" | "done" | "error";

export type CaseRunBody = { answers: Record<string, string> };

export type CaseRunOptions = {
  getStored?: () => StoredCase | undefined;
  getEvents?: () => TraceEvent[];
  onDone?: (stored: StoredCase, events: TraceEvent[]) => void;
};

export type CaseRunState = {
  status: CaseRunStatus;
  events: TraceEvent[];
  emailPartial: { subject?: string; body?: string } | null;
  draftPartial: { response?: string; outcome?: string; proposedAmount?: number | null } | null;
  error: string | null;
};

type StreamFrame = {
  type: "stream";
  stage: "generating_email" | "drafting";
  partial: Record<string, unknown>;
};

const INITIAL_STATE: CaseRunState = {
  status: "idle",
  events: [],
  emailPartial: null,
  draftPartial: null,
  error: null,
};

// Drift guard: if TraceEvent ever gains a `type` field, this check and the done-frame filter below would silently drop events.
function isTraceEvent(value: unknown): value is TraceEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.stage === "string" &&
    typeof v.status === "string" &&
    !("type" in v)
  );
}

export function buildRunRequest(
  caseId: string,
  body?: CaseRunBody,
  stored?: StoredCase,
  events?: TraceEvent[],
): { url: string; init: RequestInit } {
  const url = `/api/cases/${caseId}/run`;
  const hasEvents = Array.isArray(events) && events.length > 0;
  if (body === undefined && stored === undefined && !hasEvents) {
    return { url, init: { method: "POST" } };
  }
  return {
    url,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, stored, ...(hasEvents ? { events } : {}) }),
    },
  };
}

export function useCaseRun(
  caseId: string,
  live: boolean,
  options?: CaseRunOptions,
): CaseRunState & { start: (body?: CaseRunBody) => void } {
  const [state, setState] = useState<CaseRunState>(INITIAL_STATE);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const start = useCallback((body?: CaseRunBody) => {
    if (runningRef.current) return;
    runningRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL_STATE, status: "running" });

    const applyFrame = (frame: string): void => {
      const dataLines = frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length));
      if (dataLines.length === 0) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(dataLines.join("\n"));
      } catch {
        return;
      }
      if (typeof parsed !== "object" || parsed === null) return;
      const value = parsed as Record<string, unknown>;
      if (value.type === "stream") {
        const stream = parsed as StreamFrame;
        setState((s) => {
          if (stream.stage === "generating_email") {
            return { ...s, emailPartial: { ...s.emailPartial, ...stream.partial } };
          }
          if (stream.stage === "drafting") {
            return { ...s, draftPartial: { ...s.draftPartial, ...stream.partial } };
          }
          return s;
        });
        return;
      }
      if (value.type === "done") {
        const stored = value.stored as Partial<StoredCase> | null;
        if (stored && typeof stored === "object" && typeof stored.caseId === "string" && stored.caseId.length > 0) {
          const rawEvents = value.events;
          const events = Array.isArray(rawEvents)
            ? (rawEvents as unknown[]).filter((e): e is TraceEvent => isTraceEvent(e))
            : [];
          optionsRef.current?.onDone?.(stored as StoredCase, events);
        }
        return;
      }
      if (!isTraceEvent(parsed)) return;
      const event = parsed;
      setState((s) => {
        const events = s.events.some((e) => e.id === event.id)
          ? s.events.map((e) => (e.id === event.id ? event : e))
          : [...s.events, event];
        const next: CaseRunState = { ...s, events };
        if (event.status === "failed" && s.status === "running") {
          next.status = "error";
          next.error = event.error ?? event.summary;
        }
        return next;
      });
    };

    void (async () => {
      const { url, init } = buildRunRequest(
        caseId,
        body,
        optionsRef.current?.getStored?.(),
        optionsRef.current?.getEvents?.(),
      );
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (err) {
        runningRef.current = false;
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
        return;
      }
      if (!response.ok || !response.body) {
        runningRef.current = false;
        setState((s) => ({
          ...s,
          status: "error",
          error:
            response.status === 429
              ? "The demo is rate-limited — please wait a moment."
              : `Run failed with HTTP ${response.status}`,
        }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let separator = buffer.indexOf("\n\n");
          while (separator >= 0) {
            const frame = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            applyFrame(frame);
            separator = buffer.indexOf("\n\n");
          }
        }
        runningRef.current = false;
        setState((s) => (s.status === "running" ? { ...s, status: "done" } : s));
      } catch (err) {
        runningRef.current = false;
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
  }, [caseId]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => start(), 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
      abortRef.current = null;
      runningRef.current = false;
    };
  }, [live, start]);

  return { ...state, start };
}
