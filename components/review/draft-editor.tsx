"use client";

import React from "react";
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
import type { DecisionDraft, DecisionOutcome } from "@/lib/llm/types.ts";
import { OUTCOME_LABEL } from "./formatters.ts";

export type DraftEditorProps = {
  draft: DecisionDraft;
  onChange: (next: DecisionDraft) => void;
};

const OUTCOMES = Object.keys(OUTCOME_LABEL) as DecisionOutcome[];

export function DraftEditor({ draft, onChange }: DraftEditorProps): React.JSX.Element {
  return (
    <div data-component="draft-editor" className="grid gap-3">
      <Field>
        <FieldLabel>Outcome</FieldLabel>
        <Select
          value={draft.outcome}
          onValueChange={(v) => onChange({ ...draft, outcome: v as DecisionOutcome })}
        >
          <SelectTrigger data-field="draft-outcome">
            <SelectValue>{OUTCOME_LABEL[draft.outcome]}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {OUTCOMES.map((outcome) => (
              <SelectItem key={outcome} value={outcome}>
                {OUTCOME_LABEL[outcome]}
              </SelectItem>
            ))}
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
            onChange({
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
          onChange={(e) => onChange({ ...draft, response: e.currentTarget.value })}
          rows={6}
        />
      </Field>
    </div>
  );
}
