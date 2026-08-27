import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import type { CritiqueReport, DecisionDraft, ExtractedClaims } from "@/lib/llm/types.ts";
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

const CONFIDENCE_BADGE: Record<"high" | "medium" | "low", "success" | "warning" | "error"> = {
  high: "success",
  medium: "warning",
  low: "error",
};

const CONFIDENCE_TEXT: Record<"high" | "medium" | "low", string> = {
  high: "High confidence — deterministic rules confirm the outcome.",
  medium: "Medium confidence — outcome likely, some fields unverified.",
  low: "Low confidence — the critic flagged issues; review with care.",
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
    <Card data-component="recommendation-card" data-section="recommendation" data-state={caseData.state}>
      <CardHeader>
        <CardTitle data-field="headline">Recommendation</CardTitle>
        <CardDescription data-field="confidence-note" data-confidence={confidence}>
          {CONFIDENCE_TEXT[confidence]}
        </CardDescription>
        <CardAction>
          <Badge variant={CONFIDENCE_BADGE[confidence]} data-field="confidence" data-confidence={confidence}>
            {confidence} confidence
          </Badge>
        </CardAction>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <dl className="m-0 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          <div data-field="outcome-block">
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Outcome</dt>
            <dd data-field="outcome" className="m-0 text-lg font-bold">
              {OUTCOME_LABEL[decision.outcome]}
            </dd>
          </div>
          <div data-field="amount-block">
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Proposed amount</dt>
            <dd data-field="amount" className="m-0 text-lg font-bold">
              {amount}
            </dd>
          </div>
          {rulesSummary ? (
            <div data-field="rules-block">
              <dt className="text-xs" style={{ color: "var(--text-muted)" }}>Deterministic rule</dt>
              <dd data-field="rule-outcome" className="m-0">
                {rulesSummary.outcome}
                {rulesSummary.amount !== null ? ` (${rulesSummary.amount})` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <div data-field="basis-block" className="grid gap-2">
          <h3 className="m-0 text-sm font-medium">Decision basis</h3>
          <DecisionBasisList items={decision.decisionBasis} />
        </div>
        {critique.findings.length > 0 ? (
          <div data-field="critic-findings" className="grid gap-2">
            <h3 className="m-0 text-sm font-medium">Critic findings</h3>
            <ul className="m-0 grid gap-1 ps-4">
              {critique.findings.map((f, i) => (
                <li key={i} data-severity={f.severity}>
                  <strong>{f.severity}:</strong> {f.message}
                  {f.evidenceRef ? (
                    <>
                      {" "}
                      <code data-record-ref={f.evidenceRef} className="font-mono text-xs">
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
          <div data-field="alternatives" className="grid gap-2">
            <h3 className="m-0 text-sm font-medium">Alternatives considered</h3>
            <ul className="m-0 ps-4">
              {alternatives.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {followUp.length > 0 ? (
          <div data-field="follow-up" className="grid gap-2">
            <h3 className="m-0 text-sm font-medium">Follow-up required</h3>
            <ul className="m-0 ps-4">
              {followUp.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {claims.missingFields.length > 0 ? (
          <div data-field="missing-fields" className="grid gap-2">
            <h3 className="m-0 text-sm font-medium">Missing fields</h3>
            <ul className="m-0 ps-4">
              {claims.missingFields.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function currencyForCase(caseData: StoredCase): string {
  const firstTicket = caseData.pkg.tickets[0];
  return firstTicket?.currency ?? "PLN";
}
