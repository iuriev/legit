## MODIFIED Requirements

### Requirement: Failures that cannot be retried
The system SHALL fail a generation at once, without further attempts, when retrying cannot help: the source has no readable text, the source is too long for the model, the model declines the request, the model service rejects the credentials, or the writer finds nothing in the source and the answers from which a CV can be written. A failure of this kind SHALL NOT be offered for a manual retry.

#### Scenario: Scanned PDF
- **WHEN** the source is a PDF without a text layer, so that no passage can be quoted from it
- **THEN** the CV fails with a reason saying that no text could be read and suggesting to paste the text instead

#### Scenario: Invalid API key
- **WHEN** the model service rejects the configured key
- **THEN** the CV fails with a reason saying that the AI service is not configured, and no further attempts are made

#### Scenario: A document that is not about the user
- **WHEN** the source is a document that says nothing about the user's own background, and the user skips every question
- **THEN** the CV fails with a reason saying that not enough information about them was found and that they can start a new CV from a résumé or a description of their background and answer the questions, and the owner is offered to start a new CV instead of a retry

#### Scenario: Retry is refused
- **WHEN** the owner asks to retry a CV that failed because not enough information was provided
- **THEN** the request is refused and no generation is started
