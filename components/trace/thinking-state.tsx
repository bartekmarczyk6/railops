"use client";

import React from "react";
import { useEffect, useState } from "react";
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { EventTimeline, stageLabel } from "./event-timeline.tsx";

export type ThinkingStateProps = {
  events: TraceEvent[];
  onSelectEvent?: (event: TraceEvent) => void;
};

function readMs(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(v) ? v : fallback;
}

type ThinkCycleProps = { labels: string[] };

function ThinkCycle({ labels }: ThinkCycleProps): React.JSX.Element {
  const longest = labels.reduce((a, b) => (b.length > a.length ? b : a), labels[0] ?? "");
  const [live, setLive] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (labels.length < 2) return;
    let timers: number[] = [];
    const hold = readMs("--think-hold", 2000);
    const swap = readMs("--think-swap", 150);
    const gap = readMs("--think-gap", 50);
    const timeout = window.setTimeout(() => {
      const next = (live + 1) % labels.length;
      setLeaving(live);
      setEntering(true);
      setLive(next);
      timers.push(
        window.setTimeout(() => setEntering(false), gap),
        window.setTimeout(() => setLeaving(null), swap + gap),
      );
    }, hold);
    return () => {
      window.clearTimeout(timeout);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [live, labels]);

  return (
    <span className="t-think" role="status">
      <span className="t-think-sizer" aria-hidden="true">{longest}</span>
      {leaving !== null ? (
        <span className="t-think-text is-exit" aria-hidden="true" data-text={labels[leaving]}>
          {labels[leaving]}
        </span>
      ) : null}
      <span
        className={entering ? "t-think-text is-enter-start" : "t-think-text"}
        data-text={labels[live]}
      >
        {labels[live]}
      </span>
    </span>
  );
}

export function ThinkingState({ events, onSelectEvent }: ThinkingStateProps): React.JSX.Element {
  const running = events.filter((e) => e.status === "started");
  const labels = running.map((e) => `${stageLabel(e.stage)}…`);
  return (
    <section data-component="thinking-state" data-role="work-state" className="grid gap-2">
      <h2 className="m-0">Trace</h2>
      {labels.length === 1 ? (
        <p className="m-0" role="status">
          <ThinkingShimmer>{labels[0]}</ThinkingShimmer>
        </p>
      ) : labels.length > 1 ? (
        <p className="m-0">
          <ThinkCycle labels={labels} />
        </p>
      ) : null}
      <EventTimeline events={events} onSelectEvent={onSelectEvent ?? (() => undefined)} />
    </section>
  );
}
