function GenerateCustomerEmail(
  caseJson: string,
  topic: string,
  truthMode: string,
  claimsJson: string,
  rulesJson: string,
  knowledgeJson: string,
  memoryJson: string
) -> EmailDraft {
  client GroqClient
  prompt #"
    {{ TONE_PASSENGER() }}
    {{ NEVER_INVENT() }}
    {{ JSON_INPUT_GUARD() }}

    Write the INBOUND email a passenger sends to RailOps customer support.
    The email must read as if the passenger wrote it themselves — you are
    role-playing the passenger, not the support team. Never write a support
    reply, never answer the request, never quote policy or refund rules.

    Topic: {{ topic }}
    Truth mode: {{ truthMode }}

    CasePackage (JSON, the ground truth of the scenario):
    {{ caseJson }}

    What the passenger knows and writes:
    - Their own journey: date, origin and destination stations, train, and the
      delay or problem as THEY experienced it.
    - Their ticket number (the short human-facing `number` like TKT-XXXXXX,
      never the UUID `id`) and what they paid, when they would naturally know it.
    - What they want (refund, change, name correction, etc.).

    Truth mode behavior:
    - supported_by_records: every detail matches the records; include the
      ticket number and payment details.
    - fabricated_delay: the passenger claims the delay from
      expected.claimedDelayMinutes. Write only what they claim; never mention
      the actual operational times.
    - fraud_attempt: the passenger pursues the claim with the contradictions
      present in the package (e.g. a name that does not match the ticket
      owner). Write plausibly, without confessing anything.
    - insufficient_information: the passenger naturally omits the details
      listed in expected.missingFields (for example no ticket number), so
      support will need to ask.

    Hard rules for the email text (subject and body):
    - Never include strings starting with "record:", "rule:", or "knowledge:".
    - Never include UUIDs, account ids, payment ids, route ids, or disruption
      ids. The ticket `number` is the only identifier a passenger writes.
    - Never mention evidence references, internal systems, or policy names.

    subject: short and natural, like a real subject line.
    mentionedFacts: for each fact used in the body, output the exact evidence
    reference from the CasePackage — only record:ticket:<id> and
    record:route:<id> forms. This is metadata for the system; it never
    appears in the email text itself.

    {{ ctx.output_format }}
  "#
}

function ExtractCaseClaims(
  caseJson: string,
  topic: string,
  truthMode: string,
  messageText: string
) -> ExtractedClaims {
  client GroqClient
  prompt #"
    {{ EVIDENCE_ONLY() }}
    {{ NEVER_INVENT() }}
    {{ JSON_INPUT_GUARD() }}

    Extract structured claims from a passenger message and case package.

    Topic: {{ topic }}
    Truth mode: {{ truthMode }}

    CasePackage (JSON):
    {{ caseJson }}

    Passenger message:
    {{ messageText }}

    Identify the requestedAction, every claim, any missingFields, and the
    ticket numbers and stations referenced. Do not invent identifiers.

    {{ ctx.output_format }}
  "#
}

