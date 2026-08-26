generator target {
  output_type "typescript"
  output_dir "../"
  default_client_mode "async"
  version "0.203.1"
}

client<llm> MockClient {
  provider openai-generic
  options {
    base_url "http://localhost:0/mock"
    api_key "mock"
    model "mock-model"
  }
}

client<llm> GroqClient {
  provider openai-generic
  options {
    base_url "https://api.groq.com/openai/v1"
    api_key env.GROQ_API_KEY
    model env.GROQ_MODEL
  }
}
