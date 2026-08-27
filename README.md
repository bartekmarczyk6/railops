# RailOps — AI-assisted passenger support

RailOps is a demo of how an AI agent could handle passenger support emails for
a rail ticketing platform: the agent reads the email, verifies the passenger's
claims against records and policy, drafts a decision with a reply, and a human
reviewer approves, rejects or edits it before anything ships.

I built this as my application project for the **AI Specialist role at KOLEO**.

## Why I built this

Support email handling is a great fit for AI and a dangerous one at the same
time. The emails are repetitive and slow to answer by hand, but every answer
carries real consequences: refunds, compensation, policy exceptions. Fully
automatic replies are risky, and fully manual handling doesn't scale.

My idea: don't ask the AI to *decide* — ask it to *prepare*. The AI does the
language work (reading the email, extracting what the passenger claims,
drafting the decision and the reply). Deterministic code owns everything
factual: identifiers, lookups, arithmetic, eligibility, policy rules. And a
human reviewer makes the final call, with full evidence on screen.

Rail passenger support felt like the right test domain: real rules (delay
compensation, refunds, ticket changes), real records (tickets, payments,
operations data) and real consequences — and it's close to what KOLEO does
every day.

To make the demo honest, I simulate the whole world: every passenger, ticket,
payment, route, disruption and inbound email is synthetic, generated
deterministically from a seed. The same seed always produces the same case and
the same ground truth, so the pipeline's behaviour can be tested and scored.

## Try the live demo

**https://railops-demo.vercel.app**

- **Create a case.** Pick a topic (delay refund, missed connection, ticket
  change…) and a truth mode — whether the records support the passenger's
  claim, or whether the passenger is exaggerating or attempting fraud.
- **Watch the agent work.** It reads the email, locates the account, extracts
  the claims, consults the knowledge base and the passenger's records, applies
  policy rules, drafts a decision, and a second AI pass critiques the draft —
  every step visible in a live timeline.
- **Review the decision.** The recommendation comes with full evidence. Approve
  it, reject it with feedback, or edit the reply yourself.

Demo mode notes:

- Everything you do is stored **only in your browser** — no accounts, no shared
  database, nobody else can see your cases. Use “Reset demo data” to start
  fresh.
- Reviewer memory (Hindsight) is **paused** in the hosted demo, so reviewer
  feedback is not saved between sessions.
- AI calls are rate-limited to keep the demo usable for everyone — if you hit
  the limit, take a short break.

## How it works

### 1. Synthetic cases with deterministic truth

A case factory generates a complete, self-consistent world per case: a
passenger account, tickets, payments, a route with an operational disruption,
and — a moment later — an inbound email written by an AI from that ground
truth. Each case also carries hidden "expected" assertions, so tests and evals
know what the right outcome is. The truth mode controls whether the records
support the claim or contradict it.

### 2. The pipeline

Each case runs through a strict sequence of stages, and every stage emits a
trace event with evidence references:

1. **Read the email** — the inbound message is displayed and parsed.
2. **Locate the account** — deterministic lookup by name/email from the email.
3. **Extract claims** — the AI extracts what the passenger is asking for, which
   tickets and stations they reference, and which fields are missing.
4. **Consult knowledge & records** — a keyword search over a scoped knowledge
   base (policy documents written for this demo) plus the passenger's ticket,
   payment and operations records.
5. **Apply policy rules** — deterministic rule tables decide eligibility and
   amounts. The AI cannot invent a refund.
6. **Draft a decision** — the AI drafts the outcome, amount and the reply
   email, citing evidence.
7. **Critique the draft** — a second AI pass checks the draft against the
   evidence and rules before any human sees it.

If key information is missing, the pipeline stops early and drafts follow-up
questions instead; the reviewer can answer them and resume the run.

### 3. Division of labor

Deterministic TypeScript owns identifiers, joins, arithmetic, eligibility,
missing-field checks, persistence and state transitions. The AI (via BAML) is
restricted to bounded language tasks with typed contracts: writing the customer
email, extracting claims, drafting a decision, critiquing the draft, and
rewriting selected text on request. If code can answer, code answers.

### 4. Human in the loop

The reviewer sees the recommendation alongside the evidence it cites: the
email, the extracted claims, the rule evaluation, the knowledge excerpts and
the raw records. They can approve, reject (with mandatory feedback) or edit
the draft. Version checks prevent stale reviews, and nothing ships without a
human decision.

