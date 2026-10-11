## 1. Refuse a source that is not about a person, and a CV without a name or a position

- [x] 1.1 Add `describesBackground: boolean` to `questionsSchema` in `questions.ts` and define it in `QUESTIONS_SYSTEM` in `prompts.ts`; extend `questions.spec.ts`
- [x] 1.2 Add a migration for `cvs.source_describes_background boolean NOT NULL DEFAULT true`, register it, and add the column to `cv.entity.ts` if the entity lists columns
- [x] 1.3 `extract.stage.ts`: store the judgement in the commit of the stage
- [x] 1.4 `compose.stage.ts`: fail with `not_enough_information`, not retryable and before any model call, when the judgement is false and no fact is an answer
- [x] 1.5 `checks.ts`: replace `isEmptyDocument` with a pure function for "a full name or at least one position"; move and extend its unit tests; use it in `compose.stage.ts`
- [x] 1.6 Update the stub replies of the questions call in the end-to-end helpers so that existing tests send `describesBackground: true`
- [x] 1.7 End-to-end tests: not a background with all questions skipped fails with no writing call; not a background with nothing to ask fails without waiting for answers; not a background with one answer is written; a background with all questions skipped is written; skills and education only fails at once; a name without a position is ready; a position without a name is ready; a name and positions lost to the checks is repeated; a save by hand without a name and positions is accepted
- [x] 1.8 `docs/architecture.md`: the judgement and the least content in the grounding pipeline, and "a document about another person" in what is not caught
- [x] 1.9 Run lint, typecheck, unit and end-to-end tests; run the code-reviewer and qa-tester agents. The tester uploads the report PDF with every question skipped three times and expects a failure each time, and runs a real CV as text, a three-line free-text background and a real CV with every question skipped, expecting a ready CV each time
