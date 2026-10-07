# Proposal

## Why

The repository is empty and the test task asks for a small AI CV builder with a real backend: a signed-in user provides a CV as a PDF or as free text, names a target role, and gets a CV to review, edit and download as a PDF. The brief's hardest demands are that the AI must not invent facts, that a slow generation must neither freeze the screen nor be lost on reload, and that failures and untrusted input (including the model's own output) are handled. The first implementation therefore has to establish a generation pipeline whose grounding is enforced by code, not by a prompt, and a job model whose state lives in the database.

## What Changes

- Add email and password accounts with a session in an httpOnly cookie. Every CV belongs to one user and is visible to that user only.
- Add CV creation from a PDF upload or pasted text plus a target role, with limits on size and length.
- Add background generation: the request returns at once, the work runs as a job stored in PostgreSQL, the client polls for the stage, and a reload, a second device or an API restart continues from the stored state. Failures are retried and, when they persist, shown to the user with a way to retry.
- Add fact grounding. The source document is sent to Claude with citations enabled; only passages the API itself quotes from the document become facts. The CV is then written from those facts alone, every generated item must reference the facts it rests on, and code rejects items with unknown references, numbers that are absent from their facts, or contact values that are not verbatim.
- Add clarifying questions: after the facts are extracted and before the CV is written, the user is asked about what is missing or vague. An answer becomes a fact; a skipped question is dropped.
- Add the CV document: contact details, summary, experience, education and skills, always written in English, with descriptions as concise bullet points, a summary aimed at the target role and the most relevant experience first.
- Add manual editing of every field with an explicit save that is protected against overwriting a newer version saved from another device, a list of the user's CVs, and deletion.
- Add download of the saved CV as an A4 PDF with selectable text, rendered on the server.
- Add a phone-usable web application covering sign-up, sign-in, the CV list, creation, progress, questions, editing and download.
- Add project tooling: pnpm workspace, ESLint and Prettier, git hooks with commitlint, CI, `docker compose up` as the single start command, and a README covering how to run, the architecture, how facts are kept honest, what was simplified and how AI tools were used.

Out of scope: multiple templates, tailoring to a job description, OAuth, password reset, email verification, payments, an admin panel (all excluded by the brief); OCR of scanned PDFs, questions after the CV is written, partial regeneration, automated tests of the web application, deployment.

## Capabilities

### New Capabilities

- `user-auth`: account creation, sign-in, sign-out, the session cookie and the rule that a user reaches only their own data.
- `cv-generation`: accepting a source and a target role, running generation as a recoverable background job, reporting progress, and handling retries and failures.
- `fact-grounding`: extracting cited facts from the source, asking clarifying questions, and the code-enforced rules that keep the written CV within those facts.
- `cv-documents`: the CV document itself — its sections, listing, reading, manual editing with version-checked saving, and deletion.
- `cv-pdf-export`: rendering a saved CV as an A4 PDF with selectable text.

### Modified Capabilities

None.

## Impact

- New applications: `apps/api` (NestJS) and `apps/web` (React single-page app built with Vite), plus `packages/contracts` with shared API types.
- New PostgreSQL schema: users, CVs, sources, facts, questions, generation jobs.
- New HTTP API under `/api`: auth, CV, answers and PDF endpoints.
- New external dependency: the Anthropic API (Claude Sonnet 5.5), reached with `ANTHROPIC_API_KEY`.
- New infrastructure files: docker-compose, Dockerfiles, an nginx configuration for the web app, a GitHub Actions workflow, git hooks.
