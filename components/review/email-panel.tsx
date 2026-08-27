import React from "react";
import type { EmailDraft, ExtractedClaims } from "@/lib/llm/types.ts";
import type { DecisionDraft } from "@/lib/llm/types.ts";

export type EmailPanelProps = {
  email: EmailDraft;
  claims: ExtractedClaims;
  decision: DecisionDraft;
  editedDraft: DecisionDraft | null;
  onChangeEditedDraft: (next: DecisionDraft) => void;
};

export function EmailPanel({
  email,
  claims,
  decision,
  editedDraft,
  onChangeEditedDraft,
}: EmailPanelProps): React.JSX.Element {
  const draft = editedDraft ?? decision;
  return (
    <section
      data-component="email-panel"
      data-section="email"
      style={{
        display: "grid",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <article data-field="inbound" aria-label="Inbound email">
        <h2 style={{ marginTop: 0 }}>Inbound email</h2>
        <p data-field="inbound-subject" style={{ fontWeight: 700 }}>
          {email.subject}
        </p>
        <pre
          data-field="inbound-body"
          style={{
            whiteSpace: "pre-wrap",
            margin: 0,
            padding: "var(--space-3)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "Lato, system-ui, sans-serif",
          }}
        >
          {email.body}
        </pre>
        {email.mentionedFacts.length > 0 ? (
          <p data-field="mentioned-facts" style={{ marginTop: "var(--space-2)" }}>
            Mentioned: {email.mentionedFacts.map((f) => (
              <code
                key={f}
                data-record-ref={f}
                style={{
                  marginRight: "var(--space-2)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {f}
              </code>
            ))}
          </p>
        ) : null}
      </article>
      <article data-field="claims" aria-label="Extracted claims">
        <h3 style={{ margin: 0 }}>Extracted claims</h3>
        <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
          {claims.claims.map((c, i) => (
            <li key={i} data-record-ref={c.ticketNumber ? `record:ticket:${c.ticketNumber}` : undefined}>
              <strong>{c.kind}:</strong> {c.description}
              {c.value !== null && c.value !== undefined ? <> (value={String(c.value)})</> : null}
            </li>
          ))}
        </ul>
        {claims.missingFields.length > 0 ? (
          <p data-field="missing-fields-inline" style={{ marginTop: "var(--space-2)" }}>
            Missing: {claims.missingFields.join(", ")}
          </p>
        ) : null}
      </article>
      <article data-field="draft-response" aria-label="Draft response">
        <h3 style={{ margin: 0 }}>Draft response (editable)</h3>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>
            Outcome
          </span>
          <select
            data-field="draft-outcome"
            value={draft.outcome}
            onChange={(e) =>
              onChangeEditedDraft({ ...draft, outcome: e.target.value as DecisionDraft["outcome"] })
            }
            style={inputStyle}
          >
            <option value="refund">Refund</option>
            <option value="change">Change</option>
            <option value="follow_up">Follow-up</option>
            <option value="unsupported_or_escalate">Escalate</option>
            <option value="information">Information</option>
          </select>
        </label>
        <label style={{ display: "block", marginTop: "var(--space-2)" }}>
          <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>
            Proposed amount
          </span>
          <input
            data-field="draft-amount"
            type="number"
            inputMode="decimal"
            value={draft.proposedAmount ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              onChangeEditedDraft({
                ...draft,
                proposedAmount: next !== null && Number.isFinite(next) ? next : null,
              });
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "block", marginTop: "var(--space-2)" }}>
          <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>
            Response text
          </span>
          <textarea
            data-field="draft-response-text"
            value={draft.response}
            onChange={(e) => onChangeEditedDraft({ ...draft, response: e.target.value })}
            rows={6}
            style={{ ...inputStyle, fontFamily: "Lato, system-ui, sans-serif" }}
          />
        </label>
      </article>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-raised)",
  fontSize: "14px",
  minHeight: "44px",
};
