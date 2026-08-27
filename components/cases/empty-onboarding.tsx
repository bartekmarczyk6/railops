"use client";

import { Button } from "../ui/button.tsx";

export type EmptyOnboardingProps = {
  onCreate: () => void;
};

const TOUR_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Create a synthetic case",
    body: "Generate a self-contained support case with account, ticket, payment, route and email data. No real customer data is used.",
  },
  {
    title: "Run and review",
    body: "The pipeline produces an evidence-backed draft. Inspect records, claims, and the structured work trace, then approve, reject, or edit.",
  },
  {
    title: "Watch the dashboard learn",
    body: "After reviews, the dashboard surfaces reviewer alignment and outcome distribution across your local cases.",
  },
];

export function EmptyOnboarding({ onCreate }: EmptyOnboardingProps) {
  return (
    <section
      data-testid="empty-onboarding"
      aria-labelledby="onboarding-title"
      className={
        "flex flex-col gap-6 rounded-[var(--radius-md)] " +
        "border border-[color:var(--border)] bg-[color:var(--surface-raised)] p-6"
      }
    >
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
          Synthetic data only
        </p>
        <h2 id="onboarding-title" className="text-2xl font-bold text-[color:var(--text)]">
          Demo Cases
        </h2>
        <p className="max-w-prose text-sm text-[color:var(--text-muted)]">
          This local demo generates a fresh synthetic rail-support case so you can
          inspect the AI Agent work, evidence chain and reviewer learning. Nothing
          here is real customer data and no actions leave your machine.
        </p>
      </header>
      <div>
        <Button data-testid="empty-create-cta" onClick={onCreate}>
          Create demo case
        </Button>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="Three-step tour">
        {TOUR_STEPS.map((step, idx) => (
          <li
            key={step.title}
            data-tour-step={String(idx + 1)}
            className={
              "flex flex-col gap-1 rounded-[var(--radius-md)] " +
              "border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            }
          >
            <span className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
              Step {idx + 1}
            </span>
            <h3 className="text-sm font-bold text-[color:var(--text)]">{step.title}</h3>
            <p className="text-sm text-[color:var(--text-muted)]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
