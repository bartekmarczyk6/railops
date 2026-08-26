---
id: cancelled-train
title: Cancelled train refund handling
topics: [cancelled_train_refund]
authority: demo-policy
version: 1
---

## Summary

Cancellations before departure are handled separately from in-journey delays. The full refund rule applies unless the customer travelled on a rebooked alternative before the cancellation window closed.

## Handling guidance

1. Inspect the disruption record and confirm the cancellation flag, the cancelled train number and the planned departure timestamp.
2. Resolve the booking by ticket number and verify that no completed journey segment exists for the original train.
3. Confirm the customer has not already accepted a rebooking compensation recorded against the same ticket.
4. Issue the refund through the payment channel associated with the original payment identifier.
5. Record the cancellation outcome against `policy.refund-rules.cancellation-order`.

## Escalate when

- The customer claims the train ran but the disruption record shows it was cancelled.
- The original train was cancelled but the customer actually travelled on a replacement service with a different fare class.
- The rebooking was already compensated and the customer requests a second refund on the same payment.

## Deterministic policy boundary

`refund = paid_price * policy.refund-rules.cancellation-factor[fare_class]` where `fare_class` comes from the ticket record.

| Fare class | Factor |
|------------|--------|
| `standard` | `1.00` |
| `discount` | `0.75` |
| `group` | `1.00` |

Boundary source: `policy.refund-rules.cancellation-factor`.

## Forum reference

Forum posts typically describe uncertainty about whether a rebooked seat counts as having travelled. Paraphrased; see `docs/research/support-case-dropdown-candidates.md` for the prior topic survey.

## Related references

- `policy.refund-rules.cancellation-order`
- `record:ticket:<id>`
- `record:disruption:<id>`
