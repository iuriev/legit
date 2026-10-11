## MODIFIED Requirements

### Requirement: Handling rejected items
The system SHALL give the model one chance to rewrite rejected items, telling it why each was rejected, and SHALL leave out of the CV any item that is rejected again. The CV SHALL record how many items were left out, and the owner SHALL be told. When nothing at all passes, the generation SHALL fail rather than produce an empty CV, and the reason given to the owner SHALL be that what they provided does not contain enough information about them, not that a retry may help.

#### Scenario: Rewrite passes
- **WHEN** a rejected bullet point is rewritten without the unsupported number
- **THEN** the rewritten bullet point is included in the CV

#### Scenario: Rewrite fails
- **WHEN** a bullet point is rejected again after the rewrite
- **THEN** it is absent from the CV and the owner sees that one item was left out because it could not be verified

#### Scenario: Nothing passes
- **WHEN** every item of the draft is rejected, and in the rewrite is rejected again or left out
- **THEN** the generation is treated as a failed attempt and no empty CV is shown as ready

#### Scenario: Nothing passes on any attempt
- **WHEN** no item survives on any of the three attempts
- **THEN** the CV fails with the reason that not enough information was provided, and it cannot be retried

#### Scenario: Nothing to write
- **WHEN** the writer returns a draft with no items at all, because no fact describes the person's background
- **THEN** the CV fails at once with the reason that not enough information was provided, no further attempt is made, and no empty CV is shown as ready
