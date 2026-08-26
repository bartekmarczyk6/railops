import React from "react";
import type { TraceEvent } from "@/lib/storage/types.ts";

export type RawEvidenceSheetProps = {
  event: TraceEvent | null;
};

export function RawEvidenceSheet({ event }: RawEvidenceSheetProps): React.JSX.Element {
  const isOpen = event !== null;
  return (
    <aside
      data-component="raw-evidence-sheet"
      data-open={isOpen ? "true" : "false"}
      data-event-id={event?.id ?? ""}
      hidden={!isOpen}
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-sunken)",
      }}
    >
      <h3 style={{ marginTop: 0 }}>Raw event payload</h3>
      <pre
        data-field="payload"
        style={{
          margin: 0,
          padding: "var(--space-2)",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize: "12px",
          lineHeight: "16px",
          overflow: "auto",
        }}
      >
        {JSON.stringify(event?.payload ?? null, null, 2)}
      </pre>
    </aside>
  );
}
