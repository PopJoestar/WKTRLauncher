---
issue: 6
title: Build script execution pipeline with live logs and run state
analyzed: 2026-04-25T14:30:19Z
estimated_hours: 14
parallelization_factor: 1.6
---

# Parallel Work Analysis: Issue #6

## Overview
Issue #6 implements script execution in the selected worktree with live log streaming, duplicate-run prevention, and run status tracking in the UI.

## Parallel Streams

### Stream A: Backend Execution + Event Streaming
**Scope**: Real `run_script` implementation, stdout/stderr event emission, and run-key lock enforcement.
**Files**: `src-tauri/src/commands/script.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/models.rs`
**Can Start**: immediately
**Estimated Hours**: 8
**Dependencies**: none

### Stream B: Frontend Run Console + Run State
**Scope**: Subscribe to script output events, show logs/status, disable duplicate launches, retain recent run summaries.
**Files**: `src/pages/MainPage.tsx`, `src/App.css`
**Can Start**: after Stream A event contract is stable
**Estimated Hours**: 5
**Dependencies**: Stream A

### Stream C: Integration Validation
**Scope**: Validate TypeScript and Rust compile against updated execution contracts.
**Files**: build/check commands
**Can Start**: after Streams A and B
**Estimated Hours**: 1
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- Event payload shape must match frontend listener (`script-run-output`).

### Sequential Requirements
- Backend event and run status schema should be finalized before frontend console wiring.

## Conflict Risk Assessment
Medium. Backend/Frontend are coupled through event schema and run state semantics.

## Parallelization Strategy
Backend pipeline first, then frontend integration, then compile validation.

## Expected Timeline
- With parallel execution: 9h wall time
- Without: 14h
- Efficiency gain: 35%
