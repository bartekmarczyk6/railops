#!/usr/bin/env bash
set -euo pipefail

if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=8
STAGE_INDEX=0
DRY_RUN=0
ENV_FILE=".env.local"
RAILOPS_DIR=".railops"
DEV_URL="http://localhost:3000"
HINDSIGHT_URL="http://localhost:8888"
WRITTEN_ENV=""
DEV_PID=""
HINDSIGHT_PID=""
PKG_MGR=""
PYTHON_BIN=""
PLATFORM="unknown"

usage() {
  printf 'Usage: %s [--dry-run]\n' "$0"
  printf '  --dry-run  print planned actions without installing, writing, or prompting\n'
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

say()  { printf '  %s\n' "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

stage() {
  STAGE_INDEX=$((STAGE_INDEX + 1))
  if [ "$DRY_RUN" -eq 0 ] && [ -t 1 ]; then
    if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[H'; fi
  fi
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' "$BOLD" "$BLUE" "$STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

fail() {
  printf '  %s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  if [ -n "${2:-}" ]; then printf '  %snext →%s %s\n' "$YELLOW" "$RESET" "$2" >&2; fi
  exit 1
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  %s[dry-run] would run:%s %s\n' "$DIM" "$RESET" "$*"
    return 0
  fi
  "$@"
}

pause() {
  if [ "$DRY_RUN" -eq 1 ] || [ ! -t 0 ]; then return 0; fi
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

confirm() {
  if [ "$DRY_RUN" -eq 1 ] || [ ! -t 0 ]; then return 1; fi
  reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

has() { command -v "$1" >/dev/null 2>&1; }

require_cmd() {
  if has "$1"; then ok "$1 found: $(command -v "$1")"; return 0; fi
  fail "required command '$1' not found" "$2"
}

env_value() {
  [ -f "$ENV_FILE" ] || return 0
  line="$(grep -E "^${1}=" "$ENV_FILE" | tail -n 1 || true)"
  if [ -n "$line" ]; then printf '%s' "${line#*=}"; fi
  return 0
}

env_upsert() {
  if [ "$DRY_RUN" -eq 1 ]; then
    say "[dry-run] would write $1 → $ENV_FILE (value hidden)"
    return 0
  fi
  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ]; then grep -vE "^${1}=" "$ENV_FILE" > "$tmp" || true; fi
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp" 2>/dev/null || true
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV="${WRITTEN_ENV}${WRITTEN_ENV:+, }$1"
  ok "wrote $1 → $ENV_FILE"
}

wait_for_http() {
  i=0
  while [ "$i" -lt "$2" ]; do
    if curl -sf --max-time 10 -o /dev/null "$1"; then return 0; fi
    i=$((i + 1))
    sleep 2
  done
  return 1
}

open_url() {
  if [ "$DRY_RUN" -eq 1 ]; then say "[dry-run] would open $1 in your browser"; return 0; fi
  say "opening $1"
  case "$PLATFORM" in
    macos)
      open "$1" >/dev/null 2>&1 || warn "could not open a browser; visit $1 manually" ;;
    windows|wsl)
      if has wslview; then wslview "$1" >/dev/null 2>&1 || true
      elif has explorer.exe; then explorer.exe "$1" >/dev/null 2>&1 || true
      elif has xdg-open; then xdg-open "$1" >/dev/null 2>&1 || true
      else warn "could not open a browser; visit $1 manually"; fi ;;
    *)
      if has xdg-open; then xdg-open "$1" >/dev/null 2>&1 || warn "could not open a browser; visit $1 manually"
      else warn "could not open a browser; visit $1 manually"; fi ;;
  esac
}

trap 'printf "  %s✗ setup failed (line %s) — re-run ./scripts/setup.sh to resume%s\n" "$RED" "$LINENO" "$RESET" >&2' ERR

OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$OS_NAME" in
  Darwin) PLATFORM="macos" ;;
  Linux)
    PLATFORM="linux"
    if [ -r /proc/version ] && grep -qiE 'microsoft|wsl' /proc/version; then PLATFORM="wsl"; fi ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *) PLATFORM="unknown" ;;
esac

printf '\n%s%s  RailOps local setup%s\n' "$BOLD" "$BLUE" "$RESET"
printf '  %s%s stages · safe to re-run · Ctrl-C anytime, then re-run to resume%s\n' "$DIM" "$TOTAL_STAGES" "$RESET"
if [ "$DRY_RUN" -eq 1 ]; then
  printf '  %s[dry-run] no installs, no writes, no network, no prompts%s\n' "$YELLOW" "$RESET"
fi
printf '\n'
pause "Ready to start?"

