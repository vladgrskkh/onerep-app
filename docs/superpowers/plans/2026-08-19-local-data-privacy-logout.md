# Local Data Privacy Logout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure logout/account switching cannot expose or upload the previous account's local private data.

**Architecture:** Use the safer pre-release design: logout clears the complete SQLite cache, including exercises, templates, workouts, body weights, progress cache, and sync cursor. Add a monotonically increasing local-store generation so a sync already in flight before the purge cannot write old rows or cursor state after the purge; a later account starts a fresh sync from an empty store.

**Tech Stack:** TypeScript, React Native/Expo, expo-sqlite, Jest/jest-expo.

**Spec:** PR #9 review requirement for phase-4-final (provided in the task request).

## Global Constraints

- Do not redesign the sync API/protocol or navigation.
- Keep all account-private data out of the shared local cache after logout.
- Do not leave dirty operations available to a subsequent account.
- Add regression coverage before production changes.
- Run focused tests, lint, and TypeScript checks; commit locally without pushing.

### Task 1: Add a complete local-cache reset contract

**Files:**
- Modify: `src/shared/db/database.ts`
- Test: `src/shared/db/__tests__/database.test.ts`

**Interfaces:**
- Produce `LocalDb.clearPrivateData(): void`, which deletes every local data table and sync state, and increments a store generation.
- Produce `SyncStore.getDataGeneration(): number` for sync callers to detect a reset.

- [ ] Write a failing test that verifies reset executes deletes for `exercises`, `templates`, `workouts`, `body_weights`, `progress_cache`, and `sync_state`, and advances the generation.
- [ ] Run the focused database test and confirm it fails because the reset API is absent.
- [ ] Implement the minimal reset method and store-generation accessor.
- [ ] Run the focused database test and confirm it passes.

### Task 2: Make in-flight sync reset-safe

**Files:**
- Modify: `src/shared/sync/SyncEngine.ts`
- Modify: `src/shared/sync/testing/fixtures.ts`
- Test: `src/shared/sync/__tests__/SyncEngine.test.ts`

**Interfaces:**
- `SyncEngine.sync()` captures the store generation for the run.
- If generation changes while a push/pull is awaiting network I/O, the old run skips subsequent API/store work and cannot write rows or `last_synced_at`.
- A new generation does not reuse an old in-flight promise.

- [ ] Write a failing regression test that resets the fake store while a push is awaiting, then proves the old result cannot mark or reinsert rows and the next sync is independent.
- [ ] Run the focused sync test and confirm it fails with the old row being written/reused.
- [ ] Implement generation checks at sync boundaries and update the fake store.
- [ ] Run focused sync tests and confirm they pass.

### Task 3: Purge local data as part of auth sign-out

**Files:**
- Modify: `src/features/auth/AuthContext.tsx`
- Modify: `src/features/auth/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Auth token clearing also invokes `getLocalDb().clearPrivateData()` so explicit logout and invalid-session cleanup share the same privacy boundary.

- [ ] Write a failing auth regression test with a mocked local DB proving logout calls the purge and account-private rows are not available to the next login.
- [ ] Run the focused auth test and confirm it fails because logout only clears SecureStore.
- [ ] Implement the minimal AuthContext integration, preserving best-effort server logout behavior.
- [ ] Run focused auth, database, and sync tests; confirm all pass.

### Task 4: Full verification and commit

**Files:**
- Verify only; no additional source changes unless a test/type/lint failure requires a scoped correction.

- [ ] Run focused regression tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck` (or the repository-equivalent command if the script is absent).
- [ ] Review `git diff` and status for scope and accidental files.
- [ ] Commit with `fix: clear account data on logout`.
