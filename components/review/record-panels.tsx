import React from "react";
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

export function RecordPanels({ pkg, priorHistory }: RecordPanelsProps): React.JSX.Element {
  return (
    <section
      data-component="record-panels"
      data-section="records"
      style={{ display: "grid", gap: "var(--space-3)" }}
    >
      <h2 style={{ margin: 0 }}>Synthetic records</h2>
      <AccountPanel account={pkg.account} />
      <TicketsPanel tickets={pkg.tickets} />
      <PassengersPanel tickets={pkg.tickets} />
      <PaymentsPanel payments={pkg.payments} />
      <RoutePanel route={pkg.route} />
      <DisruptionPanel disruption={pkg.disruption} />
      <PriorHistoryPanel history={priorHistory} />
    </section>
  );
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <details
      data-component="record-panel"
      open
      style={{
        padding: "var(--space-3)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700, minHeight: "44px" }}>
        {title}
      </summary>
      <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
    </details>
  );
}

function AccountPanel({ account }: { account: AccountRecord }): React.JSX.Element {
  return (
    <PanelShell title="Account">
      <table data-role="record-table" style={tableStyle}>
        <tbody>
          <tr>
            <th>Email</th>
            <td data-record-ref={`record:account:${account.id}`} data-field="email">
              {account.email}
            </td>
          </tr>
          <tr>
            <th>Name</th>
            <td data-field="full-name">{account.fullName}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td data-field="status">{account.status}</td>
          </tr>
          <tr>
            <th>Prior cases</th>
            <td data-field="prior-case-count">{account.priorCaseCount}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td data-field="created-at">{account.createdAt}</td>
          </tr>
        </tbody>
      </table>
    </PanelShell>
  );
}

function TicketsPanel({ tickets }: { tickets: TicketRecord[] }): React.JSX.Element {
  return (
    <PanelShell title={`Tickets (${tickets.length})`}>
      {tickets.map((t) => (
        <table
          key={t.id}
          data-record-ref={`record:ticket:${t.id}`}
          data-role="record-table"
          style={{ ...tableStyle, marginBottom: "var(--space-3)" }}
        >
          <tbody>
            <tr>
              <th>Number</th>
              <td data-field="number">{t.number}</td>
            </tr>
            <tr>
              <th>Train / seat</th>
              <td data-field="train-seat">{t.train} / {t.carriage} / {t.seat}</td>
            </tr>
            <tr>
              <th>Departure</th>
              <td data-field="departure">{t.departureScheduled}</td>
            </tr>
            <tr>
              <th>Arrival</th>
              <td data-field="arrival">{t.arrivalScheduled}</td>
            </tr>
            <tr>
              <th>Direction</th>
              <td data-field="direction">{t.direction}</td>
            </tr>
            <tr>
              <th>Relief</th>
              <td data-field="relief">{t.relief}</td>
            </tr>
            <tr>
              <th>Price</th>
              <td data-field="price">
                {t.paidPrice} {t.currency}
              </td>
            </tr>
            <tr>
              <th>History</th>
              <td data-field="history">
                <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
                  {t.history.map((h, i) => (
                    <li key={i} data-record-ref={`record:ticket:${t.id}`}>
                      {h.type} @ {h.timestamp}
                      {h.note ? ` (${h.note})` : ""}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </PanelShell>
  );
}

function PassengersPanel({ tickets }: { tickets: TicketRecord[] }): React.JSX.Element {
  return (
    <PanelShell title="Passengers">
      <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
        {tickets.flatMap((t) =>
          t.passengers.map((p) => (
            <li
              key={p.id}
              data-record-ref={`record:passenger:${p.id}`}
              data-field="passenger"
            >
              {p.fullName} (ticket {t.number})
            </li>
          )),
        )}
      </ul>
    </PanelShell>
  );
}

function PaymentsPanel({ payments }: { payments: PaymentRecord[] }): React.JSX.Element {
  return (
    <PanelShell title={`Payments (${payments.length})`}>
      <table data-role="record-table" style={tableStyle}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} data-record-ref={`record:payment:${p.id}`}>
              <td data-field="id">{p.id}</td>
              <td data-field="amount">
                {p.amount} {p.currency}
              </td>
              <td data-field="method">{p.method}</td>
              <td data-field="status">{p.status}</td>
              <td data-field="created">{p.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function RoutePanel({ route }: { route: RouteRecord }): React.JSX.Element {
  return (
    <PanelShell title="Route">
      <table data-role="record-table" style={tableStyle}>
        <tbody>
          <tr>
            <th>Origin → Destination</th>
            <td data-record-ref={`record:route:${route.id}`} data-field="route">
              {route.origin} → {route.destination}
            </td>
          </tr>
          <tr>
            <th>Scheduled</th>
            <td data-field="scheduled">
              {route.scheduledDeparture} → {route.scheduledArrival}
            </td>
          </tr>
          <tr>
            <th>Actual</th>
            <td data-field="actual">
              {route.actualDeparture ?? "—"} → {route.actualArrival ?? "—"}
            </td>
          </tr>
          <tr>
            <th>Operator</th>
            <td data-field="operator">{route.operator}</td>
          </tr>
        </tbody>
      </table>
    </PanelShell>
  );
}

function DisruptionPanel({ disruption }: { disruption: DisruptionRecord | null }): React.JSX.Element {
  if (!disruption) {
    return (
      <PanelShell title="Disruption">
        <p data-field="none" style={{ margin: 0 }}>
          No disruption recorded.
        </p>
      </PanelShell>
    );
  }
  return (
    <PanelShell title="Disruption">
      <table data-record-ref={`record:disruption:${disruption.id}`} data-role="record-table" style={tableStyle}>
        <tbody>
          <tr>
            <th>Type</th>
            <td data-field="type">{disruption.type}</td>
          </tr>
          <tr>
            <th>Scheduled delay</th>
            <td data-field="scheduled-delay">{disruption.scheduledDelayMinutes} min</td>
          </tr>
          <tr>
            <th>Actual delay</th>
            <td data-field="actual-delay">{disruption.actualDelayMinutes} min</td>
          </tr>
          <tr>
            <th>Cause</th>
            <td data-field="cause">{disruption.cause}</td>
          </tr>
          <tr>
            <th>Reported</th>
            <td data-field="reported">{disruption.reportedAt}</td>
          </tr>
        </tbody>
      </table>
    </PanelShell>
  );
}

function PriorHistoryPanel({
  history,
}: {
  history: Array<{ caseId: string; topic: string; state: string; updatedAt: string }>;
}): React.JSX.Element {
  return (
    <PanelShell title="Prior refund / change history">
      {history.length === 0 ? (
        <p data-field="none" style={{ margin: 0 }}>
          No prior cases for this account.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
          {history.map((h, i) => (
            <li key={i} data-record-ref={`record:case:${h.caseId}`}>
              {h.topic} ({h.state}) @ {h.updatedAt}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};
