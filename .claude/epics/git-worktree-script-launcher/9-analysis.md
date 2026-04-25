---
issue: 9
title: Add integration and UX acceptance tests for core workflows
analyzed: 2026-04-25T14:38:24Z
estimated_hours: 12
parallelization_factor: 1.3
---

# Parallel Work Analysis: Issue #9

## Overview
Issue #9 adds deterministic integration-style tests for the main user workflow and critical failure states in the launcher UI.

## Parallel Streams

### Stream A: Test Harness + Config
**Scope**: Add Vitest + jsdom + Testing Library setup and test scripts.
**Files**: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/test/setup.ts`
**Can Start**: immediately
**Estimated Hours**: 3
**Dependencies**: none

### Stream B: Primary Flow + Failure Tests
**Scope**: Integration tests for repo validation, worktree selection, script discovery, execution states, risky confirmation, and failures.
**Files**: `src/pages/MainPage.test.tsx`
**Can Start**: after Stream A harness
**Estimated Hours**: 7
**Dependencies**: Stream A

### Stream C: Validation
**Scope**: Run and verify test suite, plus compile checks.
**Files**: test/build/check commands
**Can Start**: after Streams A and B
**Estimated Hours**: 2
**Dependencies**: Stream A, Stream B

## Coordination Points
### Shared Files
- MainPage test mocks must mirror `tauriClient` contract.

### Sequential Requirements
- Test environment config must load before test execution.

## Conflict Risk Assessment
Low. Test-only changes with configuration coupling.

## Parallelization Strategy
Set up harness first, then implement tests, then validate all commands.

## Expected Timeline
- With parallel execution: 9h wall time
- Without: 12h
- Efficiency gain: 25%
