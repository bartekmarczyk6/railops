import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { StatusPill } from "@/components/beui/atoms/StatusPill.tsx";
import { Shimmer } from "@/components/beui/atoms/Shimmer.tsx";
import type { CritiqueReport, DecisionDraft, ExtractedClaims } from "@/lib/llm/types.ts";
import type { StoredCase } from "@/lib/storage/types.ts";
import { DecisionBasisList } from "@/components/trace/decision-basis.tsx";
import {
  formatEvidenceRef,
  formatMoney,
  humanize,
  outcomeHeadline,
  ruleOutcomeLabel,
} from "./formatters.ts";

export type RecommendationCardProps = {
  caseData: StoredCase;
  decision: DecisionDraft | null;
  claims: ExtractedClaims | null;
  critique: CritiqueReport;
  rulesSummary?: {
    outcome: string;
    amount: number | null;
  } | null;
  confidence: "high" | "medium" | "low";
  alternatives: string[];
  followUp: string[];
  pending?: boolean;
  streaming?: boolean;
};

const CONFIDENCE_TONE: Record<"high" | "medium" | "low", "green" | "orange" | "red"> = {
  high: "green",
  medium: "orange",
  low: "red",
};

const CONFIDENCE_TEXT: Record<"high" | "medium" | "low", string> = {
  high: "High confidence — deterministic rules confirm the outcome.",
  medium: "Medium confidence — outcome likely, some fields unverified.",
  low: "Low confidence — the critic flagged issues; review with care.",
};

const SEVERITY_TONE: Record<"info" | "warning" | "error", string> = {
  info: "bg-inset text-ink-2",
  warning: "bg-orange-tint text-orange",
  error: "bg-red-tint text-red",
};

function SubHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{children}</h3>
  );
}

export function RecommendationCard({
  caseData,
  decision,
  claims,
  critique,
  rulesSummary,
  confidence,
  alternatives,
  followUp,
  pending = false,
  streaming = false,
}: RecommendationCardProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const currency = currencyForCase(caseData);
  return (
    <section
      data-component="recommendation-card"
      data-section="recommendation"
      data-state={caseData.state}
      aria-label="Recommendation"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 data-field="headline" className="m-0 font-display text-[14px] font-semibold text-ink">
          Recommendation
        </h2>
        <span data-field="confidence" data-confidence={confidence} className="contents">
          <StatusPill tone={CONFIDENCE_TONE[confidence]}>
            {humanize(confidence)} confidence
          </StatusPill>
        </span>
      </div>
      <div className="p-4">
        {decision === null && pending ? (
          <div data-field="pending" aria-busy="true" className="grid gap-2.5">
            <span className="h-5 w-52 animate-skeleton rounded-md bg-inset" />
            <span className="h-3.5 w-full animate-skeleton rounded-md bg-inset" />
            <span className="h-3.5 w-5/6 animate-skeleton rounded-md bg-inset" />
            <span className="h-3.5 w-2/3 animate-skeleton rounded-md bg-inset" />
          </div>
        ) : decision === null ? (
          <p data-field="awaiting-draft" className="m-0 text-[13px] text-ink-3">
            The recommendation appears once the agent starts drafting.
          </p>
        ) : (
          <motion.div
            className="grid gap-4"
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p data-field="outcome" className="m-0 font-display text-[17px] font-semibold text-ink">
                {streaming ? (
                  <Shimmer>{outcomeHeadline(decision.outcome)}…</Shimmer>
                ) : (
                  outcomeHeadline(decision.outcome)
                )}
              </p>
              <p data-field="amount" className="m-0 font-mono text-[17px] font-semibold tabular-nums text-ink">
                {decision.proposedAmount !== null
                  ? formatMoney(decision.proposedAmount, currency)
                  : "—"}
              </p>
            </div>
            <p data-field="confidence-note" data-confidence={confidence} className="m-0 text-[12.5px] text-ink-2">
              {streaming ? "Drafting decision…" : CONFIDENCE_TEXT[confidence]}
            </p>
            {rulesSummary ? (
              <div
                data-field="rules-block"
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-inset/60 px-3 py-2"
              >
                <span data-field="rule-outcome" className="text-[13px] font-medium text-ink">
                  {ruleOutcomeLabel(rulesSummary.outcome)}
                </span>
                <span className="text-[12px] text-ink-3">Deterministic rules</span>
              </div>
            ) : null}
            <div data-field="basis-block" className="grid gap-2">
              <SubHeading>Why</SubHeading>
              <DecisionBasisList items={decision.decisionBasis} />
            </div>
            {critique.findings.length > 0 ? (
              <div data-field="critic-findings" className="grid gap-2">
                <SubHeading>Critic findings</SubHeading>
                <ul className="m-0 grid list-none gap-1.5 p-0">
                  {critique.findings.map((f, i) => (
                    <li key={i} data-severity={f.severity} className="flex flex-wrap items-start gap-2">
                      <span
                        className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${SEVERITY_TONE[f.severity]}`}
                      >
                        {humanize(f.severity)}
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">
                        {f.message}
                        {f.evidenceRef ? (
                          <span
                            data-record-ref={f.evidenceRef}
                            className="ms-1.5 inline-flex h-5 items-center rounded-full bg-inset px-2 text-[11px] font-medium text-ink-2"
                          >
                            {formatEvidenceRef(f.evidenceRef)}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {alternatives.length > 0 ? (
              <div data-field="alternatives" className="grid gap-2">
                <SubHeading>Alternatives considered</SubHeading>
                <p className="m-0 flex flex-wrap gap-1.5">
                  {alternatives.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex h-6 items-center rounded-full bg-inset px-2.5 text-[12px] font-medium text-ink-2"
                    >
                      {a}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
            {followUp.length > 0 ? (
              <div data-field="follow-up" className="grid gap-1.5">
                <SubHeading>Follow-up</SubHeading>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {followUp.map((f, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                      <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-line-strong" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {claims && claims.missingFields.length > 0 ? (
              <div data-field="missing-fields" className="grid gap-1.5">
                <SubHeading>Still needed</SubHeading>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {claims.missingFields.map((f, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                      <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-line-strong" />
                      {humanize(f)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function currencyForCase(caseData: StoredCase): string {
  const firstTicket = caseData.pkg.tickets[0];
  return firstTicket?.currency ?? "PLN";
}
