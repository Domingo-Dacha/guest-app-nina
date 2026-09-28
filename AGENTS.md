<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Domingo Guest Lab

This repository is a universal mobile-web starter for a short product
competition. Do not hard-code a product scenario before a team chooses one.

## Stack and commands

- Use Node.js 24, Next.js 16 App Router, React 19 and strict TypeScript.
- Before changing a Next.js API or convention, read the relevant local guide in
  `node_modules/next/dist/docs/` as required above.
- Keep `npm run verify` green. For user-facing changes also run
  `npm run test:e2e` at 390 px/mobile WebKit and desktop Chromium.
- Use existing components and tokens from `src/components` and
  `src/app/globals.css` before creating one-off styles.

## Data boundary

- Screens read catalog data only through interfaces in `src/data/contracts` and
  implementations in `src/data/repositories`.
- Fixture content belongs in `src/data/fixtures`. Never add real guest personal
  data, addresses, door/access codes or provider responses.
- Any new persistent business entity requires a typed PostgreSQL table,
  migration, tenant/team scope, repository, constraints and tests. Do not use
  JSON files, browser storage or in-memory state as the source of truth.
- Preserve `team_slug` isolation in every read, write and reset operation.

## Competition limits

- Do not connect production databases, payments, Telegram, Bnovo, Bitrix or
  real outbound messaging.
- The PIN is a lightweight gate for the private demo, not guest authentication.
  Keep server-side session validation and rate limiting intact.
- Preview deployments are read-only unless an owner explicitly enables demo
  writes. Production team deployments use separate databases and secrets.
- Keep loading, error and empty states, keyboard access and 390 px layout
  working. Never hide authorization only in the UI.
- Never commit `.env*`, credentials, database dumps, personal data or live API
  output.

## Delivery

- Make focused changes through `codex/*` branches and pull requests. Do not
  bypass a red check.
- A ready PR authored by the repository's trusted team leader is merged
  automatically after the complete `Verify` workflow succeeds, then its exact
  merge SHA is dispatched to `Deploy production`. Do not ask the leader for a
  separate merge or deploy confirmation for an eligible ordinary change.
- Automatic merge is deliberately skipped for changes to workflows,
  `AGENTS.md`, environment files, migrations, authentication/proxy code and
  database/reset/secret scripts. Those changes require an explicit manual
  review and merge.
- Production deploys only the verified `main` revision through
  `.github/workflows/deploy-production.yml`. Never print, copy or commit the
  repository's `VERCEL_TEAM_TOKEN`; use the configured Actions secret and
  variables. The token is limited to the test-only Vercel team and must be
  revoked after the competition.
- A manual redeploy must target `main` and pass the workflow's local verification
  before publishing. Do not deploy a feature branch to the writable team app.
- In the handoff, report the exact SHA, changed files, commands actually run,
  database/integration impact and known limitations.
