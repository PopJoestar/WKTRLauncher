---
issue: 5
title: Implement per-worktree script discovery and launcher buttons
analyzed: 2026-04-25T14:25:27Z
estimated_hours: 8
parallelization_factor: 1.7
---

# Parallel Work Analysis: Issue #5

## Overview
Issue #5 requires backend script discovery from each worktree and a frontend script launcher panel tied to selected worktree context.

## Parallel Streams

### Stream A: Backend Script Discovery
**Scope**: Parse `package.json` scripts and detect package manager by lockfiles.
**Files**: `src-tauri/src/commands/script.rs`
**Can Start**: immediately
**Estimated Hours**: 4
**Dependencies**: none

### Stream B: Frontend Script Launcher UI
**Scope**: Selected-worktree script list, launch buttons, and empty/error states.
**Files**: `src/pages/MainPage.tsx`, `src/App.css`
**Can Start**: after Stream A command contract is stable
**Estimated Hours**: 3
**Dependencies**: Stream A

### Stream C: Integration Validation
**Scope**: Validate TS and Rust compile with updated contracts.
**Files**: build/check commands
**Can Start**: after Streams A and B
**Estimated Hours**: 1
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- Script model payloads from Rust must match frontend `ScriptInfo` shape.

### Sequential Requirements
- Backend script response should be finalized before frontend binding.

## Conflict Risk Assessment
Low. One clear integration boundary across command response schema.

## Parallelization Strategy
Backend discovery first, then frontend launcher wiring, then compile checks.

## Expected Timeline
- With parallel execution: 5h wall time
- Without: 8h
- Efficiency gain: 37%
