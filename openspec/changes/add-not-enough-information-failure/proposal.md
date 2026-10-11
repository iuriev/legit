## Why

When the source and the answers hold nothing about the person that a CV can use — a document that
is not a CV, with every question skipped — the writer produces nothing that passes the checks. Today
that is reported as `generation_failed`: three writing attempts are spent on the same facts, the
owner reads "We could not finish your CV. Try again.", and the retry it offers writes from the same
facts again and fails the same way. The refusal to invent is correct; the explanation and the way
out are wrong.

## What Changes

- A new failure code, `not_enough_information`, for a CV that cannot be written because nothing in
  what the user provided supports any item.
- When the writer leaves the whole draft empty, the generation fails with that code at once, without
  further attempts.
- When the writer does write items and every one of them is rejected, in the draft and in its
  rewrite, the attempt still counts as a failed attempt and is repeated; if all three attempts end
  that way the CV fails with the same code instead of `generation_failed`.
- The failure cannot be retried by the owner. The reason says what was missing and what to do: start
  a new CV from a résumé or a description of their own background, and answer the questions.
- No change to the checks, the prompts or what reaches a stored CV.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fact-grounding`: "Handling rejected items" — what happens when nothing passes is now a named
  failure with its own reason, and an empty draft is told apart from a rejected one.
- `cv-generation`: "Failures that cannot be retried" — a source without usable information joins the
  list of failures that end the generation at once.

## Impact

- `packages/contracts`: `CvFailureCode` gains `not_enough_information`.
- `apps/api`: `generation/compose.stage.ts`, `cvs/failure.ts`, a new migration that widens the check
  constraint on `cvs.failure_code`, and the compose end-to-end tests.
- `apps/web`: no code change. The failure screen already shows the server's reason and offers
  "Start a new CV" for a failure that cannot be retried.
- `docs/architecture.md`: one sentence in the grounding pipeline.
