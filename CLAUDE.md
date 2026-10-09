# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node.js 24.11 or newer (`.nvmrc`) and pnpm 12 are required.

```sh
pnpm install
pnpm db:up          # development PostgreSQL (docker-compose.dev.yml); pnpm db:down stops it
pnpm dev            # API on :3001 and web on :3000; dev:api / dev:web start one
pnpm lint           # eslint; lint:fix to apply fixes
pnpm format:check   # prettier; format to write
pnpm typecheck
pnpm test           # unit tests (apps/api, *.spec.ts next to the code)
pnpm test:e2e       # apps/api/test/*.e2e-spec.ts against PostgreSQL from Testcontainers
pnpm build
docker compose up --build   # the whole system; requires ANTHROPIC_API_KEY
```

One test file or one test:

```sh
pnpm --filter @cv-builder/api test checks.spec.ts -t "number"
pnpm --filter @cv-builder/api test:e2e compose.e2e-spec.ts
```

The API reads `apps/api/.env` in development (copy `apps/api/.env.example`); the Compose files
read the root `.env`. The web development server forwards `/api` to `API_URL` (default
`http://localhost:3001`).

Migrations are raw SQL in `apps/api/src/database/migrations` and are applied when the API starts;
`synchronize` is off. Add a new file there rather than changing an applied one.

## Architecture

A pnpm workspace:

- `apps/api` — NestJS HTTP API and the generation worker, in one process.
- `apps/web` — React single-page app (Vite, React Router, TanStack Query, CSS Modules).
- `packages/contracts` — TypeScript types of the HTTP API. Types only; it is not built or shipped.

The browser always talks to one origin: nginx in Docker and the Vite proxy in development forward
`/api`. The session is a signed token in an `httpOnly` cookie; `SessionGuard` is global, and a
route opts out with `@Public()`.

### Generation

Creating a CV stores the source and a row in `generation_jobs` and returns. `jobs/job-runner.ts`
claims jobs (`FOR UPDATE SKIP LOCKED`, a lease, an attempt number that fences late writes) and
calls a handler per job kind. The web app polls `GET /api/cvs/:id`. A CV moves through
`generating` → `awaiting_answers` (only when there are questions) → `generating` → `ready`, or
ends in `failed` with a code from `cvs/failure.ts`.

Two job kinds, four stages (`apps/api/src/generation`):

1. `extract.stage.ts` — **read**: the source goes to the model with citations enabled; facts are
   only the quoted passages (`passages.ts`). **Ask**: up to eight questions from the facts and
   the role (`questions.ts`). Answers are stored as facts.
2. `compose.stage.ts` — **write**: a structured draft in which every item names its facts
   (`draft.ts`). **Check**: the pure functions in `checks.ts` reject what the facts do not
   support; one rewrite, then rejected items are left out and counted.

The invariant: nothing reaches a stored CV unless `checks.ts` accepted it. A change to the prompts
(`prompts.ts`) must not be what a guarantee rests on.

All model calls go through `llm/llm.client.ts`, which maps SDK errors and stop reasons to
`GenerationError` (retryable or not). Tests replace the Anthropic API with the scriptable stub in
`apps/api/test/anthropic-stub.ts`; no test needs a key.

### Editing and export

The CV document is one JSON column validated by `cvs/cv-document.schema.ts`. `PUT /api/cvs/:id`
carries the version the client loaded; a stale version is refused with `version_conflict`.
`pdf/cv-pdf.ts` renders the stored document with PDFKit and the fonts in `pdf/fonts`, which
`nest build` copies into `dist`.

### Errors

Every error leaves the API as `{ statusCode, code, message }` through `common/api-exception.filter.ts`; the
codes are the `ApiErrorCode` union in `packages/contracts`. Throw `ApiException` with a code
rather than a bare Nest exception.

## Conventions

- Specifications live in `openspec/`. Behaviour changes start there: the design and the scenarios
  first, then the code, one task group per commit.
- Commits follow Conventional Commits (commitlint runs in a git hook, with lint-staged).
- Tracked files are in English.
- The web app has no automated tests; verify a change to it in a browser at 360 and 1440 pixels.
- `.claude/agents` defines the `code-reviewer` and `qa-tester` agents used after each task group.
