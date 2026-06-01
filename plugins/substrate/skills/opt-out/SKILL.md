---
description: Decline Substrate context tracking for the current project so the plugin stops asking. Invoke only when the user has said they do not want to track this project with Substrate.
disable-model-invocation: true
---

# Opt out of Substrate for this project

The user does not want to track this project with Substrate. Record the decision so the
SessionStart hook won't ask again on this machine.

## Steps

1. Append this project's absolute path to the per-machine opt-out list (created if absent):

   ```bash
   mkdir -p "$HOME/.substrate" && pwd >> "$HOME/.substrate/optout"
   ```

   This file lives in the user's home directory, is per-machine, and is never committed —
   so opting out here does not affect teammates.

2. Briefly confirm: "Okay — I won't ask about Substrate for this project again. Run
   `/substrate:enable` anytime if you change your mind."

Do not create any `.substrate/` files. Opting out means leaving the project untouched.
