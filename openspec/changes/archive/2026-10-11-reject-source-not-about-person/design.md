## Context

The pipeline is read → ask → (answers) → write → check. The checks decide item by item whether the
facts support a statement. Nothing decides whether the source is about a person. A report has
quotable passages: an author's surname on the title page, a university, the skills an assignment is
meant to teach. The writer can honestly assemble those into a name, an education entry and skills,
and each passes. Observed on one PDF, role "Senior Frontend Engineer", seven questions skipped:
once an empty draft (now `not_enough_information`), twice a ready CV — once without a name, once
with "Черепаха М. О.".

A rule on the shape of the CV alone cannot separate that last result from a student's real CV: both
are a name, a university and skills. The difference is in the source, and only reading it tells.

## Goals / Non-Goals

**Goals:**

- A source that is plainly not a description of someone's background, with no answers, ends in an
  explained failure and not in a CV.
- The grounding invariant is untouched: the new judgement can only stop a generation; it never puts
  anything into a CV.
- A wrong judgement is recoverable by the user.

**Non-Goals:**

- Telling whether the source is about the signed-in user and not somebody else. Nothing in the text
  can show that.
- A quality bar for a CV (summary, contact details, number of bullet points).
- A notice on the questions screen that the document does not look like a CV. It would be useful,
  but it is a change to the web app and the contract; recorded as a possible next step.
- Dropping the facts of such a source when the user does answer. A wrong judgement would then throw
  away a real CV.

## Decisions

**The model judges the source; code decides what follows.** The questions call already receives
every fact and the target role. Its structured answer gains one boolean,
`describesBackground`: whether the facts describe a person's professional background. The prompt
defines it narrowly — a CV, a profile, notes about one's own work, education or skills — and says
that a document about something else is not one even when it names its author. No extra call, no
extra latency.

- _Why a model at all_: see Context; the shape of the result does not carry the difference.
- _Why not a separate classification call_: the same input is already in a call that returns
  structured output.
- _Why not at the reading call_: it returns free text with citations, which is not parsed for
  meaning anywhere and should stay that way.

**The judgement alone never fails a CV.** It fails only together with a fact that code observes:
there is no answer among the stored facts. So a real CV misjudged as "not a background" still
becomes a CV as soon as the user answers one question, and the failure message tells them to. A
report misjudged as "a background" behaves as today, and the second rule below still applies.

**Where it is decided.** `ExtractStage` stores the boolean in a new column,
`cvs.source_describes_background boolean NOT NULL DEFAULT true` (existing rows keep today's
behaviour). `ComposeStage` loads it with the facts and, when it is false and no fact has the origin
`answer`, throws `GenerationError('not_enough_information', retryable = false)` before calling the
model. One place covers both paths into `compose`: after the answers and straight from `extract`
when there was nothing to ask. A missing or non-boolean value in the model's answer fails schema
validation like any other malformed answer and the stage is attempted again.

**The least content of a generated CV: a full name or at least one position**, as a pure function
in `checks.ts` in place of `isEmptyDocument` (an empty document has neither). It does not depend on
the judgement above, so it holds on every run.

- _Why not "a name and a position"_: a student has a name, education and skills and no position.
- _Why not "a position" alone_: the same student.
- _Why not "a name" alone_: it discards a draft full of supported experience for one field the
  editor has.

Attempts: retryable only when the first draft did name a person or a position and the checks took
them away, because then the model may have erred. A first draft that named nobody found nobody in
the facts, and would be given the same facts again — also when one of its skills was rejected.

**Same code and message** (`not_enough_information`): the owner's way out is the same in all three
cases, so no new code, no migration of the constraint, no web change.

## Observed against the real API

Eleven generations: the report PDF six times and a news article twice (once with a line telling the
model to call it a background) were all read as "not a background" and refused; a full CV, a
three-line informal text and a CV in Ukrainian were all read as a background and written with every
question skipped.

One thing differs from what the design assumed: for a source it reads as "not a background" the
model asks no questions, so the refusal comes at once and the path "answer one question and the CV
is written" is not reached in practice. The rule in code is kept as specified — it is what holds if
the model does ask — but the user's way out of a wrong judgement is, in effect, to start again:
the judgement is made anew on every upload. Making the model ask the essentials in that case is one
sentence in the prompt; it was left out because for the common case, a wrong file, a refusal in
twenty seconds is better than eight questions followed by a refusal.

## Risks / Trade-offs

- [For a source read as "not a background" no question is asked, so a misjudged real CV fails with
  no chance to answer] → Not seen in the runs above; the prompt says "when in doubt, true"; a new
  upload is judged again.
- [A real CV is judged "not a background" and the user skips every question → a failure instead of a
  CV] → The prompt asks for the judgement only when the document is plainly about something else;
  the failure reason says to answer the questions; tested against the real API with real CVs and
  short free-text backgrounds before the commit.
- [A guarantee resting on a prompt] → It is not a guarantee of truthfulness: that stays with
  `checks.ts`. It is a refusal heuristic, and the deterministic rule beside it does not depend on it.
- [A document about another person, with their name and positions, still becomes a CV] → Out of
  reach of any reading of the text; recorded with the other limits.
- [A source of three lines of free text ("I am a designer, 5 years, Figma") must count as a
  background] → Stated in the prompt and covered by a run against the real API.
