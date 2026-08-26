---
id: validation-discount-penalty
title: Validation, discount and penalty cases
topics: [validation_discount_penalty]
authority: demo-policy
version: 1
---

## Summary

On-train validation cases decide between accepting evidence of discount eligibility and applying a penalty. The decision always references the evidence record and the validation rules table.

## Handling guidance

1. Capture the validation event timestamp, the train identifier and the inspector identifier from the case record.
2. Read the discount evidence referenced by the customer and compare it against the validation rules table.
3. If the discount evidence satisfies `policy.validation-rules.discount-conditions`, close the case as accepted.
4. If the discount evidence fails, compute the penalty from `policy.validation-rules.penalty-amounts` and route to the penalty queue.
5. Always preserve the validation event identifier alongside the resolution for audit.

## Escalate when

- The discount evidence appears valid but the customer disputes the inspector's reading.
- The penalty amount exceeds the threshold flagged in `policy.validation-rules.penalty-threshold`.
- The customer supplies evidence that arrives after the validation event window closed.

## Deterministic policy boundary

`outcome = accept` when `policy.validation-rules.discount-conditions(evidence)` is `true`, otherwise `outcome = penalty` with `penalty = policy.validation-rules.penalty-amounts[fare_class]`.

Boundary source: `policy.validation-rules.discount-conditions` and `policy.validation-rules.penalty-amounts`.

## Forum reference

Forum posts typically focus on whether expired student cards still qualify. Material paraphrased only.

## Related references

- `policy.validation-rules.discount-conditions`
- `policy.validation-rules.penalty-amounts`
- `record:validation:<id>`
