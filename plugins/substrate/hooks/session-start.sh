#!/usr/bin/env bash
#
# Substrate plugin — SessionStart hook.
#
# Claude Code SessionStart hooks cannot prompt the user interactively; they can
# only inject context. So this script detects the project's Substrate state and,
# when a decision is needed, injects an instruction telling Claude to ASK the user
# once and then run the /substrate:enable or /substrate:opt-out skill.
#
# State machine (per project directory):
#   - .substrate/config.json present  -> already tracked: inject capture guidance.
#   - path listed in ~/.substrate/optout -> user declined here: stay silent.
#   - otherwise (only on a fresh session) -> inject the "ask the user" instruction.
#
# Always exits 0 so a hiccup here never blocks the session.

set -u

input="$(cat 2>/dev/null || true)"

# Extract a top-level string field from the hook's JSON stdin without a JSON parser.
json_field() {
  printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n1
}

cwd="$(json_field cwd)"
[ -z "$cwd" ] && cwd="${CLAUDE_PROJECT_DIR:-$PWD}"
source="$(json_field source)"
[ -z "$source" ] && source="startup"

optout_file="$HOME/.substrate/optout"

# 1) Already tracked by Substrate.
if [ -f "$cwd/.substrate/config.json" ]; then
  cat <<'EOF'
<substrate>
This project is tracked by Substrate (a git-backed shared context layer). When the
conversation produces durable project knowledge, capture it so it persists and syncs:

- Record it: `substrate add "<statement>" --type <constraint|decision|note|task|entity|runbook|snippet> [--tag <tag>]`
- Personal / machine-specific notes: add `--private` (stored in gitignored .substrate/*.priv.jsonl).
- After capturing, run `substrate sync push`, then remind the user to commit `.substrate/` with git.

If you just cloned this repo, run `substrate sync pull` first to load existing context into the local cache.
Use the `capture-context` skill for the full protocol.
</substrate>
EOF
  exit 0
fi

# 2) User opted out for this project on this machine.
if [ -f "$optout_file" ] && grep -qxF "$cwd" "$optout_file" 2>/dev/null; then
  exit 0
fi

# 3) Not set up yet — prompt only on a genuinely new session (not resume/compact).
case "$source" in
  startup | clear)
    cat <<'EOF'
<substrate-setup>
This project is NOT yet tracked by Substrate (a git-backed shared context layer that
stores decisions/constraints in committed .substrate/ files — no server, no accounts).

Ask the user exactly once, conversationally:
  "Want to track this project's context with Substrate? It records decisions and
   constraints in committed .substrate/ files so they persist across sessions and
   sync with teammates through git."

- If they say yes  -> run the `/substrate:enable` skill.
- If they say no   -> run the `/substrate:opt-out` skill (so you won't be asked again here).
Do not nag: ask only this once for this project.
</substrate-setup>
EOF
    ;;
esac

exit 0
