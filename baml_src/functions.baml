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
    {{ TONE_PROFESSIONAL() }}
    {{ EVIDENCE_ONLY() }}
    {{ NEVER_INVENT() }}
    {{ JSON_INPUT_GUARD() }}

    Write the email body of a customer support reply from structured truth data.

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

    Compose a detailed natural English email to the passenger. Mention only
    facts present in the inputs. The subject line must be short and direct.
    List every fact you mention in mentionedFacts using the exact evidence
    reference from the inputs.

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
    exact evidence references in evidenceRefs and decisionBasis.

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

    Verify: outcome is one of the allowed values, proposedAmount matches the
    deterministic amount when set, every evidenceRef follows the application
    patterns (record:ticket:<id>, record:route:<id>, rule:<ver>:<id>,
    knowledge:<sourceId>:<heading>), and decisionBasis items are concise with
    evidence references. If you produce a correctedDraft, keep all identifiers
    from the inputs. Use neutral language for any finding.

    {{ ctx.output_format }}
  "#
}
