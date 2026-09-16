# Criatório Virtual Web — Codex

## Scope
- Work only on the current backlog card or PR. Do not add unrelated cleanup, future screens, dependencies, integrations, or design-system abstractions.
- Prefer the current code, approved design, backend contract, and card acceptance criteria over assumptions.
- Stop only for a material unresolved product/UX decision, conflicting approved requirements, missing required access/credential, destructive action, or unavoidable out-of-scope dependency.

## Product and architecture
- Use the existing Next.js App Router structure and established project patterns.
- Build mobile-first and responsive; keep user-facing copy in clear pt-BR and preserve accessibility.
- For API-backed changes, inspect the affected backend route/DTO/status/error/auth contract before implementing the frontend. Do not infer API behavior from mocks or UI code.
- Keep Client Component boundaries as narrow as practical; do not introduce a new state/data pattern when an established project pattern works.
- Preserve tenant/session boundaries. UI hiding is not authorization.

## Context efficiency
- Start with the card/design and search for the affected route, component, API client, contract, and tests.
- Read only affected files and direct dependencies; inspect only the approved designs for changed surfaces.
- Do not scan the whole repository or read `README.md`/`CONTRIBUTING.md` by default.
- Do not reread unchanged files without a reason.
- Keep command output concise; expand only failures. Avoid printing full files, logs, screenshots, or repeated complete diffs.

## Validation
- During implementation, run targeted Vitest/lint/type checks when possible.
- Cover changed user behavior, validation, error handling, and authorization-sensitive UI where meaningful.
- Verify applicable loading, empty, validation, failure, disabled, and success states.
- Verify affected mobile and desktop behavior when the change is visual.
- Before handoff, run the affected CI-equivalent checks once; run a production build or broader suite only when impact or CI requires it.
- Never report a check as passed unless its result was observed.

## Git and tracking
- Branch from `develop`; keep one card/subtask per PR.
- Use English Conventional Commits.
- Open/update the existing PR; do not merge unless the user explicitly asks.
- A Trello card stays in review/test until GitHub confirms the PR was merged. Only then move it to `Concluído`.
- Do not automatically start the next backlog card.

## Handoff
Report only: PR, key changes, checks/results, visual verification when relevant, blockers if any, and the user's remaining action.
