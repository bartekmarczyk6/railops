---
id: missing-refund
title: Missing refund investigation
topics: [missing_refund]
authority: demo-policy
version: 1
---

## Summary

A missing-refund claim is investigated against the payment and refund ledger. The investigation may close as already-issued, scheduled, or escalated to the payments queue.

## Handling guidance

1. Resolve the ticket and the original payment identifier from the customer email.
2. Look up the most recent refund record keyed by payment identifier in the refund ledger.
3. If the ledger shows an issued refund, share the payment reference and close the case with a confirming note.
4. If the ledger shows a scheduled but not yet cleared refund, share the expected clearing date.
5. If neither, route the case to the payments queue with the gathered evidence and the dispute identifier.

## Escalate when

- The ledger shows the refund was issued but the customer reports it never arrived; gather the bank statement window and escalate.
- The original payment was made through a third-party wallet that the customer no longer controls.
- The customer disputes the ledger amount or the destination account.

## Deterministic policy boundary

`status = policy.missing-refund.statuses[ledger_match]` where `ledger_match` is one of `issued`, `scheduled`, `absent`.

Boundary source: `policy.missing-refund.statuses`.

## Forum reference

Forum posts commonly describe customers who did not receive a refund that the system claims to have issued. Paraphrased; see `docs/research/support-case-dropdown-candidates.md`.

## Related references

- `policy.missing-refund.statuses`
- `record:payment:<id>`
- `record:refund:<id>`
