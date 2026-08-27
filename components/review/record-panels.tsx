"use client";

import React from "react";
import { useRef } from "react";
import { CircleCheck } from "lucide-react";
import { topicLabel } from "@/components/cases/case-list.tsx";
import type {
  AccountRecord,
  DemoCasePackage,
  DisruptionRecord,
  PaymentRecord,
  RouteRecord,
  TicketRecord,
} from "@/lib/domain/types.ts";
import { formatDateTime, formatMoney, humanize } from "./formatters.ts";

export type RecordPanelsProps = {
  pkg: DemoCasePackage;
  priorHistory: Array<{
    caseId: string;
    topic: string;
    state: string;
    updatedAt: string;
  }>;
  verified?: boolean;
};

function Row({
  label,
  field,
  refValue,
  children,
}: {
  label: string;
  field?: string;
  refValue?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="shrink-0 text-[12.5px] text-ink-3">{label}</span>
      <span
        data-field={field}
        data-record-ref={refValue}
        className="min-w-0 text-right text-[13px] font-medium text-ink"
      >
        {children}
      </span>
    </div>
  );
}

function RecordGroup({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid gap-1">
      <h3 className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        {title}
        {count !== undefined ? (
          <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11px] font-medium tabular-nums text-ink-2">
            {count}
          </span>
        ) : null}
      </h3>
      <div className="rounded-control px-3 shadow-hairline">{children}</div>
    </div>
  );
}

export function RecordPanels({
  pkg,
  priorHistory,
  verified = true,
}: RecordPanelsProps): React.JSX.Element {
  const verifyFlip = useRef({ prev: verified, hit: false });
  if (verified && !verifyFlip.current.prev) verifyFlip.current.hit = true;
  verifyFlip.current.prev = verified;
  return (
    <section
      data-component="record-panels"
      data-section="records"
      aria-label="Passenger file"
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 font-display text-[14px] font-semibold text-ink">Passenger file</h2>
        {verified ? (
          <span
            data-field="verified"
            className={`inline-flex h-6 items-center gap-1.5 rounded-full bg-green-tint px-2.5 text-[12px] font-medium text-green${
              verifyFlip.current.hit ? " enter-fade-up" : ""
            }`}
          >
            <CircleCheck className="size-3.5" /> Records verified
          </span>
        ) : (
          <span
            data-field="verifying"
            role="status"
            className="inline-flex h-6 items-center gap-1.5 rounded-full bg-inset px-2.5 text-[12px] font-medium text-ink-2"
          >
            <span
              aria-hidden
              className="size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
              style={{ animation: "spin 700ms linear infinite" }}
            />
            Checking the records…
          </span>
        )}
      </div>
      <div className="grid gap-4 p-4">
        <RecordGroup title="Account">
          <AccountRows account={pkg.account} />
        </RecordGroup>
        <RecordGroup title="Tickets" count={pkg.tickets.length}>
          {pkg.tickets.length === 0 ? (
            <p data-field="none" className="m-0 py-2 text-[13px] text-ink-3">
              No tickets on this account.
            </p>
          ) : (
            <div className="grid gap-2 py-2">
              {pkg.tickets.map((t) => (
                <TicketBlock key={t.id} ticket={t} />
              ))}
            </div>
          )}
        </RecordGroup>
        <RecordGroup title="Payments" count={pkg.payments.length}>
          {pkg.payments.length === 0 ? (
            <p data-field="none" className="m-0 py-2 text-[13px] text-ink-3">
              No payments recorded.
            </p>
          ) : (
            <div className="py-1">
              {pkg.payments.map((p) => (
                <PaymentRows key={p.id} payment={p} />
              ))}
            </div>
          )}
        </RecordGroup>
        <RecordGroup title="Journey">
          <RouteRows route={pkg.route} />
        </RecordGroup>
        <RecordGroup title="Disruption">
          <DisruptionRows disruption={pkg.disruption} />
        </RecordGroup>
        <RecordGroup title="Prior cases" count={priorHistory.length}>
          <PriorHistoryRows history={priorHistory} />
        </RecordGroup>
      </div>
    </section>
  );
}

function AccountRows({ account }: { account: AccountRecord }): React.JSX.Element {
  return (
    <>
      <Row label="Name" field="full-name">
        {account.fullName}
      </Row>
      <Row label="Email" field="email" refValue={`record:account:${account.id}`}>
        <span className="font-mono text-[12px] font-normal">{account.email}</span>
      </Row>
      <Row label="Status" field="status">
        {humanize(account.status)}
      </Row>
      <Row label="Prior cases" field="prior-case-count">
        <span className="tabular-nums">{account.priorCaseCount}</span>
      </Row>
      <Row label="Customer since" field="created-at">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(account.createdAt)}
        </span>
      </Row>
    </>
  );
}

