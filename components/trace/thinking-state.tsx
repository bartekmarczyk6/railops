import React from "react";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { EventTimeline } from "./event-timeline.tsx";

export type ThinkingStateProps = {
  events: TraceEvent[];
  onSelectEvent?: (event: TraceEvent) => void;
};

export function ThinkingState({ events, onSelectEvent }: ThinkingStateProps): React.JSX.Element {
  return (
    <div data-component="thinking-state" data-role="work-state">
      <EventTimeline
        events={events}
        onSelectEvent={onSelectEvent ?? (() => undefined)}
      />
    </div>
  );
}
