---
name: git-worktree-script-launcher
status: backlog
created: 2026-04-25T13:54:07Z
updated: 2026-04-25T14:38:24Z
progress: 100%
prd: .claude/prds/git-worktree-script-launcher.md
github: https://github.com/PopJoestar/WKTRLauncher/issues/1
---

# Epic: git-worktree-script-launcher

## Overview
Deliver a Tauri desktop app that lets users select a repository, see all Git worktrees, and launch package scripts from each worktree with one click. The implementation prioritizes low cognitive load and safe defaults so non-expert developers can complete common workflows without terminal knowledge.

## Architecture Decisions
1. Desktop shell: Tauri v2 with Rust command layer and a TypeScript frontend.
2. Frontend framework: React + TypeScript for fast UI iteration and clear state modeling.
3. Git integration: shell out to local Git CLI (`git worktree list --porcelain`) for compatibility and predictable behavior.
4. Script execution: Rust backend spawns package manager commands in explicit `cwd` per worktree; frontend subscribes to streamed logs/events.
5. State persistence: lightweight local storage (Tauri store or equivalent JSON-backed state) for recent repositories, user preferences, and recent run metadata.
6. Safety model: pre-run risk confirmation for script-name patterns and strict run-context display (repo path + worktree path + branch before execution).

## Technical Approach
### Frontend Components
1. Repository Picker
- Folder picker trigger, repository validation status, and recent repositories list.

2. Worktree List Panel
- Displays each worktree card with path, branch/ref, role (main/additional), refresh action, and status indicators.

3. Script Launcher Panel
- Per-worktree script buttons parsed from `package.json`, with disabled/loading states and run history badges.

4. Run Console View
- Live log stream, exit code status, elapsed time, and quick failure troubleshooting hints.

5. Settings View
- Package manager override, risk-confirmation behavior, and local history/log cache controls.

### Backend Services
1. `select_repository` / `validate_repository`
- Validate `.git` context and normalize repository path.

2. `list_worktrees`
- Execute and parse `git worktree list --porcelain`; return structured worktree objects.

3. `list_scripts`
- Detect lockfiles and parse `package.json` scripts for each worktree.

4. `run_script`
- Resolve effective package manager, spawn process in target worktree, stream stdout/stderr, track running state, return completion metadata.

5. `get_app_state` / `save_app_state`
- Persist recent repositories, package manager preference, and recent run summaries.

### Infrastructure
1. Cross-platform command execution strategy for macOS/Windows with normalized path handling.
2. Local event channel between Tauri backend and frontend for log streaming and run lifecycle updates.
3. Basic telemetry hooks (local-only at v1) for performance and mislaunch detection metrics.

## Implementation Strategy
1. Establish project scaffold and command contract first so UI and backend can iterate in parallel.
2. Implement repository/worktree discovery path end-to-end before script execution features.
3. Add script discovery and execution with strong guardrails (explicit run context, duplicate-run prevention).
4. Layer usability polish, settings persistence, and error messaging after core workflows are stable.
5. Validate against representative repositories (single worktree, many worktrees, missing scripts, broken dependencies).

## Task Breakdown Preview
1. Scaffold Tauri + React TypeScript app, define backend command interfaces, and set up shared typed models.
2. Implement repository selection/validation and recent-repository persistence.
3. Implement Git worktree discovery and parser with refresh behavior and frontend list rendering.
4. Implement script discovery (`package.json` + lockfile manager detection) and per-worktree script UI.
5. Implement script execution pipeline with live logs, run status, duplicate-run guard, and error surfaces.
6. Implement risk confirmations, safe defaults, and plain-language UX copy for non-expert users.
7. Implement settings view (package manager override, cache/history controls) and state persistence wiring.
8. Add integration and UX acceptance tests for primary flow and major failure cases.

Parallelization opportunities:
- Tasks 2 and 3 can run in parallel after Task 1.
- Task 4 can begin once Task 3 returns stable worktree model.
- Tasks 6 and 7 can run in parallel after Task 5.
- Task 8 runs after Tasks 2-7 are merged.

## Dependencies
1. Local Git CLI availability in user environment.
2. Node ecosystem tools (`pnpm`, `npm`, or `yarn`) on user machine.
3. Tauri runtime and Rust toolchain in development environment.
4. Chosen UI component/styling library (decision deferred; keep minimal and accessibility-focused).

## Success Criteria (Technical)
1. Worktrees are listed within 2 seconds for repositories up to 30 worktrees.
2. Script execution always runs in selected worktree path; zero known path misrouting defects.
3. Primary flow works end-to-end on macOS and Windows test environments.
4. Failure cases (invalid repo, missing Node/package manager, script non-zero exit) produce deterministic and user-readable errors.

## Estimated Effort
1. Setup and core command/data model: 1-2 days.
2. Discovery and script execution core: 3-5 days.
3. Usability, settings, and hardening: 2-3 days.
4. Testing and release readiness: 1-2 days.

Total: approximately 7-12 engineering days for a production-ready v1 by one developer, depending on UX polish depth and test rigor.

## Tasks Created
- [ ] 001.md - Scaffold Tauri + React app and shared command models (parallel: false)
- [ ] 002.md - Build repository selection, validation, and recent repository persistence (parallel: true)
- [ ] 003.md - Implement Git worktree discovery and list UI (parallel: true)
- [ ] 004.md - Implement per-worktree script discovery and launcher buttons (parallel: true)
- [ ] 005.md - Build script execution pipeline with live logs and run state (parallel: false)
- [ ] 006.md - Add safety confirmations and non-expert UX guidance (parallel: true)
- [ ] 007.md - Implement settings and persistent app state controls (parallel: true)
- [ ] 008.md - Add integration and UX acceptance tests for core workflows (parallel: false)

Total tasks: 8
Parallel tasks: 5
Sequential tasks: 3
Estimated total effort: 74 hours
