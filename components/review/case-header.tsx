import React from "react";
import type { StoredCase } from "@/lib/storage/types.ts";

export type CaseHeaderProps = {
  caseData: StoredCase;
};

const STATE_LABEL: Record<StoredCase["state"], string> = {
  created: "Created",
  running: "Running",
  reviewable: "Reviewable",
  approved: "Approved",
  rejected: "Rejected",
  escalated: "Escalated",
  revising: "Revising",
  learning_saved: "Learning saved",
  error: "Error",
};

export function CaseHeader({ caseData }: CaseHeaderProps): React.JSX.Element {
  return (
    <header
      data-component="case-header"
      data-section="header"
      style={{
        display: "grid",
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <span
          data-badge="synthetic"
          style={{
            padding: "2px var(--space-2)",
            background: "var(--fixture)",
            color: "var(--text-2)",
            borderRadius: "var(--radius-sm)",
            fontSize: "10px",
            lineHeight: "14px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Synthetic data
        </span>
        <h1 data-field="topic" style={{ margin: 0 }}>
          {caseData.topic.replaceAll("_", " ")}
        </h1>
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-2)",
          margin: 0,
        }}
      >
        <div>
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Case ID</dt>
          <dd data-field="case-id" style={{ margin: 0, fontFamily: "ui-monospace, monospace" }}>
            {caseData.caseId}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Truth mode</dt>
          <dd data-field="truth-mode" style={{ margin: 0 }}>
            {caseData.truthMode.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>State</dt>
          <dd data-field="state" style={{ margin: 0 }}>
            {STATE_LABEL[caseData.state]}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Seed</dt>
          <dd data-field="seed" style={{ margin: 0 }}>{caseData.seed}</dd>
        </div>
        <div>
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Version</dt>
          <dd data-field="version" style={{ margin: 0 }}>{caseData.version}</dd>
        </div>
      </dl>
    </header>
  );
}
