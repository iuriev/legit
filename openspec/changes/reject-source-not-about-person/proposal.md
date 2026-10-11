## Why

A document that is not about the user's background is still turned into a "ready" CV. A university
report uploaded for the role "Senior Frontend Engineer", with all seven questions skipped, produced
a CV with the report author's surname, the university and four skills taken from the assignment's
learning goals — no summary, no experience, no error. Every item is quoted from the document, so
the grounding checks are right to accept each one; what nobody asks is whether the document
describes a person's background at all. To the owner it looks as if the product accepted nonsense.
The same file gives a different outcome from run to run, because today the outcome depends on what
the writer happens to pick up.

## What Changes

- While reading, the system also decides whether the source describes a person's professional
  background (work, education, skills) or is something else, and stores that with the CV.
- When the source is something else and the user gives no answer to any question — or there was
  nothing to ask — the generation fails with the existing `not_enough_information` failure, before
  any CV is written. With at least one answer the CV is written as before.
- A generated CV is stored as ready only when it has a full name or at least one position; a draft
  with neither fails the same way. This replaces the "nothing at all passed" rule, which is its
  special case, and does not depend on the model's judgement of the source.
- Neither rule applies to a CV the owner edits by hand. No new failure code, no change to the
  message, the item checks or the web app.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cv-generation`: a new requirement — a source that does not describe a person's background, with
  no answers, is not turned into a CV.
- `fact-grounding`: a new requirement on the least a generated CV must contain.

## Impact

- `apps/api/src/generation`: `questions.ts` and `prompts.ts` (the questions call returns the
  judgement), `extract.stage.ts` (stores it), `compose.stage.ts` (the two rules), `checks.ts` (a pure
  function in place of `isEmptyDocument`).
- A migration adding one boolean column to `cvs`.
- Unit and end-to-end tests of the above; `apps/api/test/anthropic-stub.ts` helpers if needed.
- `docs/architecture.md`: the grounding pipeline and the list of what is not caught.
