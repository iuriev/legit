## ADDED Requirements

### Requirement: A source that is not about a person
The system SHALL decide, when it reads the source, whether the source describes a person's professional background — their work, education or skills — and SHALL NOT write a CV from a source that does not, unless the user has answered at least one question. In that case the generation SHALL fail at once, before the CV is written, with the reason that not enough information about the user was found, and SHALL NOT be offered for a manual retry.

#### Scenario: A report, every question skipped
- **WHEN** the source is a report on a university assignment, and the user skips every question
- **THEN** the CV fails with the reason that not enough information about them was found, nothing is written, and the owner is offered to start a new CV

#### Scenario: A report, nothing to ask
- **WHEN** the source does not describe a person's background and the system has no question to ask
- **THEN** the CV fails with the same reason without waiting for answers

#### Scenario: A report, questions answered
- **WHEN** the source does not describe a person's background and the user answers at least one question
- **THEN** the CV is written from the facts and the answers

#### Scenario: A CV, every question skipped
- **WHEN** the source describes the user's work and education, and the user skips every question
- **THEN** the CV is written from the source
