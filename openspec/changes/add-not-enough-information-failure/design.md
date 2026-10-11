## Context

`ComposeStage` throws `GenerationError('generation_failed', retryable = true)` when the checked
draft is empty. The job runner therefore repeats the stage three times and then stores
`generation_failed`, which is in `RETRYABLE_FAILURES`, so the owner is offered "Try again". A manual
retry restarts `compose` from the stored facts; skipped questions are not asked again, so the input
of the retry is identical. Seen with a real document: a university report uploaded as a CV, seven
questions skipped, three failed attempts, a generic message.

The job runner already stores the code of the error that ended the last attempt, and the web
failure screen already renders the server's reason and switches between "Try again" and "Start a
new CV" on `failure.retryable`.

## Goals / Non-Goals

**Goals:**

- The owner is told the real cause and given a way out that can work.
- No model calls are spent on attempts whose outcome is already known.

**Non-Goals:**

- Detecting before writing that a source is not a CV. That would be a judgement of the model, and
  the checks already give the answer for free.
- Asking skipped questions again, or returning the CV to `awaiting_answers`. It changes the flow of
  questions, which is recorded in the README as a deliberate cut.
- Any change to the checks or the prompts.

## Decisions

**Two cases, one code.** After the checks, an empty document comes about in two ways:

1. _The writer wrote nothing_ — its first draft has no items, so nothing was rejected and no rewrite
   was asked for. The writer followed its instruction to leave empty what no fact supports. Another
   attempt gets the same facts and the same instruction: fail at once, `retryable = false`.
2. _The writer wrote items and none survived_: all were rejected, and in the rewrite they were
   rejected again or taken out. This can be a bad draft of the model
   (wrong fact numbers throughout), which another attempt may fix, so it stays a failed attempt:
   `retryable = true` for the job runner. The error carries the new code, so when the third attempt
   ends the same way the CV is stored with `not_enough_information`.

Alternative: keep `generation_failed` for case 2. Rejected, because the owner's retry would again
write from the same facts after three attempts already failed on them; the honest reason is that
nothing they provided could be verified. Alternative: treat both cases as final at once. Rejected,
because it gives up the retry in the one case where the model may simply have erred.

**The code is not in `RETRYABLE_FAILURES`.** That one list drives the `retryable` flag sent to the
client, the condition of `POST /api/cvs/:id/retry`, and the runner's clean-up of a CV that cannot be
retried, so nothing else has to know the new code.

**The database keeps the list of codes** in a check constraint, so a migration replaces the
constraint, in the manner of `1791430000000-add-request-rejected-failure.ts`. Its `down` maps the
new code back to `generation_failed`.

**The message** names the cause and the remedy and says nothing internal: "We did not find enough
information about your background to write a CV. Start a new one from your résumé or a description
of your experience, and answer the questions we ask."

## Risks / Trade-offs

- [A model that wrongly returns an empty draft from good facts ends the CV with no retry] → The user
  starts again; the writer is told to write what the facts support, and an empty draft from usable
  facts was not seen in the runs against the real API. Case 2 keeps its attempts.
- [The facts and questions of the failed CV are not reused by the new one] → Accepted: the new CV
  needs another source anyway.