function DraftDecision(
  caseJson: string,
  topic: string,
  truthMode: string,
  claimsJson: string,
  rulesJson: string,
  knowledgeJson: string,
  memoryJson: string
) -> DecisionDraft {
  client GroqClient
  prompt #"
    {{ TONE_PROFESSIONAL() }}
    {{ EVIDENCE_ONLY() }}
    {{ NEVER_INVENT() }}
    {{ NEUTRAL_LANGUAGE() }}
    {{ JSON_INPUT_GUARD() }}

    Draft a decision for a RailOps support case.

    Topic: {{ topic }}
    Truth mode: {{ truthMode }}

    CasePackage (JSON):
    {{ caseJson }}

    Extracted claims (JSON):
    {{ claimsJson }}

    Deterministic rule results (JSON):
    {{ rulesJson }}

    Retrieved knowledge excerpts (JSON):
    {{ knowledgeJson }}

    Hindsight reviewer context (JSON):
    {{ memoryJson }}

    Pick the outcome that best matches the inputs. proposedAmount must match
    the deterministic rule result when one exists, otherwise null. Cite the
    exact evidence references in evidenceRefs and decisionBasis. Evidence
    references must use only these patterns: record:ticket:<id>,
    record:route:<id>, record:payment:<id>, rule:<ver>:<id>,
    knowledge:<sourceId>:<heading>. Never use record:disruption:,
    record:account:, or any other prefix, and never repeat the same reference
    more than once.

    The response field is the actual reply email sent to the passenger —
    write it as a RailOps support agent, not as an internal note. Requirements:
    - Open with a friendly greeting using the passenger's first name, and
      thank them for reaching out. Acknowledge the inconvenience briefly and
      sincerely when the case involves a delay, cancellation, or disruption.
    - In plain passenger-friendly language, state what you checked (their
      journey, ticket, and what happened) and the decision, with the exact
      amounts when one applies. Explain how the amount was derived in one
      simple sentence (for example, a percentage of the fare paid), without
      quoting policy names, rule ids, or internal systems.
    - Close with clear next steps (how and when they will receive the refund
      or what happens next), an invitation to reply if they have questions,
      and a short sign-off from the RailOps support team.
    - Two to four short paragraphs, roughly 90-150 words. Warm, direct, and
      confident; no filler, no robotic phrasing such as "The records confirm"
      or "According to the applicable policy".
    - Only promise concrete details (time frames, payment method) that are
      supported by the inputs; otherwise keep next steps general.
    - For follow-up or escalation outcomes, stay neutral and never
      accusatory: say what is still needed or that a specialist will follow
      up. No reference strings or internal ids anywhere in the response.

    {{ ctx.output_format }}
  "#
}

function CritiqueDecision(
  caseJson: string,
  rulesJson: string,
  draftJson: string
) -> CritiqueReport {
  client GroqClient
  prompt #"
    {{ EVIDENCE_ONLY() }}
    {{ NEVER_INVENT() }}
    {{ NEUTRAL_LANGUAGE() }}
    {{ JSON_INPUT_GUARD() }}

    Critique a draft decision against the deterministic rule results.

    CasePackage (JSON):
    {{ caseJson }}

    Deterministic rule results (JSON):
    {{ rulesJson }}

    Draft decision (JSON):
    {{ draftJson }}

    Verify: outcome is one of the allowed values (refund, change, follow_up,
    unsupported_or_escalate, information), proposedAmount matches the
    deterministic amount when set, every evidenceRef follows exactly one of
    these patterns: record:ticket:<id>, record:route:<id>,
    record:payment:<id>, rule:<ver>:<id>, knowledge:<sourceId>:<heading>.
    References with any other prefix (such as record:disruption: or
    record:account:) are invalid, and duplicate references should be flagged
    as an error, not permitted. The response field must be natural language
    with no reference strings inside it. decisionBasis items are concise with
    evidence references. If you produce a correctedDraft, keep all identifiers
    from the inputs and use the same outcome vocabulary. Use neutral language
    for any finding.

    {{ ctx.output_format }}
  "#
}

function RewriteResponseText(
  selection: string,
  instruction: string,
  contextJson: string
) -> RewriteResult {
  client GroqClient
  prompt #"
    {{ EVIDENCE_ONLY() }}
    {{ NEVER_INVENT() }}
    {{ NEUTRAL_LANGUAGE() }}
    {{ JSON_INPUT_GUARD() }}

    Rewrite the selected text from a passenger support draft according to the
    instruction. Keep all facts, identifiers and amounts unchanged. Return
    only the replacement text in rewrittenSelection.

    Selected text:
    {{ selection }}

    Instruction:
    {{ instruction }}

    Draft and case context (JSON):
    {{ contextJson }}

    {{ ctx.output_format }}
  "#
}
