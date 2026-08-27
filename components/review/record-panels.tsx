"use client";

import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AccountRecord,
  DemoCasePackage,
  DisruptionRecord,
  PaymentRecord,
  RouteRecord,
  TicketRecord,
} from "@/lib/domain/types.ts";

export type RecordPanelsProps = {
  pkg: DemoCasePackage;
  priorHistory: Array<{
    caseId: string;
    topic: string;
    state: string;
    updatedAt: string;
  }>;
};

const ALL_PANELS = [
  "account",
  "tickets",
  "passengers",
  "payments",
  "route",
  "disruption",
  "history",
];

export function RecordPanels({ pkg, priorHistory }: RecordPanelsProps): React.JSX.Element {
  return (
    <section data-section="records" className="grid gap-2">
      <h2 className="m-0">Synthetic records</h2>
      <Accordion
        multiple
        defaultValue={ALL_PANELS}
        data-component="record-panels"
        className="rounded-2xl border bg-card px-4"
      >
        <AccordionItem value="account">
          <AccordionTrigger className="min-h-11">Account</AccordionTrigger>
          <AccordionPanel>
            <AccountPanel account={pkg.account} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="tickets">
          <AccordionTrigger className="min-h-11">Tickets ({pkg.tickets.length})</AccordionTrigger>
          <AccordionPanel>
            <TicketsPanel tickets={pkg.tickets} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="passengers">
          <AccordionTrigger className="min-h-11">Passengers</AccordionTrigger>
          <AccordionPanel>
            <PassengersPanel tickets={pkg.tickets} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="payments">
          <AccordionTrigger className="min-h-11">Payments ({pkg.payments.length})</AccordionTrigger>
          <AccordionPanel>
            <PaymentsPanel payments={pkg.payments} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="route">
          <AccordionTrigger className="min-h-11">Route</AccordionTrigger>
          <AccordionPanel>
            <RoutePanel route={pkg.route} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="disruption">
          <AccordionTrigger className="min-h-11">Disruption</AccordionTrigger>
          <AccordionPanel>
            <DisruptionPanel disruption={pkg.disruption} />
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="history">
          <AccordionTrigger className="min-h-11">Prior refund / change history</AccordionTrigger>
          <AccordionPanel>
            <PriorHistoryPanel history={priorHistory} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function AccountPanel({ account }: { account: AccountRecord }): React.JSX.Element {
  return (
    <Table data-role="record-table">
      <TableBody>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableCell data-record-ref={`record:account:${account.id}`} data-field="email">
            {account.email}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableCell data-field="full-name">{account.fullName}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableCell data-field="status">{account.status}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Prior cases</TableHead>
          <TableCell data-field="prior-case-count">{account.priorCaseCount}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Created</TableHead>
          <TableCell data-field="created-at">{account.createdAt}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function TicketsPanel({ tickets }: { tickets: TicketRecord[] }): React.JSX.Element {
  return (
    <div className="grid gap-3">
      {tickets.map((t) => (
        <Table key={t.id} data-record-ref={`record:ticket:${t.id}`} data-role="record-table">
          <TableBody>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableCell data-field="number">{t.number}</TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Train / seat</TableHead>
              <TableCell data-field="train-seat">
                {t.train} / {t.carriage} / {t.seat}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Departure</TableHead>
              <TableCell data-field="departure">{t.departureScheduled}</TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Arrival</TableHead>
              <TableCell data-field="arrival">{t.arrivalScheduled}</TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableCell data-field="direction">{t.direction}</TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Relief</TableHead>
              <TableCell data-field="relief">{t.relief}</TableCell>
            </TableRow>
            <TableRow>
              <TableHead>Price</TableHead>
              <TableCell data-field="price">
                {t.paidPrice} {t.currency}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableHead>History</TableHead>
              <TableCell data-field="history">
                <ul className="m-0 ps-4">
                  {t.history.map((h, i) => (
                    <li key={i} data-record-ref={`record:ticket:${t.id}`}>
                      {h.type} @ {h.timestamp}
                      {h.note ? ` (${h.note})` : ""}
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ))}
    </div>
  );
}

function PassengersPanel({ tickets }: { tickets: TicketRecord[] }): React.JSX.Element {
  return (
    <ul className="m-0 ps-4">
      {tickets.flatMap((t) =>
        t.passengers.map((p) => (
          <li key={p.id} data-record-ref={`record:passenger:${p.id}`} data-field="passenger">
            {p.fullName} (ticket {t.number})
          </li>
        )),
      )}
    </ul>
  );
}

function PaymentsPanel({ payments }: { payments: PaymentRecord[] }): React.JSX.Element {
  return (
    <Table data-role="record-table">
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id} data-record-ref={`record:payment:${p.id}`}>
            <TableCell data-field="id">{p.id}</TableCell>
            <TableCell data-field="amount">
              {p.amount} {p.currency}
            </TableCell>
            <TableCell data-field="method">{p.method}</TableCell>
            <TableCell data-field="status">{p.status}</TableCell>
            <TableCell data-field="created">{p.createdAt}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RoutePanel({ route }: { route: RouteRecord }): React.JSX.Element {
  return (
    <Table data-role="record-table">
      <TableBody>
        <TableRow>
          <TableHead>Origin → Destination</TableHead>
          <TableCell data-record-ref={`record:route:${route.id}`} data-field="route">
            {route.origin} → {route.destination}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Scheduled</TableHead>
          <TableCell data-field="scheduled">
            {route.scheduledDeparture} → {route.scheduledArrival}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Actual</TableHead>
          <TableCell data-field="actual">
            {route.actualDeparture ?? "—"} → {route.actualArrival ?? "—"}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Operator</TableHead>
          <TableCell data-field="operator">{route.operator}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function DisruptionPanel({ disruption }: { disruption: DisruptionRecord | null }): React.JSX.Element {
  if (!disruption) {
    return (
      <p data-field="none" className="m-0">
        No disruption recorded.
      </p>
    );
  }
  return (
    <Table data-record-ref={`record:disruption:${disruption.id}`} data-role="record-table">
      <TableBody>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableCell data-field="type">{disruption.type}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Scheduled delay</TableHead>
          <TableCell data-field="scheduled-delay">{disruption.scheduledDelayMinutes} min</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Actual delay</TableHead>
          <TableCell data-field="actual-delay">{disruption.actualDelayMinutes} min</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Cause</TableHead>
          <TableCell data-field="cause">{disruption.cause}</TableCell>
        </TableRow>
        <TableRow>
          <TableHead>Reported</TableHead>
          <TableCell data-field="reported">{disruption.reportedAt}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function PriorHistoryPanel({
  history,
}: {
  history: Array<{ caseId: string; topic: string; state: string; updatedAt: string }>;
}): React.JSX.Element {
  if (history.length === 0) {
    return (
      <p data-field="none" className="m-0">
        No prior cases for this account.
      </p>
    );
  }
  return (
    <ul className="m-0 ps-4">
      {history.map((h, i) => (
        <li key={i} data-record-ref={`record:case:${h.caseId}`}>
          {h.topic} ({h.state}) @ {h.updatedAt}
        </li>
      ))}
    </ul>
  );
}
