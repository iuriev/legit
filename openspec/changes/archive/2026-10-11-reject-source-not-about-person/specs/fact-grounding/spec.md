## ADDED Requirements

### Requirement: Least content of a generated CV
The system SHALL present a generated CV as ready only when, after the checks, it contains a full name or at least one position. A draft that has neither SHALL be treated like a draft of which nothing passed: the generation fails with the reason that not enough information was provided, and nothing of the draft is stored. The rule SHALL NOT restrict what the owner may save when editing a CV by hand.

#### Scenario: Skills and education only
- **WHEN** the writer's first draft passes the checks and contains an education entry and skills, but no full name and no position
- **THEN** the CV fails at once with the reason that not enough information was provided, no further attempt is made, and no CV is shown as ready

#### Scenario: A name without experience
- **WHEN** the checked draft contains a full name, an education entry and skills, and no position
- **THEN** the CV is ready

#### Scenario: Experience without a name
- **WHEN** the checked draft contains a position and no full name
- **THEN** the CV is ready, and the owner can add the name by hand

#### Scenario: Name and positions lost to the checks
- **WHEN** the draft names a person or a position, and after the checks and the rewrite neither a full name nor a position remains
- **THEN** the generation is treated as a failed attempt and is repeated

#### Scenario: Nobody named, an item rejected
- **WHEN** the first draft names no person and no position, and one of its skills is rejected
- **THEN** the CV fails with the reason that not enough information was provided after that one attempt

#### Scenario: Editing by hand
- **WHEN** the owner removes the name and every position from a ready CV and saves it
- **THEN** the save is accepted

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
- **WHEN** a draft that names a person or a position has every item rejected, and in the rewrite rejected again or left out
- **THEN** the generation is treated as a failed attempt and no empty CV is shown as ready

#### Scenario: Nothing passes on any attempt
- **WHEN** no item survives on any of the three attempts
- **THEN** the CV fails with the reason that not enough information was provided, and it cannot be retried

#### Scenario: Nothing to write
- **WHEN** the writer returns a draft with no items at all, because no fact describes the person's background
- **THEN** the CV fails at once with the reason that not enough information was provided, no further attempt is made, and no empty CV is shown as ready
