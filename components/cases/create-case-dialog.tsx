"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CircleCheck } from "lucide-react";

import { Shimmer } from "../beui/atoms/Shimmer.tsx";
import { Button } from "../ui/button.tsx";
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
import { toastManager } from "../ui/toast.tsx";
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
  init: { method: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

const defaultFetch: FetchImpl = (url, init) => fetch(url, init);

type FormStatus = "idle" | "loading" | "feeding" | "success" | "error";

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

export type PollCaseEmailOptions = {
  pollMs?: number;
  capMs?: number;
  shouldStop?: () => boolean;
};

/* Poll GET /api/cases/[id] until the background email generation lands
 * (email != null). Resolves true when the email appeared, false when the
 * cap was hit (the case page handles an in-flight email). */
export async function pollCaseEmail(
  fetchImpl: FetchImpl,
  caseId: string,
  options: PollCaseEmailOptions = {},
): Promise<boolean> {
  const pollMs = options.pollMs ?? 700;
  const capMs = options.capMs ?? 10_000;
  const shouldStop = options.shouldStop ?? (() => false);
  const startedAt = Date.now();
  for (;;) {
    if (shouldStop()) return false;
    try {
      const res = await fetchImpl(`/api/cases/${caseId}`, { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as { email?: unknown };
        if (data && typeof data === "object" && data.email != null) return true;
      }
    } catch {
      /* keep polling until the cap */
    }
    if (Date.now() - startedAt >= capMs) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export type CreateCaseFormProps = {
  onCreated: (caseId: string) => void;
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
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [feedDone, setFeedDone] = useState(0);

  const fetchImplRef = useRef(fetchImpl);
  fetchImplRef.current = fetchImpl;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const busy = status === "loading";
  const canSubmit = topic !== "" && truthMode !== "" && !busy;

  useEffect(() => {
    if (status !== "feeding" || createdCaseId === null) return;
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    setFeedDone(1);
    timers.push(setTimeout(() => { if (!cancelled) setFeedDone(2); }, 600));
    timers.push(setTimeout(() => { if (!cancelled) setFeedDone(3); }, 1200));
    void (async () => {
      await pollCaseEmail(fetchImplRef.current, createdCaseId, {
        shouldStop: () => cancelled,
      });
      if (cancelled) return;
      setFeedDone(4);
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setStatus("success");
          onCreatedRef.current(createdCaseId);
        }, 350),
      );
    })();
    return () => {
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
    };
  }, [status, createdCaseId]);

  if (status === "feeding") {
    return (
      <DialogPanel className="enter-fade-up flex flex-col gap-2 py-4">
        <p className="m-0 font-bold text-[color:var(--text)]">Setting up the demo case</p>
        <CreateLoadingFeed doneCount={feedDone} />
      </DialogPanel>
    );
  }

  if (status === "success") {
    return (
      <DialogPanel
        data-testid="create-success"
        className="flex flex-col items-center gap-4 py-8 text-center"
      >
        <span className="t-success-check" data-state="in" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-12"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p className="font-bold text-[color:var(--text)]">Case created</p>
        <p className="text-sm text-[color:var(--text-muted)]">
          Opening the review workspace…
        </p>
      </DialogPanel>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetchImpl("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, truthMode }),
      });
      if (!res.ok) {
        setError("Could not create the case. Please try again.");
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { caseId?: string };
      if (typeof data.caseId !== "string" || data.caseId.length === 0) {
        setError("The server did not return a case id.");
        setStatus("error");
        return;
      }
      setCreatedCaseId(data.caseId);
      setStatus("feeding");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
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
            disabled={busy}
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
            disabled={busy}
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
        <DialogClose render={<Button variant="ghost" />} disabled={busy}>
          Cancel
        </DialogClose>
        <StatefulButton
          type="submit"
          data-testid="create-submit"
          state={status === "error" ? "error" : busy ? "loading" : "idle"}
          disabled={!canSubmit}
          loadingText="Creating case"
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
  const router = useContext(AppRouterContext);
  const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navigateTimer.current) clearTimeout(navigateTimer.current);
    },
    [],
  );

  function handleCreated(caseId: string) {
    toastManager.add({
      type: "success",
      title: "Case created",
      description: "Opening the review workspace",
    });
    navigateTimer.current = setTimeout(() => {
      if (onCaseCreated) {
        onCaseCreated(caseId);
        return;
      }
      if (router) {
        router.push(`/case/${caseId}`);
      } else if (typeof window !== "undefined") {
        window.location.assign(`/case/${caseId}`);
      }
    }, 900);
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