stage "Preflight"
say "OS: $OS_NAME ($ARCH) · platform: $PLATFORM"
require_cmd node "install Node.js 20+ from https://nodejs.org (winget install OpenJS.NodeJS.LTS / brew install node / fnm)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ required (found $(node --version 2>/dev/null || echo none))" "upgrade from https://nodejs.org or via fnm/nvm"
fi
ok "node $(node --version)"
if has npm; then PKG_MGR="npm"
elif has pnpm; then PKG_MGR="pnpm"
else fail "neither npm nor pnpm found" "install Node.js (bundles npm): https://nodejs.org"; fi
ok "package manager: $PKG_MGR"
is_python() {
  has "$1" && "$1" --version 2>&1 | grep -qE '^Python [0-9]+\.'
}
if is_python python3; then PYTHON_BIN="python3"
elif is_python python; then PYTHON_BIN="python"
else fail "python3 not found (the Windows Store app alias does not count)" "install Python 3.10+: https://python.org (winget install Python.Python.3.12 / brew install python)"; fi
ok "$PYTHON_BIN $($PYTHON_BIN --version 2>&1)"
require_cmd git "install Git from https://git-scm.com (winget install Git.Git / brew install git)"
require_cmd npx "npx ships with npm; reinstall Node.js from https://nodejs.org"
require_cmd curl "install curl (winget install curl.curl / brew install curl)"
if has ctx7; then ok "ctx7 found"; else warn "ctx7 not found — only needed for docs lookups; setup continues"; fi
if [ "$DRY_RUN" -eq 1 ]; then
  say "[dry-run] would ensure writable directories: ./, $RAILOPS_DIR/, knowledge/"
else
  for d in "." "$RAILOPS_DIR" "knowledge"; do
    mkdir -p "$d" || fail "cannot create directory $d" "check permissions on $(pwd)"
    probe="$d/.write-test-$$"
    if touch "$probe" 2>/dev/null; then rm -f "$probe"; else fail "directory $d is not writable" "check permissions on $(pwd)/$d"; fi
  done
  ok "writable: ./, $RAILOPS_DIR/, knowledge/"
fi

stage "Install dependencies"
if [ -d node_modules ] && { [ ! -f package-lock.json ] || [ ! package-lock.json -nt node_modules ]; }; then
  ok "node_modules present and not stale — skipping (force: rm -rf node_modules && $PKG_MGR install)"
else
  run "$PKG_MGR" install || fail "$PKG_MGR install failed" "$PKG_MGR cache clean --force && $PKG_MGR install"
fi

stage "Secrets → $ENV_FILE"
say "GROQ_API_KEY (required) — create one at https://console.groq.com/keys"
if [ "$DRY_RUN" -eq 1 ]; then
  if [ -n "$(env_value GROQ_API_KEY)" ]; then
    say "[dry-run] GROQ_API_KEY already in $ENV_FILE — would keep it"
  else
    say "[dry-run] would prompt for GROQ_API_KEY (hidden input) and write it to $ENV_FILE"
  fi
  say "[dry-run] would offer optional PLK_API_KEY (declining keeps deterministic cassettes)"
else
  keep=0
  if [ -n "$(env_value GROQ_API_KEY)" ]; then
    if confirm "GROQ_API_KEY is already set in $ENV_FILE — keep it?"; then keep=1; fi
  fi
  if [ "$keep" -eq 1 ]; then
    ok "kept existing GROQ_API_KEY in $ENV_FILE"
  else
    printf '  %sPaste your Groq API key (input hidden):%s ' "$BOLD" "$RESET"
    groq_input=""
    read -rs groq_input || true
    printf '\n'
    if [ -z "$groq_input" ]; then
      fail "GROQ_API_KEY is required" "create a key at https://console.groq.com/keys, then re-run ./scripts/setup.sh"
    fi
    env_upsert GROQ_API_KEY "$groq_input"
    groq_input=""
  fi
  if [ -n "$(env_value PLK_API_KEY)" ]; then
    ok "kept existing PLK_API_KEY in $ENV_FILE"
  elif confirm "Configure live PLK route data? (needs PLK_API_KEY; 'no' uses deterministic cassettes)"; then
    printf '  %sPaste your PLK API key (input hidden):%s ' "$BOLD" "$RESET"
    plk_input=""
    read -rs plk_input || true
    printf '\n'
    if [ -n "$plk_input" ]; then env_upsert PLK_API_KEY "$plk_input"; else warn "empty PLK_API_KEY — continuing with cassettes"; fi
    plk_input=""
  else
    ok "PLK_API_KEY skipped — deterministic cassettes under cassettes/plk/ will be used"
  fi
fi

stage "Generate BAML client"
if [ -d baml_client ]; then
  ok "baml_client/ exists — skipping (force: npm run baml:generate)"
else
  run npm run baml:generate || fail "BAML generation failed" "check baml_src/*.baml, then re-run: npm run baml:generate"
fi

stage "Build knowledge index"
if [ -f knowledge/index.json ]; then
  ok "knowledge/index.json exists — skipping (force: npm run knowledge:index)"
else
  run npm run knowledge:index || fail "knowledge index build failed" "check knowledge/*.md, then re-run: npm run knowledge:index"
