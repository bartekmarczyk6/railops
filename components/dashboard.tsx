"use client";

import { useCallback, useState } from "react";
import { Card, CardHeader, CardTitle } from "./ui/card.tsx";
import { EmptyOnboarding } from "./cases/empty-onboarding.tsx";
import { CreateCaseDialog } from "./cases/create-case-dialog.tsx";
import { CaseList } from "./cases/case-list.tsx";
import { ReviewerAlignmentChart } from "./charts/reviewer-alignment-chart.tsx";
import { OutcomeDistributionChart } from "./charts/outcome-distribution-chart.tsx";
import { pushToast, Toast } from "./ui/toast.tsx";
import type { DashboardData } from "../app/dashboard-data.ts";

export type DashboardProps = {
  data: DashboardData;
  onOpenCase?: (caseId: string) => void;
  onCaseCreated?: (caseId: string) => void;
};

export function Dashboard({ data, onOpenCase, onCaseCreated }: DashboardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCase = useCallback(
    (id: string) => {
      if (onOpenCase) {
        onOpenCase(id);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(`/case/${id}`);
      }
    },
    [onOpenCase],
  );

  const handleCreated = useCallback(
    (caseId: string) => {
      pushToast("Case created. Opening review workspace");
      if (onCaseCreated) {
        onCaseCreated(caseId);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(`/case/${caseId}`);
      }
    },
    [onCaseCreated],
  );

  const hasReviewed = data.alignment.length > 0;
  const isEmpty = data.cases.length === 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6 motion-reduce:transition-none">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
          Synthetic data only
        </p>
        <h1 className="text-2xl font-bold text-[color:var(--text)]">Demo Cases</h1>
        <p className="max-w-prose text-sm text-[color:var(--text-muted)]">
          Every case below is generated locally. No real customer data is touched
          and no external actions are taken.
        </p>
      </header>

      {isEmpty ? (
        <EmptyOnboarding onCreate={() => setDialogOpen(true)} />
      ) : (
        <CaseList cases={data.cases} onOpen={openCase} />
      )}

      {hasReviewed ? (
        <div
          data-testid="dashboard-charts"
          className="grid gap-4 md:grid-cols-2"
        >
          <Card>
            <CardHeader>
              <CardTitle>Reviewer activity</CardTitle>
            </CardHeader>
            <ReviewerAlignmentChart data={data.alignment} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Outcome mix</CardTitle>
            </CardHeader>
            <OutcomeDistributionChart data={data.outcomes} />
          </Card>
        </div>
      ) : !isEmpty ? (
        <p
          data-testid="dashboard-charts-empty"
          className={
            "rounded-[var(--radius-md)] border border-dashed " +
            "border-[color:var(--border)] bg-[color:var(--surface-raised)] p-4 " +
            "text-sm text-[color:var(--text-muted)]"
          }
        >
          Charts will appear after you review your first case.
        </p>
      ) : null}

      <CreateCaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
      <Toast />
    </main>
  );
}
