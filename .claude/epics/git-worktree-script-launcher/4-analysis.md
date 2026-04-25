---
issue: 4
title: Implement Git worktree discovery and list UI
analyzed: 2026-04-25T14:19:14Z
estimated_hours: 10
parallelization_factor: 1.8
---

# Parallel Work Analysis: Issue #4

## Overview
Issue #4 adds backend Git worktree discovery/parsing and a frontend list UI with refresh behavior.

## Parallel Streams

### Stream A: Backend Worktree Parsing
**Scope**: Implement `list_worktrees` using `git worktree list --porcelain` with error handling.
**Files**: `src-tauri/src/commands/worktree.rs`
**Can Start**: immediately
**Estimated Hours**: 5
**Dependencies**: none

### Stream B: Frontend Worktree List + Refresh
**Scope**: Render worktree cards and support manual/focus refresh behavior.
**Files**: `src/pages/MainPage.tsx`, `src/App.css`
**Can Start**: after Stream A command contract is stable
**Estimated Hours**: 4
**Dependencies**: Stream A

### Stream C: Compile Validation
**Scope**: Validate TS and Rust compilation after integration.
**Files**: build/check commands
**Can Start**: after Streams A and B
**Estimated Hours**: 1
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- `MainPage.tsx` must map to `WorktreeInfo` from backend command shape.

### Sequential Requirements
- Backend command names and fields must be finalized before UI binding.

## Conflict Risk Assessment
Low. Main conflict point is data contract between frontend and backend.

## Parallelization Strategy
Backend first, then frontend integration, then compile validation.

## Expected Timeline
- With parallel execution: 6h wall time
- Without: 10h
- Efficiency gain: 40%
