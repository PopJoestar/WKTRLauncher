---
issue: 3
stream: implementation
started: 2026-04-25T14:15:17Z
status: completed
---
## Scope
Repository selection, validation, and persistence across relaunches.

## Progress
- Added native folder picker command: `select_repository`.
- Improved validation for missing/non-directory/non-git paths.
- Added persisted app state store on disk (`app-state.json` in app data directory).
- Added startup restore of `lastRepositoryPath` and recent repository list.
- Added recent repository quick-select UI.
- Verified with `pnpm build` and Rust compile check.
