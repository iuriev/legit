# Tasks

## 1. Workspace and tooling

- [x] 1.1 Create the pnpm workspace (`apps/api`, `apps/web`, `packages/contracts`), root `package.json` with `packageManager` and `engines`, `.nvmrc`, shared `tsconfig.base.json`; verify `pnpm install` succeeds
- [x] 1.2 Add the root ESLint flat config (typescript-eslint type-checked, simple-import-sort, prettier compatibility) and Prettier config with `lint`, `format` and `typecheck` scripts; verify `pnpm lint` and `pnpm format:check` pass on the empty workspace
- [x] 1.3 Add husky, lint-staged and commitlint (conventional config); verify a commit with a non-conventional message is rejected and a staged file is formatted on commit
- [x] 1.4 Add `docker-compose.dev.yml` with PostgreSQL and `.env.example` files; verify the database accepts connections with the documented credentials

## 2. API foundation

- [x] 2.1 Scaffold the NestJS app with validated environment config, global `ValidationPipe`, `/api` prefix, helmet, cookie parsing and one JSON error shape with a stable `code`; verify the app boots and an unknown route returns a JSON 404
- [x] 2.2 Configure TypeORM with `synchronize: false`, a data source for the migration CLI and migrations applied on start; verify `pnpm --filter api migration:run` works against the dev database
- [x] 2.3 Add the e2e test harness (Testcontainers PostgreSQL, migrations, supertest against the real app, database reset between tests) with one smoke test; verify `pnpm --filter api test:e2e` passes

## 3. Authentication

