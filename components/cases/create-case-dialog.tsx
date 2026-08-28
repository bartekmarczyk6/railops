"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";

import { Shimmer } from "../beui/atoms/Shimmer.tsx";
import { Button } from "../ui/button.tsx";
import { createDemoCase } from "../../lib/domain/case-factory.ts";
import type { DemoCasePackage } from "../../lib/domain/types.ts";
import type { EmailDraft } from "../../lib/llm/types.ts";
import { isCaseTopic, isTruthMode } from "../../app/api/_shared/validation.ts";
import { updateBrowserState } from "../../lib/storage/browser-store.ts";
import type { StoredCase } from "../../lib/storage/types.ts";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog.tsx";
import { Field, FieldLabel } from "../ui/field.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select.tsx";
import { StatefulButton } from "../motion/button/stateful.tsx";

export type TopicOption = {
  value: string;
  label: string;
  description: string;
};

export const TOPIC_OPTIONS: ReadonlyArray<TopicOption> = [
  {
    value: "delay_refund",
    label: "Delay refund",
    description: "The train arrived late and the passenger claims compensation.",
  },
  {
    value: "cancelled_train_refund",
    label: "Cancelled train refund",
    description: "The train was cancelled and the passenger wants the fare back.",
  },
  {
    value: "missed_connection",
    label: "Missed connection",
    description: "A delayed first leg made the passenger miss a transfer.",
  },
  {
    value: "ticket_change",
    label: "Ticket change",
    description: "The passenger wants to move the ticket to another day or time.",
  },
  {
    value: "passenger_name_change",
    label: "Passenger name change",
    description: "The passenger asks to correct the name on the ticket.",
  },
  {
    value: "missing_refund",
    label: "Missing refund",
    description: "A refund was promised but the passenger says it never arrived.",
  },
  {
    value: "payment_without_ticket",
    label: "Payment without ticket",
    description: "The account was charged but no ticket was ever issued.",
  },
  {
    value: "validation_discount_penalty",
    label: "Validation discount penalty",
    description: "A penalty fare is disputed over an unvalidated discount.",
  },
];

export const TRUTH_MODE_OPTIONS: ReadonlyArray<TopicOption> = [
  {
    value: "supported_by_records",
    label: "Supported by records",
    description: "The claim matches the ticket, payment and operations records.",
  },
  {
    value: "fabricated_delay",
    label: "Fabricated delay",
    description: "The claimed delay does not match the real operations data.",
  },
  {
    value: "fraud_attempt",
    label: "Fraud attempt",
    description: "Records contradict the claim and show fraud indicators.",
  },
  {
    value: "insufficient_information",
    label: "Insufficient information",
    description: "Key records are missing, so the claim cannot be verified.",
  },
];

type FetchImpl = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

const defaultFetch: FetchImpl = (url, init) => fetch(url, init);

type FormStatus = "idle" | "feeding" | "error";

export const CREATE_FEED_LINES: ReadonlyArray<string> = [
  "Creating passenger profile…",
  "Booking tickets and charging the card…",
  "Watching the train boards…",
  "Passenger is writing an email…",
];

export type CreateLoadingFeedProps = {
  doneCount: number;
};