### 5. Reviewer learning loop

Every approve/reject/edit becomes a PII-minimized learning record. When the
next case is drafted, relevant guidance from past reviews is recalled into the
drafting context (via a Hindsight memory bank) — as context, never as truth.
In the hosted demo this loop is paused; locally it works against a local
Hindsight server.

## How AI is integrated

All model calls go through **BAML**, which defines typed contracts for each
task (`GenerateCustomerEmail`, `ExtractCaseClaims`, `DraftDecision`,
`CritiqueDecision`, `RewriteResponseText`). The model returns structured,
schema-validated data instead of free text, so the pipeline can reason about
AI output safely.

Guardrails around the model:

- A **critique pass** challenges the draft against the evidence before a human
  ever sees it.
- **Policy rules live in code**, so amounts and eligibility are never up to the
  model.
- The UI is **evidence-first**: every claim in the recommendation links back to
  a record or knowledge excerpt.
- Learning records are **sanitized** (IDs redacted) before they are stored.

## Quality

The project ships with deterministic fixtures — one per topic and truth mode —
that run through the real pipeline with a mocked model and assert the correct
rule outcome, amounts and evidence references. On top of that: a full
`node:test` suite (domain, rules, knowledge, storage, pipeline, review,
memory, API contract, pages, wizard, end-to-end flow) and strict TypeScript
end to end.

```bash
npm test
npm run typecheck
```

## Run it locally

Prerequisites: Node.js 20+, Python 3.10+, Git, curl.

Run the setup wizard. It checks prerequisites, installs dependencies, prompts
for API keys (hidden input, written only to the gitignored `.env.local`),
generates the BAML client, builds the knowledge index, starts a local Hindsight
memory server, initializes the `railops` memory bank, and opens the dashboard:

- Windows (PowerShell 7+): `pwsh ./scripts/setup.ps1` — **tested on Windows**
- macOS / Linux / Git Bash / WSL: `./scripts/setup.sh` — provided, untested

Both wizards are idempotent — re-run to resume; stages whose artifacts already
exist are skipped.

### Manual setup, stage by stage

| Stage | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Secrets | put `GROQ_API_KEY` (required) and optional `PLK_API_KEY` / `HINDSIGHT_API_URL` into `.env.local` (see `.env.example`) |
| Generate BAML client | `npm run baml:generate` |
| Build knowledge index | `npm run knowledge:index` |
| Local memory server | `python -m pip install hindsight-all`, then `hindsight-api` (serves http://localhost:8888) |
| Init memory bank | `npm run memory:init -- --apply` |
| Dev server | `npm run dev` → http://localhost:3000 |

### API keys

| Key | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | **Yes** | Server-side BAML model calls. Never exposed to the browser. |
| `HINDSIGHT_API_URL` | No | Points the memory adapter at a local Hindsight server. Unset = offline mode: reviewer learning stays local. |
| `HINDSIGHT_API_KEY` | No | API key for the Hindsight server when one is configured. |
| `PLK_API_KEY` | No | Live PLK route/disruption seed data. Unset = deterministic cassettes. |

Keys belong in `.env.local` (gitignored). The wizards never echo secrets and
never write them to tracked files.

## Safety notes

**Synthetic data only.** Every case, passenger, ticket, payment, route and
email in this demo is generated from a seeded factory. Anything that looks
like personal data is fake.

**No external actions.** The demo never sends email, refunds money, changes
tickets, or touches real accounts, trains or payment systems. Approving a
decision only updates local state. The only outbound calls are the model API
and, locally, the optional Hindsight memory server.

## Repository layout

| Path | What lives there |
| --- | --- |
| `app/` | The two pages (dashboard, case review) and the API routes |
| `lib/pipeline/` | Case execution pipeline, review state machine, email prep |
| `lib/rules/` | Deterministic policy rule tables and evaluation |
| `lib/domain/` | Synthetic case factory, topics, truth modes |
| `lib/storage/` | App state persistence and migrations |
| `lib/memory/` | Reviewer learning + Hindsight adapter |
| `lib/knowledge/` | Knowledge base indexing and keyword search |
| `baml_src/` | BAML contracts for every model call |
| `knowledge/` | The scoped policy knowledge base (Markdown + index) |
| `scripts/` | Cross-platform setup wizards and tooling |
| `test/` | Full test suite and deterministic fixtures |
