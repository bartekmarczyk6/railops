test GenerateCustomerEmailShape {
  functions [GenerateCustomerEmail]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"supported_by_records"}"#
    topic "delay_refund"
    truthMode "supported_by_records"
    claimsJson #"{"requestedAction":"refund","claims":[],"missingFields":[],"referencedTicketNumbers":[],"referencedStations":[]}"#
    rulesJson #"{"outcome":"eligible","amount":100,"reasons":[],"evidenceRefs":["rule:v1:delay-30"]}"#
    knowledgeJson #"[]"#
    memoryJson #"{"topic":"delay_refund","reviewerGuidance":[],"source":"none"}"#
  }
  @@assert({{ this.subject|length > 0 }})
  @@assert({{ this.body|length > 0 }})
}

test ExtractCaseClaimsShape {
  functions [ExtractCaseClaims]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"supported_by_records"}"#
    topic "delay_refund"
    truthMode "supported_by_records"
    messageText "My train was delayed 45 minutes."
  }
  @@assert({{ this.requestedAction|length > 0 }})
  @@assert({{ this.claims is sequence }})
}

test DraftDecisionShape {
  functions [DraftDecision]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"supported_by_records"}"#
    topic "delay_refund"
    truthMode "supported_by_records"
    claimsJson #"{"requestedAction":"refund","claims":[],"missingFields":[],"referencedTicketNumbers":[],"referencedStations":[]}"#
    rulesJson #"{"outcome":"eligible","amount":100,"reasons":[],"evidenceRefs":["rule:v1:delay-30"]}"#
    knowledgeJson #"[]"#
    memoryJson #"{"topic":"delay_refund","reviewerGuidance":[],"source":"none"}"#
  }
  @@assert({{ this.decisionBasis|length > 0 }})
  @@assert({{ this.evidenceRefs|length > 0 }})
}

test CritiqueDecisionShape {
  functions [CritiqueDecision]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"supported_by_records"}"#
    rulesJson #"{"outcome":"eligible","amount":100,"reasons":[],"evidenceRefs":["rule:v1:delay-30"]}"#
    draftJson #"{"outcome":"refund","proposedAmount":100,"decisionBasis":[{"claim":"delay","evidenceRef":"rule:v1:delay-30","note":"ok"}],"response":"Refund approved","evidenceRefs":["rule:v1:delay-30"]}"#
  }
  @@assert({{ this.findings is sequence }})
}

test InterpretFollowUpShape {
  functions [InterpretFollowUp]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"insufficient_information"}"#
    claimsJson #"{"requestedAction":"refund","claims":[],"missingFields":["claimed_delay_minutes"],"referencedTicketNumbers":[],"referencedStations":[]}"#
    conversationJson #"[]"#
    messageText "It was about 45 minutes."
  }
  @@assert({{ this.answers is sequence }})
}

test DraftFollowUpShape {
  functions [DraftFollowUp]
  args {
    caseJson #"{"id":"c1","topic":"delay_refund","truthMode":"insufficient_information"}"#
    claimsJson #"{"requestedAction":"refund","claims":[],"missingFields":["claimed_delay_minutes"],"referencedTicketNumbers":[],"referencedStations":[]}"#
    rulesJson #"{"outcome":"follow_up_required","amount":null,"reasons":[],"evidenceRefs":[]}"#
    knowledgeJson #"[]"#
    memoryJson #"{"topic":"delay_refund","reviewerGuidance":[],"source":"none"}"#
    conversationJson #"[]"#
  }
  @@assert({{ this.message|length > 0 }})
}
