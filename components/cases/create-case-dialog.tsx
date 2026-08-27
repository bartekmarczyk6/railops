"use client";

import { useEffect, useState } from "react";
import { Dialog } from "../ui/dialog.tsx";
import { Field } from "../ui/field.tsx";
import { Select } from "../ui/select.tsx";
import { Button } from "../ui/button.tsx";

const TOPIC_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Choose a topic" },
  { value: "delay_refund", label: "Delay refund" },
  { value: "cancelled_train_refund", label: "Cancelled train refund" },
  { value: "missed_connection", label: "Missed connection" },
  { value: "ticket_change", label: "Ticket change" },
  { value: "passenger_name_change", label: "Passenger name change" },
  { value: "missing_refund", label: "Missing refund" },
  { value: "payment_without_ticket", label: "Payment without ticket" },
  { value: "validation_discount_penalty", label: "Validation discount penalty" },
];

const TRUTH_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Choose a truth mode" },
  { value: "supported_by_records", label: "Supported by records" },
  { value: "fabricated_delay", label: "Fabricated delay" },
  { value: "fraud_attempt", label: "Fraud attempt" },
  { value: "insufficient_information", label: "Insufficient information" },
];

export type CreateCaseDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated: (caseId: string) => void;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;
};

const defaultFetch: NonNullable<CreateCaseDialogProps["fetchImpl"]> = (url, init) =>
  fetch(url, init);

export function CreateCaseDialog({
  open: controlledOpen,
  onOpenChange,
  onCreated,
  fetchImpl = defaultFetch,
}: CreateCaseDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [topic, setTopic] = useState("");
  const [truthMode, setTruthMode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTopic("");
      setTruthMode("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = topic !== "" && truthMode !== "" && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchImpl("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, truthMode }),
      });
      if (!res.ok) {
        setError("Could not create the case. Please try again.");
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { caseId?: string };
      if (typeof data.caseId !== "string" || data.caseId.length === 0) {
        setError("The server did not return a case id.");
        setSubmitting(false);
        return;
      }
      setOpen(false);
      onCreated(data.caseId);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Create demo case"
      description="Pick a topic and truth mode. A synthetic case is generated locally."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="create-case-form">
        <Field id="topic" label="Topic">
          <Select
            id="topic"
            data-testid="topic-select"
            data-select-for="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={submitting}
            aria-label="Case topic"
          >
            {TOPIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="truthMode" label="Truth mode">
          <Select
            id="truthMode"
            data-testid="truthmode-select"
            data-select-for="truthMode"
            value={truthMode}
            onChange={(e) => setTruthMode(e.target.value)}
            disabled={submitting}
            aria-label="Case truth mode"
          >
            {TRUTH_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-[color:var(--error)]">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            data-testid="create-submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
          >
            {submitting ? "Creating" : "Create case"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export { TOPIC_OPTIONS, TRUTH_MODE_OPTIONS };
