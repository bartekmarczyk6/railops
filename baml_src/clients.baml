generator target {
  output_type "typescript"
  output_dir "../"
  default_client_mode "async"
  version "0.203.1"
}

client<llm> MockClient {
  provider openai
  options {}
}