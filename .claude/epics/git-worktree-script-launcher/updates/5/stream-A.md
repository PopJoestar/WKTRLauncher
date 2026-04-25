---
issue: 5
stream: implementation
started: 2026-04-25T14:23:17Z
status: completed
---
## Scope
Per-worktree script discovery and launcher buttons.

## Progress
- Implemented `list_scripts` with package.json parsing.
- Added lockfile package manager detection (`pnpm`, `yarn`, `npm`, fallback `npm`).
- Added selected worktree state in UI and script panel per selected worktree.
- Added script launcher buttons and launch feedback state.
- Added explicit empty/error/loading states for script discovery.
- Verified with frontend and Rust compile checks.
