# /checkpoint — Periodic Objective Checkpoint

Emit the standard objective checkpoint. Used at the start of every new bundle, after any blocker, after every gate result, and at any moment of uncertainty.

Format (no other text):

```
OWNER OUTCOME:
<one sentence — what the owner can do when this stage is complete>

WHAT IS NOW WORKING:
<comma-separated list of closed capabilities — bundle IDs and their owner-visible function>

CURRENT BLOCKER:
<exact blocker — or NONE>

NEXT ACTION:
<single next concrete action — file or command>

SCOPE DRIFT: YES / NO
<if YES: stop and return to active-state.json next_target>
```

Read `.claude/active-state.json` to populate this accurately. Do not reconstruct from memory.

If SCOPE DRIFT = YES: stop all current work, re-read `.claude/active-state.json` and `docs/opsiq/status/REMAINING_STAGE_ACCEPTANCE.yaml`, and re-anchor to the correct next target.
