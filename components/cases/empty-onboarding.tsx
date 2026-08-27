"use client";

import { Button } from "../beui/atoms/Button.tsx";

export type EmptyOnboardingProps = {
  onCreate: () => void;
};

const TOUR_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Create a case",
    body: "Generate a synthetic rail-support case with account, ticket, payment and route records, produced locally from a random seed.",
  },
  {
    title: "Watch the agent work",
    body: "The pipeline extracts claims, checks them against the records and drafts a response. Follow every step in the work trace.",
  },
  {
    title: "Review and teach it",
    body: "Approve, reject or edit the draft. Your decisions feed the dashboard charts and can be saved as learning for future cases.",
  },
];

export function EmptyOnboarding({ onCreate }: EmptyOnboardingProps) {
  return (
    <section
      data-testid="empty-onboarding"
      aria-labelledby="onboarding-title"
      className="flex flex-col items-center gap-10 py-14 text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-inset px-3 py-1 text-[13px] font-medium text-ink-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-(--accent)" />
          Synthetic data only
        </span>
        <p className="text-sm font-medium text-ink-2">Demo Cases</p>
        <h1
          id="onboarding-title"
          className="font-display text-3xl font-semibold tracking-tight text-ink"
        >
          Review AI-handled support cases
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-2">
          Generate a fresh synthetic rail-support case, inspect how the agent
          works through it, and teach it with your review. Nothing leaves your
          machine.
        </p>
        <Button
          variant="accent"
          data-testid="empty-create-cta"
          onClick={onCreate}
          className="mt-1"
        >
          Create demo case
        </Button>
      </div>

      <ol
        aria-label="Three-step tour"
        className="grid w-full max-w-4xl gap-3 text-left sm:grid-cols-3"
      >
        {TOUR_STEPS.map((step, idx) => (
          <li
            key={step.title}
            data-tour-step={String(idx + 1)}
            className="flex flex-col gap-1.5 rounded-card bg-surface p-5 shadow-card"
          >
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-accent-tint font-mono text-xs font-medium text-accent-ink tabular-nums"
            >
              {idx + 1}
            </span>
            <h2 className="mt-1 text-sm font-semibold text-ink">{step.title}</h2>
            <p className="text-sm leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
