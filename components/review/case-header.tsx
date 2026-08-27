import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
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

const STATE_BADGE_VARIANT: Record<StoredCase["state"], "success" | "error" | "warning" | "info" | "secondary"> = {
  created: "secondary",
  running: "warning",
  reviewable: "info",
  approved: "success",
  rejected: "error",
  escalated: "warning",
  revising: "info",
  learning_saved: "success",
  error: "error",
};

export function CaseHeader({ caseData }: CaseHeaderProps): React.JSX.Element {
  return (
    <Card data-component="case-header" data-section="header">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Badge
            data-badge="synthetic"
            className="uppercase tracking-wide"
            style={{ background: "var(--fixture)", color: "#ffffff" }}
          >
            Synthetic data
          </Badge>
          <span data-field="topic">{caseData.topic.replaceAll("_", " ")}</span>
        </CardTitle>
      </CardHeader>
      <CardPanel>
        <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <div>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Case ID</dt>
            <dd data-field="case-id" className="m-0 font-mono text-sm">
              {caseData.caseId}
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Truth mode</dt>
            <dd data-field="truth-mode" className="m-0">
              {caseData.truthMode.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>State</dt>
            <dd data-field="state" className="m-0">
              <Badge variant={STATE_BADGE_VARIANT[caseData.state]} data-state-badge={caseData.state}>
                {STATE_LABEL[caseData.state]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Seed</dt>
            <dd data-field="seed" className="m-0">{caseData.seed}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Version</dt>
            <dd data-field="version" className="m-0">{caseData.version}</dd>
          </div>
        </dl>
      </CardPanel>
    </Card>
  );
}
