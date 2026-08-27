"use client";

import React from "react";
import { Button } from "@/components/beui/atoms/Button.tsx";
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
import type { CritiqueReport, DecisionDraft } from "@/lib/llm/types.ts";
import type { RuleEvaluation } from "@/lib/rules/types.ts";
import type { TraceEvent } from "@/lib/storage/types.ts";
import {
  formatDateTime,
  formatEvidenceRef,
  formatMoney,
  humanize,
  outcomeHeadline,
  requestedActionLabel,
  ruleOutcomeLabel,
} from "@/components/review/formatters.ts";
import { stageLabel } from "./event-timeline.tsx";
import { ToolChip } from "./tool-chip.tsx";

export type RawEvidenceSheetProps = {
  event: TraceEvent | null;
  onClose?: () => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <h4 className="m-0 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h4>
      {children}
    </div>
  );
}

function RefChips({ refs }: { refs: readonly string[] }): React.JSX.Element {
  return (
    <p className="m-0 flex flex-wrap gap-1">
      {refs.map((r) => (
        <span
          key={r}
          data-record-ref={r}
          className="inline-flex h-6 items-center rounded-full bg-inset px-2.5 text-[12px] font-medium text-ink-2"
        >
          {formatEvidenceRef(r)}
        </span>
      ))}
    </p>
  );
}

function EmailDetails({ payload }: { payload: Record<string, unknown> }): React.JSX.Element | null {
  const subject = asString(payload.subject);
  const facts = asStringArray(payload.mentionedFacts);
  if (!subject && facts.length === 0) return null;
  return (
    <>
      {subject ? (
        <Section title="Subject">
          <p className="m-0 text-[13px] font-medium text-ink">{subject}</p>
        </Section>
      ) : null}
      {facts.length > 0 ? (
        <Section title="Mentioned in the message">
          <RefChips refs={facts} />
        </Section>
      ) : null}
    </>
  );
}

