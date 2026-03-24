---
name: namorix-workspace-guard
description: Enforces Namorix workspace workflow for namorix and namorix-thread: read full memory banks, respect no-terminal rules, and verify cross-repo env/port/CORS and core-backend data path consistency. Use when implementing or reviewing changes that touch either repo.
---

# Namorix Workspace Guard

Use this skill when working in `namorix-workspace` with the two sibling repos:
- `namorix`
- `namorix-thread`

## Non-negotiable rules

1. Read all memory bank core files before substantive work.
2. Respect no-terminal rules:
   - `namorix/.cursor/rules/no-terminal.mdc`
   - `namorix-thread/.cursor/rules/no-terminal.mdc`
3. Do not run shell commands unless user explicitly allows terminal usage in the current chat.

## Required memory-bank read set

Read all of these in each touched repo:
- `memory-bank/projectbrief.md`
- `memory-bank/productContext.md`
- `memory-bank/activeContext.md`
- `memory-bank/systemPatterns.md`
- `memory-bank/techContext.md`
- `memory-bank/progress.md`

If task touches both repos, read all 12 files.

## Cross-repo consistency checklist

When changes affect runtime integration, check all items below:

1. **Ports and origins**
   - `namorix/.env` defaults: backend `PORT`, shell `DESKTOP_VITE_PORT`, `DESKTOP_ORIGIN`.
   - `namorix-thread/.env` defaults: backend `PORT`, `THREAD_VITE_PORT`, `DESKTOP_ORIGIN`.
   - Ensure `DESKTOP_ORIGIN` in Thread matches Desktop shell origin.

2. **Vite proxy and dev ports**
   - Desktop frontend proxies `/api` and `/namorix-plugin-ws` to Desktop backend `PORT`.
   - Thread frontend proxies to Thread backend `PORT` (or explicit compatible fallback).

3. **Core backend shared path logic**
   - Shared helper location: `namorix/core/backend`.
   - Keep DB/migrations path resolution consistent via shared helper usage in both backends.
   - Preserve `NAMORIX_DATA_DIR` override behavior.

4. **Preview policy**
   - No re-introduction of `vite preview` workflows removed by plan.
   - Keep docs aligned with dev/build reality.

## Documentation update rule

When behavior/pattern changes, update memory-bank entries in touched repo(s), especially:
- `activeContext.md`
- `techContext.md`
- `progress.md`

Add concise release-note style bullets under the next version section.

## Commit suggestion pattern (if user asks)

For this workspace, suggest separate commits per repo:
- One commit for `namorix`
- One commit for `namorix-thread`

Prefer:
- `docs:` or `chore(docs):` for memory-bank-only changes
- `feat:` / `fix:` / `chore:` when code changes are included
