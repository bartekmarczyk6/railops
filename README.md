# RailOps Demo

Local, two-page demo: synthetic passenger support cases run through a typed
BAML drafting pipeline against a scoped knowledge base, with reviewer-approved
decisions shown alongside full evidence. See `PRODUCT.md`, `DESIGN.md`, and
`CONTEXT.md`.

> **Synthetic data only.** Every case, passenger, ticket, payment, route and
> email in this demo is generated locally from a seeded factory. Anything that
> looks like personal data is fake and labelled as synthetic in the UI.

> **No external actions.** This demo never sends email, refunds money, changes
> tickets, or accesses real accounts, real trains or real payment systems.
> Approving a decision only updates local JSON state. The only outbound network
> calls are the BAML model API (Groq), the optional local Hindsight memory
> server, and the optional PLK route-seed API when `PLK_API_KEY` is set.

## Quick start

Prerequisites: Node.js 20+, Python 3.10+, Git, curl.

Run the setup wizard. It checks prerequisites, installs dependencies, prompts
for API keys (hidden input, written only to the gitignored `.env.local`),
generates the BAML client, builds the knowledge index, starts a local Hindsight
memory server, initializes the `railops` bank, and opens the dashboard:

- macOS / Linux / Git Bash / WSL: `./scripts/setup.sh`
- Windows (PowerShell 7+): `pwsh ./scripts/setup.ps1`

Both wizards are idempotent — re-run to resume; stages whose artifacts already
exist are skipped. Both support a dry-run that changes nothing:

```bash
./scripts/setup.sh --dry-run
pwsh ./scripts/setup.ps1 -DryRun
```

Verify the wizards (syntax checks + dry-run, no installs):

```bash
bash scripts/verify-setup.sh
pwsh scripts/verify-setup.ps1
```

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

## API keys

| Key | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | **Yes** | Server-side BAML model calls (Groq, OpenAI-compatible endpoint). Never exposed to the browser. |
| `HINDSIGHT_API_URL` | No | Points the memory adapter at a local Hindsight server. Unset = offline mode: reviewer learning stays local, recall returns empty context. |
| `HINDSIGHT_API_KEY` | No | API key for the Hindsight server when one is configured. |
| `PLK_API_KEY` | No | Live PLK route/disruption seed data. Unset = deterministic cassettes under `cassettes/plk/`. |

Keys belong in `.env.local` (gitignored). The wizards never echo secrets and
never write them to tracked files.

## Architecture

```text
                 ┌──────────────────────────── Next.js (local only) ───────────────────────────┐
                 │                                                                              │
 Browser ──────► │  /  dashboard            /case/[id]  review workspace                        │
                 │      │                         │                                             │
                 │      ▼                         ▼                                             │
                 │  app/api/cases ── create / list / get / run (SSE) / review                   │
                 │      │                                                                       │
                 │      ▼                                                                       │
                 │  case factory (seeded, deterministic)          local JSON store (.railops/)  │
                 │      │                                              ▲                        │
                 │      ▼                                              │                        │
                 │  pipeline: email → claims → knowledge+records → rules → draft → critique     │
                 │      │          │          │                 │                               │
                 │      │          │          ▼                 ▼                               │
                 │      │          │   knowledge/index.json  lib/rules (policy tables)          │
                 │      ▼          ▼                                                            │
                 │  BAML client (Groq)            Hindsight adapter (optional, local)           │
                 └──────┬───────────────────────────────┬───────────────────────────────────────┘
                        ▼                               ▼
               api.groq.com (LLM only)        localhost:8888 (memory only)
```

Deterministic TypeScript owns identifiers, joins, arithmetic, eligibility,
missing-field checks, persistence and state transitions. BAML is restricted to
bounded language tasks: writing the customer email, extracting claims, drafting
a decision and critiquing the draft. Hindsight holds reviewer learning only —
never evidence.

## BAML / Hindsight / Context7 workflow

- **BAML.** Contracts live in `baml_src/` (`GenerateCustomerEmail`,
  `ExtractCaseClaims`, `DraftDecision`, `CritiqueDecision`). Regenerate the
  typed client after any change with `npm run baml:generate` (also runs
  automatically before `npm run build`). The client targets Groq via the
  OpenAI-compatible endpoint using server-only `GROQ_API_KEY`.
- **Hindsight.** Reviewer approve/reject/edit actions produce PII-minimized
  learning records retained in the `railops` bank; future runs recall that
  guidance into drafting. Without `HINDSIGHT_API_URL` everything degrades to
  local-only learning. Initialize the bank with `npm run memory:init -- --apply`
  (idempotent).
- **Context7.** Library APIs are refreshed through Context7 before
  library-dependent work:

  ```bash
  npx ctx7@latest library <name> "<specific question>"
  npx ctx7@latest docs <resolved-id> "<specific question>"
  ```

## Tests

- `npm test` — full node:test suite via tsx (domain, rules, knowledge, storage,
  BAML contract, pipeline, review, memory, API contract, pages, wizard,
  fixtures eval, end-to-end flow).
- `npm run typecheck` — strict TypeScript check.
- `npm run baml:generate` — regenerate the BAML client from `baml_src/`.
- `npm run knowledge:index` — rebuild `knowledge/index.json`.
- `bash scripts/verify-setup.sh` / `pwsh scripts/verify-setup.ps1` — wizard
  syntax checks plus a no-mutation dry run.

Local evals: `fixtures/*.json` defines one fixture per topic × truth mode with
the expected deterministic outcome. `runLocalEval()` (in `lib/evals/run.ts`)
runs every fixture through the real pipeline with a mocked BAML client and
asserts the deterministic rule outcome, amounts and evidence references. The
live smoke test is opt-in and uses the real Groq key:

```bash
RAILOPS_LIVE_SMOKE=1 npx tsx --tsconfig tsconfig.test.json --test test/evals.test.ts
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `GROQ_API_KEY` errors when running a case | Put the key in `.env.local` (or re-run the wizard) and restart `npm run dev`. |
| `baml_client` missing / stale types | Run `npm run baml:generate`. |
| Knowledge search returns nothing | Run `npm run knowledge:index` to rebuild `knowledge/index.json`. |
| Hindsight learning not recalled | Check `hindsight-api` is running and `HINDSIGHT_API_URL=http://localhost:8888` is in `.env.local`; re-run `npm run memory:init -- --apply`. Without it, learning stays local — the demo still works. |
| Port 3000 already in use | Stop the other process or run `npm run dev -- -p 3001`. |
| Port 8888 already in use | Another Hindsight server is running; reuse it or stop it before the wizard. |
| Wizard fails mid-way | Re-run it — stages are idempotent. Each failure prints a repair command. |
| PLK live route data not used | `PLK_API_KEY` must be set in `.env.local`; otherwise cassette routes are used by design. |
