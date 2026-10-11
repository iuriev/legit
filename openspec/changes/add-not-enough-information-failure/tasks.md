## 1. The not_enough_information failure

- [x] 1.1 Add `not_enough_information` to `CvFailureCode` in `packages/contracts/src/cv.ts`
- [x] 1.2 Add a migration that replaces `cvs_failure_code_check` with one that allows the new code (`down` maps it to `generation_failed`), and register it in `migrations/index.ts`
- [x] 1.3 Add the message to `cvs/failure.ts`; leave the code out of `RETRYABLE_FAILURES`
- [x] 1.4 In `compose.stage.ts`, throw `not_enough_information` for an empty checked document: not retryable when the first draft had no items, retryable when items were written and none survived the checks and the rewrite
- [x] 1.5 End-to-end tests in `compose.e2e-spec.ts`: an empty draft fails at once with one writing call and one attempt; a draft rejected on all three attempts ends as `not_enough_information` (update the existing test); the failure is not retryable and `POST /api/cvs/:id/retry` is refused with `not_retryable`
- [x] 1.6 Mention the named failure in the grounding pipeline of `docs/architecture.md`
- [x] 1.7 Run lint, typecheck, unit and end-to-end tests; run the code-reviewer and qa-tester agents, including the failure screen in a browser at 360 and 1440 pixels
