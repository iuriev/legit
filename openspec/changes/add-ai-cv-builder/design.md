# Design

## Context

The repository is empty. The brief fixes Node.js with a REST API, the Anthropic API for every LLM call, PostgreSQL or SQLite, and a local start with `docker compose up` where `ANTHROPIC_API_KEY` is the only secret. Everything else is ours to decide and is part of what is evaluated. See `proposal.md` for motivation and `specs/` for the behavior contract.

Decisions already made with the product owner and treated as constraints here:

- NestJS with TypeORM and PostgreSQL for the API; a React single-page application built with Vite for the web; CSS Modules with our own components.
- Generation runs as a job stored in PostgreSQL and the client polls for its state. No Redis, no streaming.
- The uploaded PDF is sent to Claude whole; the server does not extract its text.
- Facts are passages quoted by the Citations feature of the API; code checks what is written from them.
- Questions are asked once, after extraction and before the CV is written. A skipped question is dropped.
- The CV is always written in English and has exactly the five sections named in the brief.
- Numbers in generated items are checked by code against the facts. There is no second model acting as a judge.
- Claude Sonnet 5.5 (`claude-sonnet-5-5`) is used for every call.
- Edits are saved with an explicit button and a version check.
- The PDF is produced by a PDF library in Node, not by a headless browser.
- The web application has no automated tests; the API is tested thoroughly.

## Goals / Non-Goals

**Goals:**

- A statement reaches the CV only if code can trace it to a quoted passage of the source or to an answer of the user.
- A generation survives a reload, a change of device, a failed call and a restart of the API, with no state held in the browser or in process memory.
- Every model response is validated before use, and every failure ends in a state the user can see and act on.
- One command starts the whole system; one command runs all checks; the tests need no API key.

**Non-Goals:**

- Detecting a distortion of meaning that involves no number and no contact value (see Risks).
- Reading scanned PDFs.
- Horizontal scaling of the worker beyond what `SKIP LOCKED` already allows.
- Refresh tokens, session revocation, email flows, OAuth.
- Real-time collaboration or merging of concurrent edits.

## Decisions

### Repository layout: pnpm workspace with two apps and a contracts package

```
apps/api            NestJS application (HTTP API and the generation worker)
apps/web            React single-page application (Vite)
packages/contracts  TypeScript types of the HTTP API (no runtime code)
```

`packages/contracts` holds only types — request and response shapes, the CV document, the state and failure codes — so both sides fail to compile when the contract drifts. Alternative considered: generating a client from OpenAPI — more machinery than a dozen endpoints justify.

The worker runs inside the API process. A separate worker container would isolate a crash of one from the other, but the jobs are I/O-bound calls to an external API, and one process keeps `docker compose up` to three containers (database, API, web). The job table already allows a second process later without a change of design.

### One origin, served by nginx

In Docker the web container is nginx: it serves the built files and forwards `/api/*` to the API. In development Vite's proxy does the same. The browser therefore talks to one origin, the session cookie needs no cross-origin configuration and there is no CORS surface. Alternative considered: the API serving the static files — one container fewer, but it couples the two builds.

### Data model

```
users            id uuid PK, email citext UNIQUE, password_hash text, created_at
app_secrets      name text PK, value text                      (session signing key)
cvs              id uuid PK, user_id FK ON DELETE CASCADE, target_role text,
                 state enum(generating, awaiting_answers, ready, failed),
                 stage enum(reading, questions, writing, checking) NULL,
                 failure_code text NULL, document jsonb NULL,
                 omitted_count int NOT NULL DEFAULT 0,
                 version int NOT NULL DEFAULT 0, created_at, updated_at
                 index on (user_id, created_at DESC)
cv_sources       cv_id PK FK ON DELETE CASCADE, kind enum(pdf, text),
                 pdf bytea NULL, text text NULL
facts            id uuid PK, cv_id FK ON DELETE CASCADE, ref int,
                 origin enum(source, answer), quote text, page int NULL,
                 question_id FK NULL, UNIQUE (cv_id, ref)
questions        id uuid PK, cv_id FK ON DELETE CASCADE, position int,
                 section enum(contact, summary, experience, education, skills),
                 text text, status enum(open, answered, skipped), answer text NULL
generation_jobs  id uuid PK, cv_id FK ON DELETE CASCADE,
                 kind enum(extract, compose), status enum(queued, running, done, failed),
                 attempts int, run_after timestamptz, locked_until timestamptz NULL,
                 last_error text NULL, created_at, finished_at NULL
```

