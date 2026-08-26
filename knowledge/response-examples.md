---
id: response-examples
title: Response examples for common cases
topics: [delay_refund, cancelled_train_refund, missed_connection, ticket_change, passenger_name_change, missing_refund, payment_without_ticket, validation_discount_penalty]
authority: demo-policy
version: 1
---

## Summary

Short, neutral-tone response fragments for the eight supported topics. Use these as starting points only — the draft must still cite the matching record and rule identifiers.

## Refund delay acknowledgment

> Thank you for the ticket details. Based on the recorded delay of [DELAY_MIN] minutes, the matching refund factor is [FACTOR] of the paid price. The refund amount is [AMOUNT] and will be returned through the original payment channel.

## Cancellation rebooking offer

> Your train has been cancelled. The original fare can be refunded in full, or you can accept the rebooking option on [ALTERNATIVE_TRAIN] at no additional cost. Please confirm your preferred option.

## Missed connection explanation

> The connecting train was missed because the upstream leg arrived [MIN] minutes after the minimum transfer window. Re-routing is offered from the policy without a fee when both legs share the same booking chain.

## Ticket change confirmation

> The change fee for moving from [ORIGINAL_DATE] to [NEW_DATE] is [FEE]. The new ticket will be issued once the fee payment is confirmed. See `policy.change-fees.brackets` for the full schedule.

## Name correction confirmation

> The spelling correction to the passenger name has been recorded against the original booking. Use the corrected passenger name together with the booking identifier when joining the train.

## Missing refund status

> The most recent refund record against the supplied payment identifier shows [STATUS]. If no record exists the case will be routed to the payments queue.

## Payment without ticket

> The captured payment of [AMOUNT] on [DATE] has been matched against [TICKET_NUMBER]. If no ticket matches, the case will be escalated with the payment evidence.

## Validation outcome

> Based on the supplied discount evidence and the validation rules table, the validation outcome is [ACCEPT_OR_PENALTY]. The reasoning and the validation event identifier are recorded for audit.

## Escalation preface

> The evidence supplied does not unambiguously resolve the case. I have paused the resolution and routed this to the review queue for human inspection.

## Forum reference

These fragments are derived from internal draft patterns rather than any single customer message. Forum material paraphrased only.

## Related references

- `policy.refund-rules`
- `policy.connection-rules`
- `policy.change-fees`
- `policy.identity-changes`
- `policy.missing-refund`
- `policy.payment-without-ticket`
- `policy.validation-rules`
