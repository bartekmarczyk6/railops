"use client";

import React from "react";
import { useEffect, useRef } from "react";
import { Card, CardHeader, CardDescription, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DecisionDraft, EmailDraft, ExtractedClaims } from "@/lib/llm/types.ts";
import { cn } from "@/lib/utils";

export type EmailPanelProps = {
  email: EmailDraft;
  claims: ExtractedClaims;
  decision: DecisionDraft;
  editing: boolean;
  editedDraft: DecisionDraft | null;
  onChangeEditedDraft: (next: DecisionDraft) => void;
};

const OUTCOME_LABEL: Record<DecisionDraft["outcome"], string> = {
  refund: "Refund",
  change: "Change",
  follow_up: "Follow-up",
  unsupported_or_escalate: "Escalate",
  information: "Information",
};

function readMs(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(v) ? v : fallback;
}

function StreamingText({ text, className }: { text: string; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const block = ref.current;
    if (!block) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const words = text.trim().split(/\s+/);
    block.textContent = "";
    const spans = words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "t-stream-w is-in";
      s.textContent = w;
      block.appendChild(s);
      if (i < words.length - 1) block.appendChild(document.createTextNode(" "));
      return s;
    });
    const gap = readMs("--stream-gap", 60);
    let cancelled = false;
    const timers: number[] = [];
    spans.forEach((s) => {
      s.style.transition = "none";
      s.classList.remove("is-in");
    });
    void block.offsetWidth;
    spans.forEach((s) => {
      s.style.transition = "";
    });
    const next = (n: number) => {
      if (cancelled || n >= spans.length) return;
      spans[n].classList.add("is-in");
      timers.push(window.setTimeout(() => next(n + 1), gap));
    };
    next(0);
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [text]);

  return (
    <div ref={ref} data-field="inbound-body" className={cn("t-stream whitespace-pre-wrap", className)}>
      {text}
    </div>
  );
}

export function EmailPanel({
  email,
  claims,
  decision,
  editing,
  editedDraft,
  onChangeEditedDraft,
}: EmailPanelProps): React.JSX.Element {
  const draft = editedDraft ?? decision;
  return (
    <Card data-component="email-panel" data-section="email">
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>Inbound message, extracted claims, and the draft response.</CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <article data-field="inbound" aria-label="Inbound email" className="grid gap-2">
          <h3 className="m-0 text-sm font-medium">Inbound email (read-only)</h3>
          <p data-field="inbound-subject" className="m-0 font-bold">
            {email.subject}
          </p>
          <div
            className="rounded-md border p-3"
            style={{ background: "var(--surface-sunken)" }}
          >
            <StreamingText text={email.body} className="font-sans text-sm" />
          </div>
          {email.mentionedFacts.length > 0 ? (
            <p data-field="mentioned-facts" className="m-0">
              Mentioned:{" "}
              {email.mentionedFacts.map((f) => (
                <code key={f} data-record-ref={f} className="me-2 font-mono text-xs">
                  {f}
                </code>
              ))}
            </p>
          ) : null}
        </article>
        <article data-field="claims" aria-label="Extracted claims" className="grid gap-2">
          <h3 className="m-0 text-sm font-medium">Extracted claims</h3>
          <ul className="m-0 grid gap-1 ps-4">
            {claims.claims.map((c, i) => (
              <li
                key={i}
                data-record-ref={c.ticketNumber ? `record:ticket:${c.ticketNumber}` : undefined}
              >
                <strong>{c.kind}:</strong> {c.description}
                {c.value !== null && c.value !== undefined ? <> (value={String(c.value)})</> : null}
              </li>
            ))}
          </ul>
          {claims.missingFields.length > 0 ? (
            <p data-field="missing-fields-inline" className="m-0">
              Missing: {claims.missingFields.join(", ")}
            </p>
          ) : null}
        </article>
        <article data-field="draft-response" aria-label="Draft response" className="grid gap-2">
          <h3 className="m-0 text-sm font-medium">
            {editing ? "Draft response (editing)" : "Draft response"}
          </h3>
          {editing ? (
            <div className="grid gap-3">
              <Field>
                <FieldLabel>Outcome</FieldLabel>
                <Select
                  value={draft.outcome}
                  onValueChange={(v) =>
                    onChangeEditedDraft({ ...draft, outcome: v as DecisionDraft["outcome"] })
                  }
                >
                  <SelectTrigger data-field="draft-outcome">
                    <SelectValue>{OUTCOME_LABEL[draft.outcome]}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="change">Change</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="unsupported_or_escalate">Escalate</SelectItem>
                    <SelectItem value="information">Information</SelectItem>
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Proposed amount</FieldLabel>
                <Input
                  data-field="draft-amount"
                  type="number"
                  inputMode="decimal"
                  nativeInput
                  value={draft.proposedAmount ?? ""}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    const next = raw === "" ? null : Number(raw);
                    onChangeEditedDraft({
                      ...draft,
                      proposedAmount: next !== null && Number.isFinite(next) ? next : null,
                    });
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>Response text</FieldLabel>
                <Textarea
                  data-field="draft-response-text"
                  value={draft.response}
                  onChange={(e) => onChangeEditedDraft({ ...draft, response: e.currentTarget.value })}
                  rows={6}
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-1">
              <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
                {OUTCOME_LABEL[draft.outcome]}
                {draft.proposedAmount !== null ? ` · ${draft.proposedAmount}` : ""}
              </p>
              <p data-field="draft-response-text" className="m-0 whitespace-pre-wrap">
                {draft.response}
              </p>
            </div>
          )}
        </article>
      </CardPanel>
    </Card>
  );
}
