"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TraceEvent } from "@/lib/storage/types.ts";
import { stageLabel } from "./event-timeline.tsx";

export type RawEvidenceSheetProps = {
  event: TraceEvent | null;
  onClose?: () => void;
};

export function RawEvidenceSheet({ event, onClose }: RawEvidenceSheetProps): React.JSX.Element {
  const open = event !== null;
  return (
    <div
      data-component="raw-evidence-sheet"
      data-open={open ? "true" : "false"}
      data-event-id={event?.id ?? ""}
    >
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose?.();
        }}
      >
        <SheetPopup side="right">
          <SheetHeader>
            <SheetTitle>Raw event payload</SheetTitle>
            <SheetDescription>
              {event
                ? `${stageLabel(event.stage)} · ${event.status} · run ${event.runId}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="grid gap-4">
            <pre
              data-field="payload"
              className="m-0 overflow-auto rounded-lg border p-2 font-mono text-xs leading-4"
              style={{ background: "var(--surface-sunken)" }}
            >
              {JSON.stringify(event?.payload ?? null, null, 2)}
            </pre>
            {event && event.evidenceRefs.length > 0 ? (
              <div data-field="evidence-refs" className="grid gap-1">
                <h4 className="m-0 text-sm font-medium">Evidence refs</h4>
                {event.evidenceRefs.map((r) => (
                  <code key={r} data-record-ref={r} className="font-mono text-xs">
                    {r}
                  </code>
                ))}
              </div>
            ) : null}
          </SheetPanel>
          <SheetFooter>
            <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          </SheetFooter>
        </SheetPopup>
      </Sheet>
    </div>
  );
}
