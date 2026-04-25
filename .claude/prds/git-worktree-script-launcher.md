---
name: git-worktree-script-launcher
description: Tauri desktop app to discover repository worktrees and run package scripts with one click.
status: backlog
created: 2026-04-25T13:52:42Z
---

# PRD: git-worktree-script-launcher

## Executive Summary
Build a cross-platform Tauri desktop application that allows a user to select a Git repository, instantly view all linked worktrees, and execute package scripts from each worktree through simple buttons. The product should reduce terminal usage and Git/package manager complexity so non-expert developers can switch contexts and run standard tasks safely.

## Problem Statement
Teams using `git worktree` often manage many active branches at once. Running scripts in the correct worktree requires terminal commands, path awareness, and package manager knowledge, which is error-prone for non-expert developers. Users need a visual tool that removes command-line friction and makes script execution obvious and safe.

## User Stories
1. As a developer with limited Git CLI experience, I want to pick a repository folder and immediately see all worktrees so I can understand what is available without running commands.
Acceptance criteria:
- Given a valid Git repository, when I select it, then the app lists all worktrees with path and branch.
- Given no additional worktrees, when I select the repository, then the main worktree still appears clearly.

2. As a developer working across branches, I want to see runnable package scripts for each worktree so I can start tasks with one click.
Acceptance criteria:
- Given a worktree with `package.json`, when I select it, then scripts are shown as labeled buttons.
- Given multiple worktrees, when I switch between them, then script lists update in under 1 second for typical repos.

3. As a non-expert developer, I want safe execution feedback so I know whether a script succeeded or failed and how to recover.
Acceptance criteria:
- Given a script run, when it starts, then the UI shows running state and disables duplicate run clicks for that script.
- Given completion, then the UI shows exit status and a readable output summary.
- Given failure, then the UI clearly indicates failure and provides access to full logs.

4. As a returning user, I want the app to remember my repository so I can reopen and continue quickly.
Acceptance criteria:
- Given I have selected a repository before, when I relaunch the app, then the last repository is preselected if still valid.
- Given the repository path is no longer available, then the app asks me to choose a new location and explains why.

## Functional Requirements
1. Repository selection
- Support selecting a local folder through a file picker.
- Validate that selection is a Git repository before enabling worktree features.

2. Worktree discovery
- Retrieve worktrees via `git worktree list --porcelain` (or equivalent robust parsing source).
- Display at minimum: worktree path, branch/ref, and whether it is the main checkout.
- Offer manual refresh and automatic refresh on app focus.

3. Script discovery
- Detect `package.json` per worktree.
- Parse and display available scripts under a clear section per worktree.
- Show a clear empty state for worktrees without scripts.

4. Script execution
- Run selected script in the target worktree directory.
- Detect package manager from lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) with override option.
- Stream log output in-app and persist recent logs for quick review.
- Prevent concurrent duplicate execution of the same script in the same worktree unless user explicitly re-runs after completion.

5. Usability and safety
- Provide plain-language labels and helper text; avoid Git/package-manager jargon where possible.
- Confirm destructive or long-running scripts when script names match configurable risk patterns (for example: `clean`, `reset`, `migrate`).
- Provide clear error messages for common failures (missing Node, missing dependencies, invalid repository).

6. Settings and persistence
- Persist recent repositories and preferred package manager override.
- Allow clearing local app history/log cache from settings.

## Non-Functional Requirements
1. Platform support: macOS and Windows in first release; Linux support is desirable but not required for v1.
2. Performance: list worktrees within 2 seconds for repositories with up to 30 worktrees on standard developer hardware.
3. Reliability: script execution must run in the selected worktree path only and never fall back silently to another directory.
4. Security: no remote code execution features beyond running local package scripts selected by the user.
5. Accessibility: keyboard navigable primary actions and sufficient color contrast in status indicators.

## Success Criteria
1. New users can complete the flow "select repository -> choose worktree -> run script" in under 60 seconds without terminal usage.
2. At least 90% of script runs are launched from the intended worktree in pilot usage (measured via execution path telemetry or test instrumentation).
3. User-reported setup friction is reduced by at least 50% versus current terminal-based workflow in team feedback surveys.
4. Worktree refresh and script list display meet performance targets (2 seconds max for stated repository size).

## Constraints & Assumptions
1. The initial scope targets JavaScript/TypeScript projects with `package.json`.
2. Users have Git and Node toolchain installed locally.
3. Scripts are executed on the local machine under the current user account.
4. Tauri backend commands will mediate filesystem and process access.
5. No mandatory authentication or cloud backend is required for v1.

## Out of Scope
1. Editing or creating Git worktrees from the UI.
2. Supporting non-Node script ecosystems in v1 (for example Python poetry tasks, Rust cargo aliases).
3. Advanced terminal emulation features beyond log streaming and status.
4. Team collaboration features (shared profiles, remote execution, multi-user sync).
5. Automatic dependency installation or environment bootstrapping workflows.

## Dependencies
1. Tauri runtime and command bridge for native operations.
2. Git CLI available on host machine.
3. Node package managers (`pnpm`, `npm`, `yarn`) installed as needed by target projects.
4. UI framework choice for Tauri frontend (to be decided during epic architecture decisions).
