---
id: missed-connection
title: Missed connection handling
topics: [missed_connection]
authority: demo-policy
version: 1
---

## Summary

Missed-connection eligibility depends on the minimum transfer time defined in `policy.connection-rules`. Re-routing or partial refund is decided by the booking chain recorded on the original ticket.

## Handling guidance

1. Resolve the booking chain from the ticket record; identify the connecting trains and the planned transfer station.
2. Read actual arrival at the transfer station from the disruption record for the upstream leg.
3. Compare the upstream arrival against the scheduled departure of the downstream leg and the minimum transfer buffer from `policy.connection-rules.min-transfer`.
4. When the chain was booked together, offer the rebooking branch from `policy.connection-rules.rebook-options`.
5. When the chain was booked separately, only the upstream leg is eligible for rebooking; do not extend eligibility to the downstream ticket.

## Escalate when

- The missed connection exceeds the minimum transfer time and the customer disputes the buffer.
- The downstream ticket is held under a different passenger identity and is not part of the same booking chain.
- The upstream carrier disputes the recorded actual arrival time.

## Deterministic policy boundary

`eligible = (actual_arrival - scheduled_departure) < policy.connection-rules.min-transfer[station]` where `eligible` is `true` only when both legs share the same booking chain identifier.

Boundary source: `policy.connection-rules.min-transfer`.

## Forum reference

Users typically ask whether a separately bought downstream ticket still receives protection. Forum material paraphrased here.

## Related references

- `policy.connection-rules.rebook-options`
- `record:ticket:<id>`
- `record:route:<id>`
