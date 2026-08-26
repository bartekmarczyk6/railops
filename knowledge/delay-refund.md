---
id: delay-refund
title: Delay-related refund handling
topics: [delay_refund, cancelled_train_refund]
authority: demo-policy
version: 1
---

## Summary

Refund eligibility for delayed trains is bounded by the delay-minute thresholds defined in `policy.refund-rules`. Apply the same calculation to cancellations when the carrier cancelled before departure.

## Handling guidance

1. Confirm the journey date, train number, ticket number and booked fare from the ticket record before computing a refund.
2. Read actual arrival time and scheduled arrival time from the disruption record; compute the delay minutes deterministically.
3. Map the delay minutes to the bucket defined by `policy.refund-rules.delay-buckets` and apply the matching factor to the paid price.
4. Cross-check that the ticket is not flagged as already refunded in the payment history before issuing.
5. When the same journey has both delay and cancellation events, the cancellation override applies if `policy.refund-rules.cancellation-order` selects it.

## Escalate when

- The customer-claimed delay differs from the disruption record by more than fifteen minutes.
- The ticket is partially used for a multi-leg journey and the travelled legs exceed the booked fare.
- A refund has already been processed for the same payment identifier within the rolling window.
- The booked fare is a non-refundable promotion flagged in the ticket record.

## Deterministic policy boundary

`refund = paid_price * policy.refund-rules.delay-factor[delay_minutes_bucket]`.

| Delay bucket | Factor |
|--------------|--------|
| `under_60` | `0.00` |
| `60_to_119` | `0.50` |
| `120_and_above` | `1.00` |

See `policy.refund-rules.delay-buckets` for the canonical source of the bucket boundaries.

## Forum reference

Users typically report confusion when a partial refund lands without a clear formula explanation. Forum posts also describe duplicate-refund concerns after automatic processing. Forum material paraphrased here, see `docs/research/support-case-dropdown-candidates.md` for the prior topic survey.

## Related references

- `policy.refund-rules`
- `policy.disruption-records`
- `record:ticket:<id>`
- `record:payment:<id>`
