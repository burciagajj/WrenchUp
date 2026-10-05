# AGENTS.md

Rules for future Codex work in this repo:

## Stack And Tooling

- Use `pnpm` as the package manager.
- Do not add or commit `package-lock.json`.
- Prefer `pnpm dev`, `pnpm check`, `pnpm lint`, and `pnpm test` for validation.
- The app is an Expo project, so browser-safe env vars use the `EXPO_PUBLIC_` prefix.

## Secrets

- Never commit real API keys, service keys, or tokens.
- Keep secrets in local `.env` files only.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must not be read in client components.

## Supabase

- Put schema changes in numbered files under `supabase/migrations/`.
- Do not rely on one-off SQL snippets in the repo root as the source of truth.
- Keep RLS enabled on public tables unless a feature explicitly requires a different model.
- Add or update storage buckets and policies in migrations when possible.
- When changing live dispatch or auth profiles, update both the migration and the app-side mapping code.

## Code Quality

- Prefer `apply_patch` for file edits.
- Keep changes focused and avoid unrelated refactors.
- Remove duplicate logic only when the replacement is clearly safer and easier to maintain.
- Add or update tests for shared reducers, schema mapping, and API wrappers when behavior changes.

## Validation

- Run the relevant checks after code changes.
- If a fix depends on manual Supabase settings or a console action, say exactly what must be done.
- Explain any residual risk instead of hiding it.
