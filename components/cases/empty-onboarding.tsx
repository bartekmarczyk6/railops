"use client";

import { TrainFront } from "lucide-react";

import { Button } from "../ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty.tsx";

export type EmptyOnboardingProps = {
  onCreate: () => void;
};

const TOUR_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Create a case",
    body: "Generate a synthetic rail-support case with account, ticket, payment and route records. Everything is produced locally from a random seed.",
  },
  {
    title: "Watch the agent work",
    body: "The pipeline extracts claims, checks them against the records and drafts a response. Follow every step in the structured work trace.",
  },
  {
    title: "Review and teach it",
    body: "Approve, reject or edit the draft. Your decisions feed the dashboard charts and can be saved as learning for future cases.",
  },
];

export function EmptyOnboarding({ onCreate }: EmptyOnboardingProps) {
  return (
    <section data-testid="empty-onboarding" aria-labelledby="onboarding-title">
      <Empty className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-raised)]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TrainFront />
          </EmptyMedia>
          <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
            Synthetic data only
          </p>
          <EmptyTitle id="onboarding-title">Demo Cases</EmptyTitle>
          <EmptyDescription>
            This local demo generates fresh synthetic rail-support cases so you
            can inspect how the AI Agent works, check its evidence chain and
            teach it with your reviews. No real customer data is used and
            nothing leaves your machine.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="lg" data-testid="empty-create-cta" onClick={onCreate}>
            Create demo case
          </Button>
          <ol
            aria-label="Three-step tour"
            className="grid w-full gap-3 text-left sm:grid-cols-3"
          >
            {TOUR_STEPS.map((step, idx) => (
              <li
                key={step.title}
                data-tour-step={String(idx + 1)}
                className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
                  Step {idx + 1}
                </span>
                <h3 className="text-sm font-bold text-[color:var(--text)]">
                  {step.title}
                </h3>
                <p className="text-sm text-[color:var(--text-muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
        </EmptyContent>
      </Empty>
    </section>
  );
}