fi

stage "Local memory (Hindsight)"
if [ "$DRY_RUN" -eq 1 ]; then
  say "[dry-run] would: $PYTHON_BIN -m pip install hindsight-all (only if hindsight-api is missing)"
  say "[dry-run] would: start hindsight-api at $HINDSIGHT_URL (log: $RAILOPS_DIR/hindsight-api.log)"
  say "[dry-run] would: write HINDSIGHT_API_URL → $ENV_FILE (only if unset)"
  say "[dry-run] would: npm run memory:init -- --apply (idempotent bank + mental models)"
else
  if has hindsight-api; then
    ok "hindsight-api found: $(command -v hindsight-api)"
  else
    say "installing hindsight-all via pip (self-contained local server; no separate database install)"
    run "$PYTHON_BIN" -m pip install hindsight-all || fail "pip install hindsight-all failed" "$PYTHON_BIN -m pip install --user hindsight-all, then add the pip Scripts/bin directory to PATH"
    if has hindsight-api; then ok "hindsight-api installed"; else warn "hindsight-api not on PATH yet — reopen your shell and re-run"; fi
  fi
  if wait_for_http "$HINDSIGHT_URL/health" 1; then
    ok "hindsight-api already running at $HINDSIGHT_URL"
  elif has hindsight-api; then
    say "starting hindsight-api (log: $RAILOPS_DIR/hindsight-api.log)"
    nohup hindsight-api > "$RAILOPS_DIR/hindsight-api.log" 2>&1 &
    HINDSIGHT_PID=$!
    printf '%s\n' "$HINDSIGHT_PID" > "$RAILOPS_DIR/hindsight-api.pid"
    if wait_for_http "$HINDSIGHT_URL/health" 60; then
      ok "hindsight-api healthy at $HINDSIGHT_URL (pid $HINDSIGHT_PID)"
    else
      tail -n 20 "$RAILOPS_DIR/hindsight-api.log" 2>/dev/null || true
      fail "hindsight-api did not become healthy at $HINDSIGHT_URL" "inspect $RAILOPS_DIR/hindsight-api.log, then start manually: hindsight-api"
    fi
  else
    fail "hindsight-api is unavailable" "reopen your shell so pip's bin directory is on PATH, then re-run ./scripts/setup.sh"
  fi
  if [ -n "$(env_value HINDSIGHT_API_URL)" ]; then
    ok "kept existing HINDSIGHT_API_URL in $ENV_FILE"
  else
    env_upsert HINDSIGHT_API_URL "$HINDSIGHT_URL"
  fi
  hs_url="$(env_value HINDSIGHT_API_URL)"
  if [ -z "$hs_url" ]; then hs_url="$HINDSIGHT_URL"; fi
  export HINDSIGHT_API_URL="$hs_url"
  hs_key="$(env_value HINDSIGHT_API_KEY)"
  if [ -n "$hs_key" ]; then export HINDSIGHT_API_KEY="$hs_key"; fi
  say "initializing bank 'railops' + mental models (idempotent; existing data is kept)"
  run npm run memory:init -- --apply || fail "memory:init failed" "preview with: npm run memory:init; inspect $RAILOPS_DIR/hindsight-api.log"
fi

stage "Start dev server"
if [ "$DRY_RUN" -eq 1 ]; then
  say "[dry-run] would: npm run dev (log: $RAILOPS_DIR/dev-server.log) and wait for $DEV_URL"
elif wait_for_http "$DEV_URL" 1; then
  ok "dev server already responding at $DEV_URL"
else
  say "starting npm run dev (log: $RAILOPS_DIR/dev-server.log)"
  npm run dev > "$RAILOPS_DIR/dev-server.log" 2>&1 &
  DEV_PID=$!
  printf '%s\n' "$DEV_PID" > "$RAILOPS_DIR/dev-server.pid"
  if wait_for_http "$DEV_URL" 45; then
    ok "dev server ready at $DEV_URL (pid $DEV_PID)"
  else
    tail -n 20 "$RAILOPS_DIR/dev-server.log" 2>/dev/null || true
    fail "dev server did not respond at $DEV_URL" "inspect $RAILOPS_DIR/dev-server.log, then start manually: npm run dev"
  fi
fi

stage "Open dashboard"
open_url "$DEV_URL"

printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
if [ -n "$WRITTEN_ENV" ]; then note "wrote to $ENV_FILE: $WRITTEN_ENV"; fi
if [ -n "$DEV_PID" ]; then
  say "dashboard:      $DEV_URL"
  say "stop dev server: kill $DEV_PID"
else
  say "dashboard: $DEV_URL (if the dev server runs in this terminal, stop it with Ctrl+C)"
fi
if [ -n "$HINDSIGHT_PID" ]; then say "stop hindsight:  kill $HINDSIGHT_PID"; fi
say "re-run anytime: ./scripts/setup.sh (idempotent)"
