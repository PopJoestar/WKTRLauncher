---
issue: 3
title: Build repository selection, validation, and recent repository persistence
analyzed: 2026-04-25T14:18:21Z
estimated_hours: 8
parallelization_factor: 1.5
---

# Parallel Work Analysis: Issue #3

## Overview
Issue #3 requires a native folder selection flow, strict repository validation, and persistent state restoration for recent repositories.

## Parallel Streams

### Stream A: Backend Repository + Persistence Commands
**Scope**: Add `select_repository`, strengthen `validate_repository`, and persist app state on disk.
**Files**: `src-tauri/src/commands/repository.rs`, `src-tauri/src/commands/app_state.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
**Can Start**: immediately
**Estimated Hours**: 4
**Dependencies**: none

### Stream B: Frontend Repository UX + Restore Logic
**Scope**: Add choose-folder UX, recent repository list, and startup restore behavior.
**Files**: `src/pages/MainPage.tsx`, `src/lib/tauriClient.ts`, `src/App.css`
**Can Start**: immediately
**Estimated Hours**: 3
**Dependencies**: none

### Stream C: Integration Validation
**Scope**: Run frontend and Rust compile checks for the new command contracts and persistence path.
**Files**: build/test commands only
**Can Start**: after Streams A and B
**Estimated Hours**: 1
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- `src/lib/tauriClient.ts` must match Rust command names exactly.

### Sequential Requirements
- Final compile checks run after backend and frontend command wiring is complete.

## Conflict Risk Assessment
Low. Backend and frontend streams mostly touch separate directories.

## Parallelization Strategy
Implement backend and frontend in parallel, then run integrated compile validation.

## Expected Timeline
- With parallel execution: 5h wall time
- Without: 8h
- Efficiency gain: 37%