function ClaimsDetails({ payload }: { payload: Record<string, unknown> }): React.JSX.Element | null {
  const requested = asString(payload.requestedAction);
  const missing = asStringArray(payload.missingFields).map(humanize);
  const stations = asStringArray(payload.referencedStations);
  const items = Array.isArray(payload.claims)
    ? payload.claims
        .map(asRecord)
        .filter((c): c is Record<string, unknown> => c !== null)
    : [];
  if (!requested && items.length === 0 && missing.length === 0) return null;
  return (
    <>
      {requested ? (
        <Section title="The passenger wants">
          <p className="m-0 text-[13px] font-medium text-ink">{requestedActionLabel(requested)}</p>
        </Section>
      ) : null}
      {items.length > 0 ? (
        <Section title="Claimed facts">
          <ul className="m-0 grid list-none gap-1 p-0">
            {items.map((c, i) => {
              const description = asString(c.description) ?? humanize(asString(c.kind) ?? "");
              const ticket = asString(c.ticketNumber);
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-line-strong" />
                  <span className="min-w-0 flex-1">{description}</span>
                  {ticket ? (
                    <span className="inline-flex h-5 items-center rounded-full bg-inset px-2 text-[11px] font-medium">
                      Ticket {ticket}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      {stations.length > 0 ? (
        <Section title="Stations mentioned">
          <p className="m-0 text-[12.5px] text-ink-2">{stations.join(" → ")}</p>
        </Section>
      ) : null}
      {missing.length > 0 ? (
        <Section title="Still needed">
          <p className="m-0 text-[12.5px] text-ink-2">{missing.join(", ")}</p>
        </Section>
      ) : null}
    </>
  );
}

function RulesDetails({ payload }: { payload: Record<string, unknown> }): React.JSX.Element | null {
  const evaluation = payload as unknown as RuleEvaluation;
  if (typeof evaluation.outcome !== "string") return null;
  const reasons = Array.isArray(evaluation.reasons) ? evaluation.reasons : [];
  return (
    <>
      <Section title="What the rules decided">
        <p className="m-0 text-[13px] font-medium text-ink">
          {ruleOutcomeLabel(evaluation.outcome)}
          {typeof evaluation.amount === "number" ? ` — ${formatMoney(evaluation.amount)}` : ""}
        </p>
      </Section>
      {reasons.length > 0 ? (
        <Section title="Reasons">
          <ul className="m-0 grid list-none gap-1 p-0">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] text-ink-2">
                <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-line-strong" />
                {typeof r === "object" && r !== null && typeof r.description === "string"
                  ? r.description
                  : String(r)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function DraftingDetails({ payload }: { payload: Record<string, unknown> }): React.JSX.Element | null {
  const draft = payload as unknown as DecisionDraft;
  if (typeof draft.outcome !== "string") return null;
  const basis = Array.isArray(draft.decisionBasis) ? draft.decisionBasis : [];
  return (
    <>
      <Section title="Decision">
        <p className="m-0 text-[13px] font-medium text-ink">
          {outcomeHeadline(draft.outcome)}
          {typeof draft.proposedAmount === "number" ? ` — ${formatMoney(draft.proposedAmount)}` : ""}
        </p>
      </Section>
      {basis.length > 0 ? (
        <Section title="Based on">
          <ul className="m-0 grid list-none gap-1 p-0">
            {basis.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                <span aria-hidden className="size-1 shrink-0 rounded-full bg-line-strong" />
                <span className="min-w-0 flex-1">{typeof b.claim === "string" ? b.claim : ""}</span>
                {typeof b.evidenceRef === "string" ? (
                  <span className="inline-flex h-5 items-center rounded-full bg-inset px-2 text-[11px] font-medium">
                    {formatEvidenceRef(b.evidenceRef)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function CritiqueDetails({ payload }: { payload: Record<string, unknown> }): React.JSX.Element | null {
  const report = payload as unknown as CritiqueReport;
  if (typeof report.passed !== "boolean") return null;
  const findings = Array.isArray(report.findings) ? report.findings : [];
  return (
    <>
      <Section title="Result">
        <p className="m-0 text-[13px] font-medium text-ink">
          {report.passed ? "The draft passed the checks." : "The checks flagged issues."}
        </p>
      </Section>
      {findings.length > 0 ? (
        <Section title="Findings">
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {findings.map((f, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-[12.5px] text-ink-2">
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${
                    f.severity === "error"
                      ? "bg-red-tint text-red"
                      : f.severity === "warning"
                        ? "bg-orange-tint text-orange"
                        : "bg-inset text-ink-2"
                  }`}
                >
                  {humanize(f.severity ?? "info")}
                </span>
                <span className="min-w-0 flex-1">{f.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function StageDetails({ event }: { event: TraceEvent }): React.JSX.Element {
  const payload = asRecord(event.payload);
  let details: React.ReactNode = null;
  if (payload) {
    switch (event.stage) {
      case "reading_email":
      case "generating_email":
        details = <EmailDetails payload={payload} />;
        break;
      case "extracting_claims":
        details = <ClaimsDetails payload={payload} />;
        break;
      case "retrieving_knowledge": {
        const count =
          typeof payload.count === "number"
            ? payload.count
            : asStringArray(payload.ids).length;
        details =
          count > 0 ? (
            <Section title="Retrieved">
              <p className="m-0 text-[13px] text-ink-2">
                {count} policy {count === 1 ? "passage" : "passages"} found.
              </p>
            </Section>
          ) : null;
        break;
      }
      case "evaluating_rules":
        details = <RulesDetails payload={payload} />;
        break;
      case "drafting":
        details = <DraftingDetails payload={payload} />;
        break;
      case "critiquing":
        details = <CritiqueDetails payload={payload} />;
        break;
      case "reviewable": {
        const outcome = asString(payload.outcome);
        details = outcome ? (
          <Section title="Outcome">
            <p className="m-0 text-[13px] text-ink-2">{humanize(outcome)}</p>
          </Section>
        ) : null;
        break;
      }
      default:
        details = null;
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ToolChip functionName={event.functionName} durationMs={event.durationMs} status={event.status} />
        <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
          {formatDateTime(event.timestamp)}
        </span>
      </div>
      <Section title="Summary">
        <p className="m-0 text-[13px] text-ink-2">{event.summary}</p>
      </Section>
      {details}
      {event.error ? (
        <Section title="Error">
          <p className="m-0 text-[13px] font-medium text-red">{event.error}</p>
        </Section>
      ) : null}
      {event.recordRefs.length > 0 ? (
        <Section title="Records checked">
          <RefChips refs={event.recordRefs} />
        </Section>
      ) : null}
      {event.evidenceRefs.length > 0 ? (
        <Section title="Evidence">
          <RefChips refs={event.evidenceRefs} />
        </Section>
      ) : null}
    </>
  );
}

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
            <SheetTitle>Stage details</SheetTitle>
            <SheetDescription>
              {event ? `${stageLabel(event.stage)} · ${humanize(event.status)}` : ""}
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="grid gap-4">
            {event ? <StageDetails event={event} /> : null}
          </SheetPanel>
          <SheetFooter>
            <SheetClose render={<Button variant="secondary" />}>Close</SheetClose>
          </SheetFooter>
        </SheetPopup>
      </Sheet>
    </div>
  );
}