function TicketBlock({ ticket }: { ticket: TicketRecord }): React.JSX.Element {
  return (
    <div
      data-record-ref={`record:ticket:${ticket.id}`}
      className="rounded-control bg-inset/60 px-3"
    >
      <Row label="Ticket" field="number">
        <span className="font-mono tabular-nums">{ticket.number}</span>
      </Row>
      <Row label="Train / seat" field="train-seat">
        {ticket.train} · coach {ticket.carriage} · seat {ticket.seat}
      </Row>
      <Row label="Departure" field="departure">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(ticket.departureScheduled)}
        </span>
      </Row>
      <Row label="Arrival" field="arrival">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(ticket.arrivalScheduled)}
        </span>
      </Row>
      <Row label="Direction" field="direction">
        {humanize(ticket.direction)}
      </Row>
      <Row label="Relief" field="relief">
        {ticket.relief === "none" ? "None" : `${humanize(ticket.relief)} relief`}
      </Row>
      <Row label="Paid" field="price">
        <span className="font-mono tabular-nums">{formatMoney(ticket.paidPrice, ticket.currency)}</span>
      </Row>
      {ticket.passengers.length > 0 ? (
        <Row label="Passengers" field="passengers">
          {ticket.passengers.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 ? ", " : ""}
              <span data-record-ref={`record:passenger:${p.id}`} data-field="passenger">
                {p.fullName}
              </span>
            </React.Fragment>
          ))}
        </Row>
      ) : null}
      {ticket.history.length > 0 ? (
        <div className="py-1.5">
          <span className="text-[12px] text-ink-3">History</span>
          <ul data-field="history" className="m-0 mt-1 grid list-none gap-0.5 p-0">
            {ticket.history.map((h, i) => (
              <li
                key={i}
                data-record-ref={`record:ticket:${ticket.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px] text-ink-2"
              >
                <span>{humanize(h.type)}{h.note ? ` — ${h.note}` : ""}</span>
                <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
                  {formatDateTime(h.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PaymentRows({ payment }: { payment: PaymentRecord }): React.JSX.Element {
  return (
    <div data-record-ref={`record:payment:${payment.id}`}>
      <Row label="Amount" field="amount">
        <span className="font-mono tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
      </Row>
      <Row label="Method" field="method">
        {humanize(payment.method)}
      </Row>
      <Row label="Status" field="status">
        {humanize(payment.status)}
      </Row>
      <Row label="Created" field="created">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(payment.createdAt)}
        </span>
      </Row>
    </div>
  );
}

function RouteRows({ route }: { route: RouteRecord }): React.JSX.Element {
  return (
    <>
      <Row label="Route" field="route" refValue={`record:route:${route.id}`}>
        {route.origin} → {route.destination}
      </Row>
      <Row label="Scheduled" field="scheduled">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(route.scheduledDeparture)} → {formatDateTime(route.scheduledArrival)}
        </span>
      </Row>
      <Row label="Actual" field="actual">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {route.actualDeparture ? formatDateTime(route.actualDeparture) : "—"} →{" "}
          {route.actualArrival ? formatDateTime(route.actualArrival) : "—"}
        </span>
      </Row>
      <Row label="Operator" field="operator">
        {route.operator}
      </Row>
    </>
  );
}

function DisruptionRows({
  disruption,
}: {
  disruption: DisruptionRecord | null;
}): React.JSX.Element {
  if (!disruption) {
    return (
      <p data-field="none" className="m-0 py-2 text-[13px] text-ink-3">
        No disruption recorded.
      </p>
    );
  }
  return (
    <div data-record-ref={`record:disruption:${disruption.id}`}>
      <Row label="Type" field="type">
        {humanize(disruption.type)}
      </Row>
      <Row label="Scheduled delay" field="scheduled-delay">
        <span className="tabular-nums">{disruption.scheduledDelayMinutes} min</span>
      </Row>
      <Row label="Actual delay" field="actual-delay">
        <span className="tabular-nums">{disruption.actualDelayMinutes} min</span>
      </Row>
      <Row label="Cause" field="cause">
        {disruption.cause}
      </Row>
      <Row label="Reported" field="reported">
        <span className="font-mono text-[12px] font-normal tabular-nums">
          {formatDateTime(disruption.reportedAt)}
        </span>
      </Row>
    </div>
  );
}

function PriorHistoryRows({
  history,
}: {
  history: Array<{ caseId: string; topic: string; state: string; updatedAt: string }>;
}): React.JSX.Element {
  if (history.length === 0) {
    return (
      <p data-field="none" className="m-0 py-2 text-[13px] text-ink-3">
        No prior cases for this account.
      </p>
    );
  }
  return (
    <ul className="m-0 grid list-none gap-1 py-2 p-0">
      {history.map((h, i) => (
        <li
          key={i}
          data-record-ref={`record:case:${h.caseId}`}
          className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]"
        >
          <span className="text-ink">
            {topicLabel(h.topic)} <span className="text-ink-3">· {humanize(h.state)}</span>
          </span>
          <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
            {formatDateTime(h.updatedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
