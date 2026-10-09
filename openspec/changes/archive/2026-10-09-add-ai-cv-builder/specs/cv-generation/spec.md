# Spec Delta

## Purpose

Accepts a source document and a target role and turns them into a CV through a background job whose state is stored on the server, so that a slow generation never blocks the screen and survives a reload, a change of device, a failure and a restart.

## ADDED Requirements

### Requirement: Starting a CV
The system SHALL create a CV from a target role and exactly one source — an uploaded PDF or pasted text — and SHALL answer at once with the new CV's identifier, before any generation has run.

#### Scenario: PDF and a target role
- **WHEN** a signed-in user submits a PDF and the target role "Senior Backend Engineer"
- **THEN** a CV is created in the generating state and its identifier is returned without waiting for the model

#### Scenario: Pasted text and a target role
- **WHEN** a signed-in user submits free text describing their background and a target role
- **THEN** a CV is created in the generating state and its identifier is returned

#### Scenario: Both or neither source
- **WHEN** a request has both a file and text, or neither
- **THEN** the system rejects it with a validation error and creates nothing

### Requirement: Input limits
The system SHALL reject, before any generation runs, a file that is not a PDF, a PDF larger than 5 MB, text longer than 30,000 characters, a source that is empty, and a target role that is empty or longer than 120 characters.

#### Scenario: File that is not a PDF
- **WHEN** a user uploads a file whose content is not a PDF, whatever its name or declared type
- **THEN** the system rejects it with an error naming the accepted format and creates nothing

#### Scenario: Oversized PDF
- **WHEN** a user uploads a PDF larger than 5 MB
- **THEN** the system rejects it with an error stating the limit and creates nothing

#### Scenario: Missing target role
- **WHEN** a request has a source but no target role
- **THEN** the system rejects it with a validation error and creates nothing

### Requirement: One generation at a time
The system SHALL allow a user at most one CV whose generation is running, and SHALL reject starting another until it finishes, fails or waits for answers.

#### Scenario: Second start while one is running
- **WHEN** a user whose CV is being generated starts another CV
- **THEN** the system rejects the request and says that a generation is already running

### Requirement: Observable progress
The system SHALL expose, for a CV of the signed-in user, its state — generating, waiting for answers, ready or failed — and, while generating, the current stage. The state SHALL come from the server on every read, so that it is the same after a reload and on another device.

#### Scenario: Reading progress during generation
- **WHEN** the owner reads a CV while its generation is running
- **THEN** the response says that it is generating and names the current stage

#### Scenario: Reload during generation
- **WHEN** the owner reloads the page, or opens the CV on another device, while its generation is running
- **THEN** the same progress is shown and the generation continues without being started again

#### Scenario: Generation finishes while nobody is watching
- **WHEN** the owner closes the browser during generation and returns after it has finished
- **THEN** the CV is ready and nothing has to be submitted again

### Requirement: Recovery from interruption
The system SHALL resume a generation whose processing was interrupted — for example by a restart of the server — without any action by the user and without losing the submitted source, facts or answers.

#### Scenario: Server restart during generation
- **WHEN** the server stops while a generation is being processed and is started again
- **THEN** the generation is picked up again and reaches the ready, waiting or failed state

### Requirement: Retrying transient failures
The system SHALL retry a generation stage that fails for a transient reason — the model service is unavailable, rate-limited or times out, or returns output that fails validation — up to three attempts in total, waiting between attempts.

#### Scenario: Temporary outage of the model service
- **WHEN** the first attempt of a stage fails because the model service is unavailable and the second succeeds
- **THEN** the generation completes and the user sees no failure

#### Scenario: Attempts exhausted
- **WHEN** a stage fails on all three attempts
- **THEN** the CV enters the failed state

### Requirement: Failures that cannot be retried
The system SHALL fail a generation at once, without further attempts, when retrying cannot help: the source has no readable text, the source is too long for the model, the model declines the request, or the model service rejects the credentials.

#### Scenario: Scanned PDF
- **WHEN** the source is a PDF without a text layer, so that no passage can be quoted from it
- **THEN** the CV fails with a reason saying that no text could be read and suggesting to paste the text instead

#### Scenario: Invalid API key
- **WHEN** the model service rejects the configured key
- **THEN** the CV fails with a reason saying that the AI service is not configured, and no further attempts are made

### Requirement: Reporting a failure
The system SHALL show the owner of a failed CV a reason in plain language that exposes no internal detail, and SHALL keep what was already produced.

#### Scenario: Failed CV
- **WHEN** the owner opens a CV whose generation failed
- **THEN** a reason is shown, together with a way to retry when the failure can be retried

### Requirement: Manual retry
The system SHALL let the owner restart a failed generation from the stage that failed when the failure can be retried, reusing the stored source, facts and answers.

#### Scenario: Retry after exhausted attempts
- **WHEN** the owner retries a CV that failed while it was being written
- **THEN** writing starts again from the stored facts and answers, and the questions are not asked again

#### Scenario: Retry of a failure that cannot be retried
- **WHEN** the owner asks to retry a CV that failed because its source has no readable text
- **THEN** the system rejects the request

### Requirement: Removing the source after use
The system SHALL delete the uploaded file or pasted text once facts have been extracted from it, and SHALL keep only the quoted passages.

#### Scenario: After extraction
- **WHEN** extraction of a CV's facts has completed
- **THEN** the original file or text is no longer stored