- `cvs.state` is what the user sees; `generation_jobs` is what the worker sees. Both change in the same transaction, so they cannot disagree.
- `cvs.document` is one JSON document (the five sections). It is read and written as a whole by the editor and by the PDF renderer, and nothing queries inside it, so a document fits better than five normalized tables. Its shape is validated by the same schema on every write, whether the writer is the model or the user.
- `facts.ref` is a small per-CV number (`1`, `2`, …). The model names facts by this number: short references are cheaper and less error-prone for a model than UUIDs.
- `cv_sources` is a separate table because the file is large, is needed only by the extraction job, and is deleted when extraction succeeds.
- The schema is created by migrations that the API applies on start, so an empty database is ready with no extra command.

### Generation as a database-backed job

`POST /api/cvs` stores the CV, its source and an `extract` job in one transaction and answers `201` with the identifier. A partial unique index on `cvs (user_id) WHERE state = 'generating'` enforces one running generation per user, and an account keeps at most five CVs, which bounds what it can store. A poller in the API claims work with one statement:

```sql
UPDATE generation_jobs SET status = 'running', attempts = attempts + 1,
       locked_until = now() + interval '10 minutes'
WHERE id = (SELECT id FROM generation_jobs
            WHERE (status = 'queued' AND run_after <= now())
               OR (status = 'running' AND locked_until < now())
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING *;
```

