import React from "react";
import type { DecisionDraft, ExtractedClaims, CritiqueReport } from "@/lib/llm/types.ts";
import type { StoredCase } from "@/lib/storage/types.ts";
import { DecisionBasisList } from "@/components/trace/decision-basis.tsx";

export type RecommendationCardProps = {
  caseData: StoredCase;
  decision: DecisionDraft;
  claims: ExtractedClaims;
  critique: CritiqueReport;
  rulesSummary?: {
    outcome: string;
    amount: number | null;
  } | null;
  confidence: "high" | "medium" | "low";
  alternatives: string[];
  followUp: string[];
};

const OUTCOME_LABEL: Record<DecisionDraft["outcome"], string> = {
  refund: "Refund",
  change: "Change",
  follow_up: "Follow-up",
  unsupported_or_escalate: "Escalate",
  information: "Information",
};

export function RecommendationCard({
  caseData,
  decision,
  claims,
  critique,
  rulesSummary,
  confidence,
  alternatives,
  followUp,
}: RecommendationCardProps): React.JSX.Element {
  const amount =
    decision.proposedAmount !== null
      ? `${decision.proposedAmount} ${currencyForCase(caseData)}`
      : "n/a";
  return (
    <section
      data-component="recommendation-card"
      data-section="recommendation"
      data-state={caseData.state}
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
        <h2 style={{ margin: 0 }} data-field="headline">Recommendation</h2>
        <span
          data-field="confidence"
          data-confidence={confidence}
          style={{
            padding: "2px var(--space-2)",
            background: confidence === "high" ? "var(--verified)" : "var(--warning)",
            color: "var(--text)",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            textTransform: "uppercase",
          }}
        >
          {confidence} confidence
        </span>
      </header>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--space-3)",
          margin: 0,
        }}
      >
        <div data-field="outcome-block">
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Outcome</dt>
          <dd data-field="outcome" style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>
            {OUTCOME_LABEL[decision.outcome]}
          </dd>
        </div>
        <div data-field="amount-block">
          <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Proposed amount</dt>
          <dd data-field="amount" style={{ margin: 0, fontWeight: 700, fontSize: "18px" }}>
            {amount}
          </dd>
        </div>
        {rulesSummary ? (
          <div data-field="rules-block">
            <dt style={{ fontSize: "10px", color: "var(--text-muted)" }}>Deterministic rule</dt>
            <dd data-field="rule-outcome" style={{ margin: 0 }}>
              {rulesSummary.outcome}
              {rulesSummary.amount !== null ? ` (${rulesSummary.amount})` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <div data-field="response-block">
        <h3 style={{ margin: 0, fontSize: "14px" }}>Draft response</h3>
        <p data-field="response" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {decision.response}
        </p>
      </div>
      <div data-field="basis-block">
        <h3 style={{ margin: 0, fontSize: "14px" }}>Decision basis</h3>
        <DecisionBasisList items={decision.decisionBasis} />
      </div>
      {critique.findings.length > 0 ? (
        <div data-field="critic-findings">
          <h3 style={{ margin: 0, fontSize: "14px" }}>Critic findings</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {critique.findings.map((f, i) => (
              <li key={i} data-severity={f.severity}>
                <strong>{f.severity}:</strong> {f.message}
                {f.evidenceRef ? (
                  <>
                    {" "}
                    <code
                      data-record-ref={f.evidenceRef}
                      style={{ fontFamily: "ui-monospace, monospace" }}
                    >
                      {f.evidenceRef}
                    </code>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {alternatives.length > 0 ? (
        <div data-field="alternatives">
          <h3 style={{ margin: 0, fontSize: "14px" }}>Alternatives considered</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {alternatives.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {followUp.length > 0 ? (
        <div data-field="follow-up">
          <h3 style={{ margin: 0, fontSize: "14px" }}>Follow-up required</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {followUp.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {claims.missingFields.length > 0 ? (
        <div data-field="missing-fields">
          <h3 style={{ margin: 0, fontSize: "14px" }}>Missing fields</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {claims.missingFields.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function currencyForCase(caseData: StoredCase): string {
  const firstTicket = caseData.pkg.tickets[0];
  return firstTicket?.currency ?? "PLN";
}
