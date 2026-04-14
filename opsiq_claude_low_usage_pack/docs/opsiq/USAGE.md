# Exact operating procedure with Claude Code

## One-time setup
1. Add all files from this pack to the repo.
2. Commit them.
3. Open Claude Code in the repo root.
4. Make sure Claude can read `CLAUDE.md`.

## For each slice
Use a fresh thread or `/clear`.

### Prompt sequence
1. Paste the short start prompt from `docs/opsiq/prompts/start-slice.txt`
2. Replace the module slice path
3. Wait for implementation
4. Paste `docs/opsiq/prompts/audit-slice.txt`
5. Wait for fixes
6. Paste `docs/opsiq/prompts/integrate-slice.txt`
7. Verify locally
8. Update status files using `docs/opsiq/prompts/update-status.txt`

## Do not do these
- Do not paste the full module spec into chat.
- Do not ask for schema + backend + UI together.
- Do not let Claude decide the next step.
- Do not keep working in one giant conversation.
- Do not use Opus for routine CRUD or UI work.

## Model choice
- Sonnet: default for almost everything
- Haiku: mechanical edits, docs, repetitive tests, renames
- Opus: only when genuinely stuck on architecture or deep debugging
