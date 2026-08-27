"use client";

import { useCallback, useState } from "react";

import { Badge } from "./reui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { ToastProvider } from "./ui/toast.tsx";
import { CaseList } from "./cases/case-list.tsx";
import { CreateCaseDialog } from "./cases/create-case-dialog.tsx";
import { EmptyOnboarding } from "./cases/empty-onboarding.tsx";
import { OutcomeDistributionChart } from "./charts/outcome-distribution-chart.tsx";
import { ReviewerAlignmentChart } from "./charts/reviewer-alignment-chart.tsx";
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

  const hasReviewed = data.alignment.length > 0;
  const isEmpty = data.cases.length === 0;

  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Badge
              variant="outline"
              radius="full"
              className="w-fit uppercase tracking-wide text-[color:var(--text-muted)]"
            >
              Synthetic data only
            </Badge>
            <h1 className="text-2xl font-bold text-[color:var(--text)]">
              Demo Cases
            </h1>
            <p className="max-w-prose text-sm text-[color:var(--text-muted)]">
              Every case below is generated locally. No real customer data is
              touched and no external actions are taken.
            </p>
          </div>
          {!isEmpty ? (
            <Button
              variant="outline"
              data-testid="header-new-case"
              onClick={() => setDialogOpen(true)}
            >
              New case
            </Button>
          ) : null}
        </header>

        {isEmpty ? (
          <EmptyOnboarding onCreate={() => setDialogOpen(true)} />
        ) : (
          <CaseList cases={data.cases} onOpen={openCase} />
        )}

        {hasReviewed ? (
          <div data-testid="dashboard-charts" className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reviewer alignment over case sequence</CardTitle>
                <CardDescription>
                  1.0 means the reviewer approved the draft unchanged, 0 means
                  it was rejected.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReviewerAlignmentChart data={data.alignment} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Outcome distribution</CardTitle>
                <CardDescription>
                  Final outcomes across all reviewed cases.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OutcomeDistributionChart data={data.outcomes} />
              </CardContent>
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
          onCaseCreated={onCaseCreated}
        />
      </main>
    </ToastProvider>
  );
}
