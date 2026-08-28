"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "./beui/atoms/Button.tsx";
import { ToastProvider } from "./ui/toast.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Button as UIButton } from "./ui/button.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { CaseList } from "./cases/case-list.tsx";
import { CreateCaseDialog } from "./cases/create-case-dialog.tsx";
import { EmptyOnboarding } from "./cases/empty-onboarding.tsx";
import { OutcomeDistributionChart } from "./charts/outcome-distribution-chart.tsx";
import { ReviewerAlignmentChart } from "./charts/reviewer-alignment-chart.tsx";
import { computeDashboardData, type DashboardData } from "../app/dashboard-data.ts";
import { clearBrowserState, readBrowserState } from "../lib/storage/browser-store.ts";
import { caseHref } from "../lib/domain/case-url.ts";
import type { AppState, StoredCase } from "../lib/storage/types.ts";

export type DashboardProps = {
  data?: DashboardData;
  onOpenCase?: (caseId: string) => void;
  onCaseCreated?: (caseId: string) => void;
};

export function Dashboard({ data: dataProp, onOpenCase, onCaseCreated }: DashboardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [browserState, setBrowserState] = useState<AppState | null>(null);

  useEffect(() => {
    setBrowserState(readBrowserState());
  }, []);

  const openCase = useCallback(
    (stored: StoredCase) => {
      if (onOpenCase) {
        onOpenCase(stored.caseId);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(caseHref(stored));
      }
    },
    [onOpenCase],
  );

  const handleCaseCreated = useCallback(
    (caseId: string) => {
      setBrowserState(readBrowserState());
      onCaseCreated?.(caseId);
    },
    [onCaseCreated],
  );

  function handleReset() {
    clearBrowserState();
    setBrowserState(readBrowserState());
  }

  const data =
    dataProp ?? (browserState ? computeDashboardData(browserState.cases) : null);

  if (!data) {
    return (
      <ToastProvider>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
          <div
            role="status"
            aria-live="polite"
            data-testid="dashboard-loading"
            className="flex flex-col gap-3 rounded-window bg-surface p-4 shadow-card"
          >
            <Skeleton className="h-12 w-full rounded-control" />
            <Skeleton className="h-12 w-full rounded-control" />
            <Skeleton className="h-12 w-full rounded-control" />
            <p className="px-1 text-sm text-ink-2">Loading demo data…</p>
          </div>
        </main>
      </ToastProvider>
    );
  }

  const hasReviewed = data.alignment.length > 0;
  const isEmpty = data.cases.length === 0;

  return (
    <ToastProvider>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-[15px] font-semibold tracking-tight text-ink">
              KOLEO RailOps
            </p>
            <p className="text-[13px] text-ink-2">
              Synthetic data only — no real customer data is used.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              data-testid="header-reset"
              onClick={() => setResetOpen(true)}
            >
              Reset demo data
            </Button>
            <Button
              variant="accent"
              data-testid="header-new-case"
              onClick={() => setDialogOpen(true)}
            >
              Create demo case
            </Button>
          </div>
        </header>

        {isEmpty ? (
          <EmptyOnboarding onCreate={() => setDialogOpen(true)} />
        ) : (
          <section aria-labelledby="cases-title" className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2 px-1">
              <h1
                id="cases-title"
                className="font-display text-xl font-semibold tracking-tight text-ink"
              >
                Demo Cases
              </h1>
              <span className="font-mono text-[13px] text-ink-2 tabular-nums">
                {data.stats.total}
              </span>
            </div>
            <CaseList cases={data.cases} onOpen={openCase} />
          </section>
        )}

        {hasReviewed ? (
          <section
            data-testid="dashboard-charts"
            aria-label="Review insights"
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="flex flex-col gap-4 rounded-window bg-surface p-5 shadow-card">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-ink">
                  Reviewer alignment over case sequence
                </h2>
                <p className="text-[13px] text-ink-2">
                  1.0 means the reviewer approved the draft unchanged, 0 means
                  it was rejected.
                </p>
              </div>
              <ReviewerAlignmentChart data={data.alignment} />
            </div>
            <div className="flex flex-col gap-4 rounded-window bg-surface p-5 shadow-card">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-ink">
                  Outcome distribution
                </h2>
                <p className="text-[13px] text-ink-2">
                  Final outcomes across all reviewed cases.
                </p>
              </div>
              <OutcomeDistributionChart data={data.outcomes} />
            </div>
          </section>
        ) : !isEmpty ? (
          <p
            data-testid="dashboard-charts-empty"
            className="rounded-window border border-dashed border-line-strong bg-surface p-4 text-sm text-ink-2"
          >
            Charts will appear after you review your first case.
          </p>
        ) : null}

        <CreateCaseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCaseCreated={handleCaseCreated}
        />

        <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes all cases and reviews stored in your browser. This
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<UIButton variant="outline" />} data-action="cancel-reset">
                Cancel
              </AlertDialogClose>
              <UIButton
                variant="destructive"
                data-action="confirm-reset"
                onClick={() => {
                  handleReset();
                  setResetOpen(false);
                }}
              >
                Reset
              </UIButton>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </main>
    </ToastProvider>
  );
}