export function CreateLoadingFeed({ doneCount }: CreateLoadingFeedProps): React.JSX.Element {
  return (
    <div data-testid="create-loading" role="status" aria-live="polite" className="grid gap-2.5 py-2">
      {CREATE_FEED_LINES.map((line, index) => {
        const done = index < doneCount;
        const active = index === doneCount;
        const state = done ? "done" : active ? "active" : "pending";
        return (
          <div
            key={line}
            data-feed-line={index}
            data-line-state={state}
            className="flex items-center gap-2.5 text-[13px]"
          >
            {done ? (
              <span className="enter-pop flex size-4 shrink-0 items-center justify-center text-green">
                <CircleCheck className="size-4" />
              </span>
            ) : active ? (
              <span className="flex size-4 shrink-0 items-center justify-center">
                <span
                  aria-hidden
                  className="size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 motion-reduce:animate-none"
                  style={{ animation: "spin 700ms linear infinite" }}
                />
              </span>
            ) : (
              <span aria-hidden className="size-4 shrink-0" />
            )}
            {active ? (
              <Shimmer>{line}</Shimmer>
            ) : (
              <span className={done ? "text-ink-2" : "text-ink-3"}>{line}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type CreateCaseFormProps = {
  onCreated: (stored: StoredCase) => void;
  fetchImpl?: FetchImpl;
  initialTopic?: string;
  initialTruthMode?: string;
};

export function CreateCaseForm({
  onCreated,
  fetchImpl = defaultFetch,
  initialTopic = "",
  initialTruthMode = "",
}: CreateCaseFormProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [truthMode, setTruthMode] = useState(initialTruthMode);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ seed: number; pkg: DemoCasePackage } | null>(null);
  const [feedDone, setFeedDone] = useState(0);

  const fetchImplRef = useRef(fetchImpl);
  fetchImplRef.current = fetchImpl;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const canSubmit = topic !== "" && truthMode !== "";

  useEffect(() => {
    if (status !== "feeding" || pending === null) return;
    let cancelled = false;
    const controller = new AbortController();
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const { seed, pkg } = pending;
    setFeedDone(1);
    timers.push(setTimeout(() => { if (!cancelled) setFeedDone(2); }, 600));
    timers.push(setTimeout(() => { if (!cancelled) setFeedDone(3); }, 1200));
    void (async () => {
      try {
        const res = await fetchImplRef.current("/api/cases/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic: pkg.topic, truthMode: pkg.truthMode, seed }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? `Email generation failed (${res.status})`);
        }
        const data = (await res.json()) as { email?: EmailDraft | null };
        if (!data.email) {
          throw new Error("The server did not return an email.");
        }
        if (cancelled) return;
        const now = new Date().toISOString();
        const stored: StoredCase = {
          caseId: pkg.id,
          topic: pkg.topic,
          truthMode: pkg.truthMode,
          state: "created",
          createdAt: now,
          updatedAt: now,
          seed,
          pkg,
          trace: [],
          reviewHistory: [],
          learningRef: null,
          email: {
            from: pkg.account.email,
            subject: data.email.subject,
            body: data.email.body,
            mentionedFacts: data.email.mentionedFacts,
            receivedAt: now,
          },
          emailError: null,
          supplements: {},
          version: 1,
        };
        updateBrowserState((s) => ({ ...s, cases: [...s.cases, stored] }));
        setFeedDone(4);
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            onCreatedRef.current(stored);
          }, 350),
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof TypeError) {
          setError("Network error. Please try again.");
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [status, pending]);

  if (status === "feeding") {
    return (
      <DialogPanel className="enter-fade-up flex flex-col gap-2 py-4">
        <p className="m-0 font-bold text-[color:var(--text)]">Setting up the demo case</p>
        <CreateLoadingFeed doneCount={feedDone} />
      </DialogPanel>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (!isCaseTopic(topic) || !isTruthMode(truthMode)) return;
    setError(null);
    const seed = Math.floor(Math.random() * 2 ** 31);
    const pkg = createDemoCase({ topic, truthMode, seed });
    setPending({ seed, pkg });
    setStatus("feeding");
  }

  return (
    <form className="contents" onSubmit={handleSubmit} data-testid="create-case-form">
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Topic</FieldLabel>
          <Select
            items={TOPIC_OPTIONS}
            value={topic === "" ? null : topic}
            onValueChange={(value: string | null) => setTopic(value ?? "")}
            name="topic"
          >
            <SelectTrigger data-testid="topic-select" data-select-for="topic">
              <SelectValue placeholder="Choose a topic" />
            </SelectTrigger>
            <SelectPopup>
              {TOPIC_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="flex flex-col gap-0.5">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Truth mode</FieldLabel>
          <Select
            items={TRUTH_MODE_OPTIONS}
            value={truthMode === "" ? null : truthMode}
            onValueChange={(value: string | null) => setTruthMode(value ?? "")}
            name="truthMode"
          >
            <SelectTrigger data-testid="truthmode-select" data-select-for="truthMode">
              <SelectValue placeholder="Choose a truth mode" />
            </SelectTrigger>
            <SelectPopup>
              {TRUTH_MODE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <span className="flex flex-col gap-0.5">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-[color:var(--error)]">
            {error}
          </p>
        ) : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>
          Cancel
        </DialogClose>
        <StatefulButton
          type="submit"
          data-testid="create-submit"
          state={status === "error" ? "error" : "idle"}
          disabled={!canSubmit}
          errorText="Try again"
        >
          Create case
        </StatefulButton>
      </DialogFooter>
    </form>
  );
}

export type CreateCaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaseCreated?: (caseId: string) => void;
  fetchImpl?: FetchImpl;
};

export function CreateCaseDialog({
  open,
  onOpenChange,
  onCaseCreated,
  fetchImpl,
}: CreateCaseDialogProps) {
  function handleCreated(stored: StoredCase) {
    onCaseCreated?.(stored.caseId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Create demo case</DialogTitle>
          <DialogDescription>
            Pick a topic and a truth mode. A synthetic case is generated locally.
          </DialogDescription>
        </DialogHeader>
        <CreateCaseForm onCreated={handleCreated} fetchImpl={fetchImpl} />
      </DialogPopup>
    </Dialog>
  );
}
