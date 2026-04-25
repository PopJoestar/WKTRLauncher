---
issue: 2
title: Scaffold Tauri + React app and shared command models
analyzed: 2026-04-25T14:10:48Z
estimated_hours: 10
parallelization_factor: 1.7
---

# Parallel Work Analysis: Issue #2

## Overview
This issue establishes the baseline app structure and command contracts. Work naturally splits into frontend shell scaffolding and backend command/model scaffolding, with a small integration checkpoint.

## Parallel Streams

### Stream A: Frontend Shell + Typed Client
**Scope**: Replace starter demo UI with app shell, routes, and typed client wrapper.
**Files**: `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/pages/*`, `src/lib/*`, `src/models/*`, `package.json`
**Can Start**: immediately
**Estimated Hours**: 4
**Dependencies**: none

### Stream B: Rust Command Modules + Shared Models
**Scope**: Create modular command layout and shared Rust DTOs for repository, worktree, script, and app-state operations.
**Files**: `src-tauri/src/lib.rs`, `src-tauri/src/models.rs`, `src-tauri/src/commands/*`
**Can Start**: immediately
**Estimated Hours**: 4
**Dependencies**: none

### Stream C: Integration + Build Validation
**Scope**: Wire commands to frontend contract and validate TypeScript + Rust compile status.
**Files**: touched across both streams, plus lockfiles/build artifacts where needed
**Can Start**: after Stream A and Stream B
**Estimated Hours**: 2
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- `package.json` dependency changes should land before final frontend build.
- `src-tauri/src/lib.rs` command registration must reflect command names used in `src/lib/tauriClient.ts`.

### Sequential Requirements
- Final compile validation should run after both stream outputs are merged.

## Conflict Risk Assessment
Low to medium. Streams A and B mostly touch separate trees (`src/` vs `src-tauri/src/`). Integration stream has limited overlap and is straightforward.

## Parallelization Strategy
Run Stream A and Stream B concurrently, then run Stream C for final contract and build verification.

## Expected Timeline
- With parallel execution: 6h wall time
- Without: 10h
- Efficiency gain: 40%
