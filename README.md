# AI CV Builder

A signed-in user uploads a CV as a PDF or pastes free text, names a target role, answers a few
clarifying questions and gets a CV to review, edit and download as an A4 PDF with selectable text.
The AI may rephrase what the user provided, and it is not allowed to add facts of its own.

## Run it

Requirements: Docker with Compose, and an Anthropic API key — the only secret.

```sh
ANTHROPIC_API_KEY=sk-ant-... docker compose up --build
```

Then open <http://localhost:3000>. The key can also be put into `.env` (see `.env.example`); set
`WEB_PORT` there when port 3000 is taken. A generation takes one to two minutes.

### Tests

Requirements: Node.js 24.11 or newer (`.nvmrc`), pnpm 12 (`corepack enable`), Docker.

```sh
pnpm install
pnpm test        # unit tests
pnpm test:e2e    # the API against a real PostgreSQL (Testcontainers; Docker must be running)
pnpm lint && pnpm typecheck
```

No test needs an API key: the end-to-end tests run the real application against a scripted stub of
the Anthropic API. The same commands run in GitHub Actions. To develop on the host, copy
`.env.example` and `apps/api/.env.example` to `.env`, then `pnpm db:up` and `pnpm dev`.

Tested are the parts where a mistake costs most: the checks that decide what may enter a CV, the
job runner (retries, a crash in the middle of a job, two workers), every failure of the model
service, authentication and ownership, version-checked saving and the PDF.

## Architecture

```
browser ──> nginx (web) ──/api──> NestJS API + generation worker ──> PostgreSQL
                                            └──> Anthropic API
```

- **Generation is a job in the database.** Creating a CV stores the source and a job row and
  returns at once; the page polls. A worker in the API process claims jobs with
  `FOR UPDATE SKIP LOCKED` and a lease. So the screen is never blocked, and a reload — or a restart
  of the API in the middle of a generation — loses nothing. Transient failures are retried; the
  others end with a reason shown to the user.
- **One origin.** nginx forwards `/api`, the session is a signed `httpOnly` cookie, and its signing
  key is generated on first start, so the API key stays the only secret.
- **Edits are saved with a version number**; a save from a stale copy is refused, not merged.
- **The PDF is rendered on the server** (PDFKit, embedded font): real text, the same on any device.
- **Untrusted input**: every request body is validated, an upload is checked by content, and every
  model answer is validated against a schema and its stop reason before use.

More, with the reasons and the alternatives: [docs/architecture.md](docs/architecture.md).

## How the AI is kept from inventing facts

**Code decides what enters the CV, not the model.** A prompt that says "do not invent" is a
request; the pipeline is built so that the request does not have to be trusted.

1. **Read.** The source is sent with the API's citations feature. A fact is only the text the API
   itself quotes from the document — never what the model writes about it.
2. **Ask.** From the facts and the role the model returns up to eight questions about what is
   missing or vague. An answer becomes a fact; a skipped question adds nothing.
3. **Write.** The writer sees only the numbered facts, never the source, and every item it
   produces must name the facts it rests on.
4. **Check.** Plain functions, no model: an item that names no existing fact is rejected; every
   number in it must occur in the facts it names; an email address, phone number or link must be
   copied from one in full. Rejected items go back to the model once; what fails again is left out
   and the user is told.

What this does not catch: a claim made stronger without a number ("contributed to" becoming
"led"), and a number reused with another meaning. Those rest on the prompt and on the user's
review. The full list is in
[docs/architecture.md](docs/architecture.md#what-the-checks-do-not-catch).

## What was simplified

Two places where the product reads the brief more narrowly than it could. Both are known and both
are deliberate:

- **Questions are asked once, before the draft.** The brief says an answer "updates the relevant
  part of the CV", which can also be read as: the user sees a draft, answers, and that section
  changes. Here each question belongs to a section, the answer becomes a fact, and the whole CV is
  then written with it. A skipped question is not asked again; the editor covers what was missed.
  This was chosen for one writing pass in which an answer goes through the same checks as any
  other fact, rather than a second path that patches a stored CV. Questions next to a visible
  draft, answered one by one, are the first thing I would add.
- **Positions cannot be reordered in the editor.** "The most relevant experience comes first" is
  an instruction to the writer; no code checks it, because relevance to a role is a judgement and
  not something a function can verify. If the model orders them badly, the user has to retype the
  entries. Reordering was left out to keep the editor small; it is the second thing I would add.

Also cut on purpose:

- **No automated tests for the web application.** It was verified by hand at 360 and 1440 pixels.
  Browser tests of the whole flow against the stub would be first on the list.
- **Scanned PDFs are not read**: the generation fails with a reason that suggests pasting the text.
- **A retry regenerates the whole CV**; there is no "rewrite this bullet point" in the editor.
- **The worker shares a process with the API.** The job table already allows a separate one.
- **A session cannot be revoked** before it expires (seven days).
- **One PDF layout and font family** (Latin, Cyrillic, Greek), and the CV is always in English.
- No monitoring, no cost accounting beyond the limits (5 CVs per account, one generation at a
  time).

## How AI tools were used

The project was built with Claude Code. I made the decisions; it wrote most of the code.

- **Specification first.** The proposal, the design and the behaviour scenarios were written with
  [OpenSpec](https://github.com/Fission-AI/OpenSpec) before any code (`openspec/`), and the code
  was written against them one task group at a time — one commit per group.
- **Two reviewing agents after every group** (`.claude/agents`): a code reviewer and a tester that
  runs the system, including hostile input. They found real defects — a deadlock between deleting
  a CV and the worker, contact values accepted as a part of a longer address.
- **The real API was the final judge.** It showed what the stub could not, such as a phone number
  broken across two lines of a PDF. Each finding became a test.
- **What I did not delegate:** the scope, every trade-off above, and the decision that grounding
  has to be enforced by code. I read what was generated and can explain any part of it.