- The lease (`locked_until`) is the recovery mechanism: a job whose process died stays `running` with an expired lease and is claimed again. Nothing has to notice the crash. The lease is longer than the worst case of one attempt (two model calls with the SDK's own retries and timeouts).
- A stage writes its results and its next state in one transaction at the end, so an attempt that is interrupted leaves nothing half-written and is safe to run again.
- Every write a worker makes for a job checks the attempt number it claimed with, so a worker that was only slow, and has been replaced, cannot overwrite its replacement's work. Transactions that touch a CV and its job lock the CV row first, the order a delete takes through the foreign key, so a delete during a commit waits instead of deadlocking.
- A stopping worker waits a few seconds for running jobs and hands the rest back to the queue without counting the attempt, so a restart resumes them at once rather than after the lease. This happens before the database connection is closed, and `docker-compose.yml` gives the container a stop grace period longer than the worker's, because a container killed earlier leaves the job to its lease.
- Transient failures re-queue the job with a delay (5 s, then 30 s) until three attempts have been made; then the job and the CV become `failed`. Failures that a retry cannot fix fail at once. The classification is one function over the SDK's typed errors and our own error types:

| Cause | Class | Failure code shown to the user |
|---|---|---|
| 429, 5xx, connection error, timeout | transient | `service_unavailable` after the last attempt |
| Response fails schema validation, or is cut off (`max_tokens`) | transient | `generation_failed` after the last attempt |
| 401 or 403 from the API | permanent | `ai_not_configured` |
| `stop_reason: "refusal"` | permanent | `declined` |
| No quoted passage in the extraction | permanent | `no_readable_text` |
| Source exceeds the input token budget, or the reading is cut off | permanent | `source_too_long` |
| Other 4xx (for example a PDF the service cannot open) | permanent | `request_rejected` |

  A failure that a retry cannot fix also deletes the stored source, which nothing will read again.

- The client polls `GET /api/cvs/:id` every 1.5 s while the state is `generating`. Because the page reads everything from that endpoint, a reload or another device shows the same thing.

Alternatives considered: running generation inside the HTTP request — the screen freezes and a reload loses the work, which the brief forbids. BullMQ with Redis — a ready-made queue, but another service for one kind of job. Server-sent events for progress — nicer to watch, but it needs polling as a fallback anyway and the stages are coarse. `pg-boss` — the same idea as ours as a dependency; thirty lines we own and can test are easier to explain than its configuration.

### Grounding pipeline

```
source ──► [1 read]  Claude + citations  ──► facts (quoted passages only)
facts + role ──► [2 ask]   Claude, structured ──► questions ──► user answers ──► more facts
facts + role ──► [3 write] Claude, structured ──► draft items, each naming facts
draft ──► [4 check] code ──► accepted items ──► CV   (rejected: one rewrite, then omitted)
```

Stages 1 and 2 are the `extract` job; stages 3 and 4 are the `compose` job.

**Stage 1 — read.** The source goes to the model as a `document` content block with `citations: { enabled: true }`. A PDF is sent as base64; pasted text is sent as a custom-content document whose blocks are the non-empty lines of the text, so that a quotation is one line rather than whatever a sentence splitter makes of a CV. The prompt asks the model to state everything the document says about the candidate. From the response we keep only the `cited_text` of each citation, split into its lines, each line a fact with its page or block index, deduplicated. The model's own sentences are discarded. The split matters for PDFs: a run against the real API showed that it may cite a whole page as one piece of text, and a fact that large would let any number on the page support any claim. A line is still the document's own text, word for word. This is the core of the design: `cited_text` is filled in by the API from the document, so the model cannot write it, and a fact is by construction a passage that exists in the source.

Citations cannot be combined with structured output (the API answers 400), which is why reading is a separate call that returns plain text, and everything structured happens in later calls that never see the document.

Before the call, `messages.countTokens` measures the request; a source above the input budget fails with `source_too_long` rather than producing a large bill.

**Stage 2 — ask.** The model receives the numbered facts and the target role and returns, through structured output, at most eight questions, each with a section and text. If the list is empty the `compose` job is queued at once; otherwise the CV waits for answers. `POST /api/cvs/:id/answers` takes an entry for every open question — an answer or a skip — in one request, stores answers as facts with `origin = answer`, and queues `compose`. The state change is one conditional `UPDATE ... WHERE state = 'awaiting_answers'`, which makes a repeated submission a conflict.

**Stage 3 — write.** The model receives only the numbered facts (for an answer, together with its question) and the target role. It returns the CV through structured output in a draft schema in which every item carries `facts: number[]`. The prompt carries the editorial rules of the brief: English, concise bullets, a summary aimed at the role, most relevant experience first, and empty fields where no fact applies.

**Stage 4 — check.** Pure functions, with no model involved:

1. *References.* An item whose `facts` is empty, names a `ref` that does not exist for this CV, or names more facts than an item can plausibly rest on (eight; twenty for the summary) is rejected. The last rule keeps "the facts it names" from meaning "any fact".
2. *Numbers.* Every quantity in an item's text must occur in the text of the facts it names. A quantity is a run of digits, with digits grouped in threes by commas or spaces read as one number and leading zeros ignored; an English number word, read as its value ("eight" is 8, "twenty-five" is 25; "one" alone is not counted, being too often not a count); or a word of quantity such as "million", "decade" or "doubled", compared as that word. A digit inside a word ("S3") counts. A number whose digits are joined by a separator — 3.5, 40.6, a decimal that begins with its point — must in addition occur in a named fact as written, so it cannot be assembled from a 40 in one place and a 6 in another. An item that writes a number in any character other than 0–9 (full-width, superscript, a fraction sign, a digit of another script, a digit with a combining mark) is rejected and not interpreted: converting it would change what the CV says, turning "10⁶" into "106". Facts are read more generously, since they are the user's own material: their full-width digits count as digits, and a superscript or fraction is read as separate numbers. For an answer, the fact is the answer alone, not the question it replies to, which the model wrote.
3. *Addresses and phone numbers.* A contact email address or link must have the shape of one and be equal to a whole word of a named fact — a word being what stands between spaces, without the brackets and punctuation around it. Comparing whole words rather than searching inside them is what keeps a part of an address from passing: `ann@example.com` is not `joann@example.com`. The scheme of a link, a final slash and the case of its host do not matter; a link may have no scheme other than http or https. A phone number must have at least seven digits and equal, digit for digit and with or without its plus sign as the fact has it, a run of digit groups in a named fact that are separated by at most one space, dot or hyphen. In any other item, a word containing "@" or recognisable as a link (a scheme, a leading "www.", or a host followed by a path) must likewise be a word of a named fact. Names, companies and places are not checked this way, because writing a non-English source in English legitimately transliterates them.

What is stored is exactly the text that was checked: the draft's text as one plain line with invisible characters removed, and nothing else altered.

When items are rejected the writer gets one more call. It receives its previous draft and the rejected items, each with its place and reason, and returns the complete CV again. That second draft is checked as a whole in the same way: nothing is admitted because it passed the first time. What is rejected in the second draft is left out, and `omitted_count` records how many items that was, so the user is told rather than left to wonder. Asking for the whole CV again, rather than for patches to single items, keeps one schema and one code path, at the cost of some tokens.

When nothing at all passes, the stage fails as a transient failure instead of storing an empty CV: after the attempts are used up the user sees a failure with a retry, not a blank document called ready.

Leaving an item out means: a field becomes empty, a bullet point, skill or link disappears. The fields of a position share the facts the position names, and each field is checked on its own, so one wrong date empties that date and nothing else. A position left without both employer and title is dropped together with its bullet points; the same holds for an education entry without institution and degree. The stored `document` is the draft without the `facts` arrays, validated by the same schema as a document saved by the user.

Alternatives considered: one call that returns the CV and the questions from the raw document — nothing in it can be checked. Asking the model to write quotations and comparing them with text we extract ourselves — equivalent in strength for text input, but it needs our own PDF text extraction, which the owner ruled out. A second model that judges each item — it catches distortions without numbers, but doubles the time and cost and is itself a model that can be wrong; recorded in the README as the next step.

### Calling the Anthropic API

- The official SDK `@anthropic-ai/sdk`, one thin module that owns every call. Model `claude-sonnet-5-5`, configurable through `ANTHROPIC_MODEL`.
- Structured calls use `output_config.format` with a JSON schema built by the SDK's zod helper, and are validated on our side with the same zod schema. Ours is the validation that counts: the helper passes length limits and enumerations to the API as descriptions only.
- Each response's `stop_reason` is checked before its content is read: `refusal` and `max_tokens` are failures, never content.
- `effort` is set explicitly per call (low for reading and asking, medium for writing) to keep generation time down, and thinking is set to adaptive.
- The SDK's timeout is set explicitly and its own retries are switched off. A failed call fails the stage, and the job runner decides whether the stage runs again. One layer of retries keeps the worst case of an attempt easy to state (a token count and two messages, each within the timeout), and the configuration is refused at startup unless that fits into the job lease.
- The API's server-side refusal fallback is not enabled. A CV is an unlikely subject for a refusal, a fallback would mean a second model whose output we have not looked at, and a refusal already ends in a state the user understands (`declined`).
- Without an API key the API still starts, and every generation fails with `ai_not_configured` before anything is sent. That is easier to diagnose than a container that will not start; `docker-compose.yml` is where the key is required.
- The document and the answers are data, and the system prompts say so. Text from outside reaches a later call only as JSON string values, one plain line each, so it cannot close the structure around it or pass for another fact. What this does not remove: a sentence in the source that addresses the model is itself a passage the reader may quote, and it then reaches the writer as a fact like any other. Whether the writer acts on it rests on the writer's prompt, since stage 4 checks references, numbers and contact values, not meaning. That residual risk is stated in the README and probed with a real model in the integration check.
- Questions written by the model are shown to the user, so they are bounded as well: at most eight, one of the five sections, at most 300 characters, one plain line, no links. One that does not fit is dropped rather than failing the stage.

### Authentication

- Passwords are hashed with bcrypt, which reads only the first 72 bytes of its input, so a longer password is rejected at registration instead of being silently truncated. The session is a signed JWT in an `httpOnly`, `SameSite=Lax` cookie, `Secure` when served over HTTPS.
- The signing key is generated on first start and stored in `app_secrets`. The brief allows one secret, the API key; a key in the database is unique per installation and survives restarts, where a default in `docker-compose.yml` would be the same for everyone who clones the repository.
- A global guard protects every route unless it is marked public. Handlers take the user from the session only. Every query on a CV carries `user_id = :sessionUser`; a miss is `404`, so the API does not confirm that another user's CV exists.
- `SameSite=Lax` keeps the cookie off cross-site `POST`, `PUT` and `DELETE` requests, including the multipart upload, which a JSON-only rule could not protect.
- Registration and sign-in are rate-limited per client address and email, with a ceiling per client address across all emails. Behind the web server the client address comes from `X-Forwarded-For`, which the API believes only from the network named in `TRUST_PROXY`.
- Registration says when an email is already registered. That reveals which emails have accounts; hiding it needs email verification, which the brief excludes.

### Uploads

The upload is held in memory by the multipart parser with a hard limit of 5 MB and one file. The server checks the `%PDF-` signature rather than the declared type, stores the bytes in `cv_sources` and never parses the file itself: the only reader of the PDF is the model service. That keeps a PDF parser, a frequent source of vulnerabilities, out of the request path.

### Saving edits

`PUT /api/cvs/:id` carries `{ version, document }`. The document is validated with the CV schema (structure, per-field length limits, limits on the number of entries) and stored with one statement, `UPDATE cvs SET document = …, version = version + 1 WHERE id = … AND user_id = … AND state = 'ready' AND version = :version`. No row updated means `409 version_conflict` (or `404`/`409` by state), and the client offers to load the current version. The limits of the document are in characters, so the JSON body limit is raised from the parser's 100 kB to 1.5 MB, which holds a document at its limits in any script; a hostile document is told its first twenty problems, not all of them. Manual edits are not checked against facts: the user is the authority on their own CV.

Alternative considered: autosave — friendlier, but it multiplies conflict cases and was declined by the owner.

### PDF rendering

`GET /api/cvs/:id/pdf` renders the stored document with PDFKit: A4, one column, embedded Noto Sans (regular and bold, committed with its licence) so that diacritics and Cyrillic typed by the user render and stay extractable. PDFKit lays text out as text, so it is selectable, and paginates automatically. Every value is drawn as a plain string; nothing in a CV is interpreted as markup. A tab is drawn as a space and other control characters are left out, since the font has no glyph for them. A bullet's marker and its first line always share a page, and a position's title is not left at the foot of a page without what follows it. Characters outside the font — Chinese, Arabic, emoji — are drawn as empty boxes; the README says so. The response has `Content-Disposition: attachment`, which is what makes the download work as a link on a phone.

The editor is a form and has no separate HTML imitation of the page: the preview is the PDF itself, so the two cannot diverge. Alternative considered: headless Chromium with one HTML template for preview and PDF — exact fidelity, at the cost of several hundred megabytes in the image and a browser process to keep alive.

### Web application

Routes: `/sign-in`, `/sign-up`, `/` (the user's CVs), `/new`, `/cvs/:id`. The last one renders by state — progress, questions, editor or failure — from the one polled resource, which is what makes a reload harmless. TanStack Query does the polling and caching. The forms are plain controlled React forms that lean on the browser's own validation (required, type, length) and on the API's messages; a form library and a second copy of the schema would add more code than these few forms need. The editor keeps the document in state, compares it with the last saved one to know whether there are unsaved changes, and tidies it (trimmed text, no empty list items) before saving. Unsaved changes are guarded twice: the browser asks before a reload or a closed tab, and a native dialog asks before moving to another page of the application. Answers typed but not yet submitted are kept in `sessionStorage` per CV, so a reload on the questions screen does not lose them either. Layout is mobile-first with CSS Modules and a small set of tokens.

### Testing

- **Unit tests** for the pure parts: turning a citations response into facts, each check of stage 4, the classification of errors, the validation of model output and of saved documents, the PDF renderer (A4 page size and extracted text, read back with `pdfjs-dist`).
- **End-to-end tests** start the real application against PostgreSQL in Testcontainers and a stub of the Anthropic API — a small HTTP server that the SDK is pointed at through its base URL and that tests script per call (a citations response, a malformed response, a 529, a delay). The application code has no test branch. They cover authentication, isolation between two users on every CV endpoint, the whole generation including questions, progress while a call is delayed, recovery of a job with an expired lease, retries and exhaustion, each permanent failure, the version conflict and the PDF endpoint.
- **The web application** has no automated tests. It is verified by the `qa-tester` subagent in a real browser at 360 and 1440 pixels against the spec scenarios, and the README records this as a cut.

## Risks / Trade-offs

- [A distortion without a number passes the checks: "contributed to" becomes "led"] → The writer sees only quoted passages, the prompt forbids strengthening claims, and the user reviews every field before download. A judging model is the recorded next step.
- [A PDF's lines are visual lines, so a sentence that wraps becomes two facts, and a phone number broken at a hyphen sits in two] → The writer is told that a sentence may run over consecutive facts and names both. A contact phone is matched against the named facts read together, allowing for the break. An email address or link that wraps is not recovered and is left out.
- [A number passes because it occurs in the named facts with another meaning: "team of 12 over 3 years" from "team of 3 over 12 years", "$40M" from "$40K"] → The check asks whether the quantity occurs, not what it measures. Checking that needs an understanding of the sentence, which is the judging model recorded as the next step. The user reviews every item.
- [A quantity written in a way the check does not read gets through: Roman numerals, number words in a language other than English] → Accepted. The CV is in English and the writer is told to use the facts' digits.
- [The number check rejects a legitimate item: the source abbreviates years ("03/19") and the CV spells them out, the source uses European grouping ("1.200") or a suffix ("1.2k"), the source's digits are not folded to 0–9 (Arabic-Indic)] → The writer is told to keep such values as the fact writes them. An item that still fails gets one rewrite and is then left out and counted; the user can add it by hand. We prefer a missing true statement to a present false one.
- [A number is supported by part of another number in the fact: "5 years" by "2.5 years", "40%" by "40.5%"] → A fact's digits are read group by group so that "03.2019" supports "March 2019"; the price is this. It is the same class as a number that occurs with another meaning.
- [An address is written so that it is not recognised: a bare domain without a path in running text, "ann [at] example.com"] → Not caught outside the contact section; inside it, the value must have the shape of an address. Text is always rendered as text, never as a link.
- [A phone number in the source is followed directly by another number ("+1 555 123 4567 12 Main Street"), or is written differently from how the writer copies it ("+44 (0)20…")] → The contact phone is rejected, because a shorter number cannot be told from a truncated one. The user adds it by hand; nothing wrong is stored.
- [Quantities the check does not read: ordinals ("eighth year"), "one", number words in another language. The reverse also happens: a number word translated from the source ("вісім" to "eight") is rejected] → Accepted on both sides; stated here so that nobody assumes otherwise.
- [`omitted_count` undercounts: an item the writer quietly drops in its rewrite is not counted, and a dropped position counts once however many bullet points went with it] → The count means "items the check refused in the final draft". The notice to the user says that some items were left out, not exactly which.
- [Scanned PDFs fail] → The failure names the cause and suggests pasting the text; OCR is recorded as a cut.
- [Asking questions before the CV exists means the user answers without seeing a draft, and a skipped question is gone] → Chosen for a simpler flow with one writing pass; the editor covers anything missed. Questions after the draft are recorded as a cut.
- [The worker shares a process with the API; a crash takes both down] → Restart policy in Compose, and the lease makes the interrupted job resume.
- [Polling every 1.5 s per open CV] → Negligible at this scale; the endpoint is one indexed read.
- [A transient-failure retry repeats a paid model call] → At most three attempts per stage, and the token budget caps each call.
- [The session cannot be revoked before it expires] → Accepted for a test task; recorded in the README.
