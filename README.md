# RailOps Demo

Local, two-page demo: synthetic passenger support cases run through a typed
BAML drafting pipeline against a scoped knowledge base, with reviewer-approved
decisions shown alongside full evidence. See `PRODUCT.md`, `DESIGN.md`, and
`CONTEXT.md`.

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

### Stages, one command at a time

| Stage | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Secrets | put `GROQ_API_KEY` (required) and optional `PLK_API_KEY` into `.env.local` (see `.env.example`) |
| Generate BAML client | `npm run baml:generate` |
| Build knowledge index | `npm run knowledge:index` |
| Local memory server | `python -m pip install hindsight-all`, then `hindsight-api` (serves http://localhost:8888) |
| Init memory bank | `npm run memory:init -- --apply` |
| Dev server | `npm run dev` → http://localhost:3000 |

## Tests

- `npm test` — node:test suite via tsx
- `npm run typecheck` — TypeScript check