- [x] 3.1 Add the `users` and `app_secrets` migrations with a case-insensitive unique email, and generate the session signing key on first start; verify with tests that the same email in a different case is rejected and that a second start reuses the stored key
- [x] 3.2 Implement the JWT cookie session, the global guard, `@Public()` and `@CurrentUser()`; verify with e2e tests that a protected route rejects a missing or tampered cookie
- [x] 3.3 Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me` with the credential rules; verify with e2e tests for every scenario of the user-auth spec except access to CVs
- [x] 3.4 Add rate limiting to the register and login routes; verify with an e2e test that requests above the limit are rejected

## 4. CVs and the job runner

- [x] 4.1 Define the CV document, state, stage, failure-code and endpoint types in `packages/contracts`, with zod schemas for the document in the API; verify both apps typecheck against them and unit tests cover the length and count limits
- [x] 4.2 Add the `cvs`, `cv_sources`, `facts`, `questions` and `generation_jobs` migrations with the constraints and indexes from the design; verify the migrations apply and revert
- [x] 4.3 Implement `POST /api/cvs` (multipart PDF or text, target role, limits, PDF signature check, one running generation per user), storing the CV, source and `extract` job in one transaction; verify with e2e tests for each scenario of "Starting a CV", "Input limits" and "One generation at a time"
- [x] 4.4 Implement `GET /api/cvs`, `GET /api/cvs/:id` and `DELETE /api/cvs/:id` scoped to the session's user; verify with e2e tests for listing order, deletion, and that a second user gets 404 on every one of them
- [x] 4.5 Implement the job runner: the claiming statement with `SKIP LOCKED` and a lease, the poller, stage handlers registered by kind, transient re-queueing with delays, exhaustion after three attempts and the error classification; verify with e2e tests using a fake handler that a job runs once, that an expired lease is claimed again, that a transient error is retried and that a permanent error fails at once
- [x] 4.6 Implement `POST /api/cvs/:id/retry` for failures that can be retried; verify with e2e tests for both scenarios of "Manual retry"

## 5. Reading the source and asking questions

- [x] 5.1 Load the `claude-api` skill, add the Anthropic client module (model, timeout, retries, effort from config, `stop_reason` handling) and the scriptable stub server for tests; verify a test call through the stub returns the scripted response and that a refusal and a cut-off response raise the typed errors
- [x] 5.2 Implement stage 1: build the document block (base64 PDF, or line blocks for pasted text) with citations enabled, check the token budget, and turn the response into deduplicated facts; verify with unit tests that only cited passages become facts and with an e2e test that a response without citations fails the CV with `no_readable_text`
- [x] 5.3 Implement stage 2: the structured questions call, validation, the limit of eight, the transition to `awaiting_answers` or straight to `compose`, and deletion of the source; verify with e2e tests for both scenarios of "Clarifying questions" and for "Removing the source after use"
- [x] 5.4 Implement `POST /api/cvs/:id/answers` (an entry for every open question, answers stored as facts, conditional state change, `compose` job queued); verify with e2e tests for the three scenarios of "Answers become facts" and for a second user getting 404

## 6. Writing and checking the CV

- [ ] 6.1 Implement the checks of stage 4 as pure functions (references, numbers, contact values) over the draft schema; verify with unit tests for every scenario of "Writing from facts only", "Numbers must come from the facts" and "Contact values are verbatim", including grouping separators and digits inside words
- [ ] 6.2 Implement stage 3 and the `compose` handler: the structured writing call, validation, the checks, one rewrite of rejected items, omission with `omitted_count`, and storing the document with `state = ready`; verify with e2e tests for both scenarios of "Handling rejected items", for "No fact, no content" and for malformed and cut-off responses being retried
- [ ] 6.3 Write the system prompts for the three calls (document and answers as data, no strengthening of claims, English, concise bullets, role-aimed summary, relevance ordering, empty when unsupported); verify with an e2e test that the writing request contains the facts and the role and does not contain the source document
- [ ] 6.4 Cover the whole generation with one e2e test through the stub: upload, progress visible during a delayed call, questions, answers, ready CV; verify it also passes when the job's lease is expired in the middle to simulate a restart

## 7. Editing and PDF export

- [ ] 7.1 Implement `PUT /api/cvs/:id` with document validation and the version-checked update; verify with e2e tests for every scenario of "Manual editing", "Validation of saved documents" and "Version-checked saving"
- [ ] 7.2 Implement the PDF renderer with PDFKit and embedded Noto Sans, and `GET /api/cvs/:id/pdf` as an attachment; verify with unit tests that read the PDF back (A4 pages, extracted text, omitted empty sections, several pages for long content, diacritics and Cyrillic) and with e2e tests for the download scenarios and a second user getting 404

## 8. Web application

- [ ] 8.0 Load the `modern-web-guidance` skill and note in the group's commit body which of its recommendations shaped the markup, CSS and client code; verify the skill was consulted before the first component is written
- [ ] 8.1 Scaffold the Vite React app with the `/api` proxy, the router, TanStack Query, a typed API client and services, design tokens and the shared components (button, text field, text area, page shell, notice); verify the app builds and a request through the proxy reaches the API
- [ ] 8.2 Implement the sign-up and sign-in pages, sign-out and the redirect of unauthenticated visitors; verify manually registration, an existing email, a wrong password and a reload that keeps the session
- [ ] 8.3 Implement the CV list and the creation page (PDF or text, target role, client-side limits, server errors shown next to the field); verify manually both source kinds, each rejection and the "generation already running" message
- [ ] 8.4 Implement the CV page for the generating, waiting and failed states: polled progress with stage names, the questions form with answer or skip per question and drafts kept across a reload, the failure reason and the retry button; verify manually that a reload at every point shows the same state and loses nothing
- [ ] 8.5 Implement the editor for the ready state: every field, adding and removing entries and bullets, the unsaved-changes indicator and leave warning, saving with the version, the conflict message with "load the current version", the notice about omitted items, download with save-first, and deletion; verify manually every scenario of "Manual editing", "Version-checked saving" with two browser windows, "Unsaved changes" and "Download with unsaved changes"
- [ ] 8.6 Check every screen at 360 and 1440 pixels and with keyboard only; verify there is no horizontal scrolling at 360 and every action can be completed by touch-sized targets

## 9. Delivery

- [ ] 9.1 Add Dockerfiles for both apps, the nginx configuration and `docker-compose.yml` that starts PostgreSQL, the API and the web app and requires `ANTHROPIC_API_KEY`; verify that `docker compose up --build` on empty volumes serves the sign-in page with no extra command and that a missing key stops the start with a clear message
- [ ] 9.2 Add the GitHub Actions workflow for lint, typecheck, unit tests, e2e tests and build; verify the workflow passes on the pushed branch
- [ ] 9.3 Write the README (how to run the project and the tests, the architecture and its main decisions, how the AI is kept from inventing facts, what was simplified and what would be done with more time, how AI tools were used); verify every documented command runs as written
- [ ] 9.4 Write `CLAUDE.md` with the commands and the architecture overview for future sessions; verify the documented commands match the root scripts

## 10. Integration check

- [ ] 10.1 Run the full flow against docker-compose with a real API key, once with a PDF and once with pasted text in a language other than English: sign up, create, answer and skip questions, edit, save, download, sign out, sign in on a second browser; verify each step matches the specs and that the downloaded PDF has selectable text
- [ ] 10.2 Probe grounding with a real key: a source with an instruction to invent a degree, a source with no dates, a scanned PDF; verify nothing unsupported reaches the CV and the scanned PDF fails with the documented reason
- [ ] 10.3 Run the `code-reviewer` subagent over the whole codebase and the `qa-tester` subagent over every spec scenario; verify there are no blocking findings and no failing scenarios
- [ ] 10.4 Run `openspec validate add-ai-cv-builder --strict` together with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build`; verify all pass

## Workflow follow-up

- Archive the change after the integration check passes.
