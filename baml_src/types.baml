enum DecisionOutcome {
  Refund
  Change
  FollowUp
  UnsupportedOrEscalate
  Information
}

enum CriticSeverity {
  Info
  Warning
  Error
}

class Claim {
  kind string
  description string
  value float?
  ticketNumber string?
}

class DecisionBasisItem {
  claim string
  evidenceRef string
  note string
}

class CriticFinding {
  severity CriticSeverity
  message string
  evidenceRef string?
}

class EmailDraft {
  subject string @assert({{ this|length > 0 }})
  body string @assert({{ this|length > 0 }})
  mentionedFacts string[] @assert({{ this|length > 0 }})
}

class ExtractedClaims {
  requestedAction string @assert({{ this|length > 0 }})
  claims Claim[]
  missingFields string[]
  referencedTicketNumbers string[]
  referencedStations string[]
}

class DecisionDraft {
  outcome DecisionOutcome
  proposedAmount float?
  decisionBasis DecisionBasisItem[] @assert({{ this|length > 0 }})
  response string @assert({{ this|length > 0 }})
  evidenceRefs string[] @assert({{ this|length > 0 }})
}

class CritiqueReport {
  passed bool
  findings CriticFinding[]
  correctedDraft DecisionDraft?
}
