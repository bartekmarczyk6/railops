---
id: ticket-changes
title: Ticket date and route changes
topics: [ticket_change]
authority: demo-policy
version: 1
---

## Summary

Ticket date and route changes are governed by the change-fee schedule in `policy.change-fees`. Same-day route swaps may carry a lower fee than date swaps to a different week.

## Handling guidance

1. Resolve the current ticket by number; capture the original route, date, fare and passenger details.
2. Capture the requested new route or date and the reason supplied by the customer.
3. Look up the matching change-fee bracket from `policy.change-fees.brackets` using the difference between the original and the requested journey date.
4. Apply a fee waiver only when `policy.change-fees.waiver-conditions` evaluates to `true` for the supplied reason.
5. Reissue the ticket only after the change-fee payment is confirmed against a new payment identifier.

## Escalate when

- The requested change crosses a tariff boundary not covered by `policy.change-fees.brackets`.
- The original ticket has a partial journey already recorded against it.
- The customer asks to change the passenger identity while keeping the journey; route to the passenger-name-change doc instead of handling it here.

## Deterministic policy boundary

`change_fee = max(0, policy.change-fees.brackets[requested_date - original_date])` and `change_fee` waives when `policy.change-fees.waiver-conditions(reason)` is `true`.

Boundary source: `policy.change-fees.brackets` and `policy.change-fees.waiver-conditions`.

## Forum reference

Forum threads typically focus on whether the fee changes for off-peak trains. Paraphrased only.

## Related references

- `policy.change-fees.brackets`
- `policy.change-fees.waiver-conditions`
- `record:ticket:<id>`
