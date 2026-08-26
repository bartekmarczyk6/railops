---
id: name-changes
title: Passenger name changes
topics: [passenger_name_change]
authority: demo-policy
version: 1
---

## Summary

Passenger name corrections must keep the booking chain intact. Spelling corrections are permitted; identity substitutions follow the transfer procedure in `policy.identity-changes`.

## Handling guidance

1. Resolve the ticket by number and capture the existing passenger name as it appears on the booking.
2. Compare the existing passenger name with the requested correction and classify the request as a spelling correction or an identity substitution.
3. For spelling corrections, apply the change after confirming the ticket is unused; record the audit reason.
4. For identity substitutions, route to `policy.identity-changes.transfer-procedure` and request the documented evidence.
5. Always retain the original booking identifier alongside the corrected passenger name in the audit log.

## Escalate when

- The customer cannot supply evidence supporting the identity substitution.
- The ticket was purchased under a discount tied to the original passenger identity.
- The spelling correction changes more than four characters or alters the surname entirely.

## Deterministic policy boundary

`classification = correction` when `levenshtein(existing_name, requested_name) <= policy.identity-changes.spelling-threshold`, otherwise `classification = substitution`.

Boundary source: `policy.identity-changes.spelling-threshold`.

## Forum reference

Users typically ask whether a misspelled ticket can still be used. Forum material paraphrased here, original threads are not copied.

## Related references

- `policy.identity-changes.transfer-procedure`
- `policy.identity-changes.spelling-threshold`
- `record:ticket:<id>`
