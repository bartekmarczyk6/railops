function FoundationPing(input: string) -> FoundationPlaceholder {
  client MockClient
  prompt #"
    Echo: {{ input }}
  "#
}