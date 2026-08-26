---
id: payment-without-ticket
title: Payment without ticket investigation
topics: [payment_without_ticket]
authority: demo-policy
version: 1
---

## Summary

A payment that does not match any active ticket indicates either a failed checkout, a refund-to-credit conversion, or a duplicate billing. Resolution depends on the payment channel recorded against the order.

## Handling guidance

1. Resolve the payment identifier and capture the channel, amount and timestamp.
2. Search the active ticket ledger for any ticket indexed by the same payment identifier.
3. If a ticket exists, close the case by sharing the ticket number and journey date.
4. If no ticket exists and the channel is a refundable wallet, verify the refund ledger for a recently completed reversal.
5. If neither, escalate to the payments queue with the payment evidence and the channel record.

## Escalate when

- The customer reports a charge but the payment channel shows a pending authorisation rather than a captured payment.
- Multiple ticket attempts produced more than one captured payment for the same journey.
- The customer suspects a duplicate billing and requires a formal adjustment.

## Deterministic policy boundary

`next_step = policy.payment-without-ticket.actions[ledger_state]` where `ledger_state` is one of `ticket_present`, `refund_recorded`, `absent`.

Boundary source: `policy.payment-without-ticket.actions`.

## Forum reference

Forum threads often describe uncertainty when a receipt arrives without a ticket email. Material paraphrased only.

## Related references

- `policy.payment-without-ticket.actions`
- `record:payment:<id>`
- `record:ticket:<id>`
