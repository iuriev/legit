# cv-documents Specification

## Purpose
Defines the CV as a document a user owns: what it contains, how the user finds it again, edits it by hand and removes it, and how concurrent edits from two devices are kept from silently overwriting each other.

## Requirements

### Requirement: Document structure
A CV SHALL consist of contact details (full name, email, phone, location, links), a summary, experience entries (company, title, location, start and end dates, bullet points), education entries (institution, degree, start and end dates, details) and a list of skills. Every field SHALL be optional.

#### Scenario: Ready CV
- **WHEN** the owner reads a CV whose generation has finished
- **THEN** the response contains the five sections in this structure together with the target role and the current version number

### Requirement: Generated content
A generated CV SHALL be written in English whatever the language of the source, SHALL describe experience as concise bullet points, SHALL aim the summary at the target role and SHALL order experience entries with the most relevant to the target role first.

#### Scenario: Source in another language
- **WHEN** the source is written in Ukrainian
- **THEN** the generated CV is in English

#### Scenario: Ordering by relevance
- **WHEN** the target role is "Senior Backend Engineer" and the facts describe a recent sales job and an earlier backend job
- **THEN** the backend job is the first experience entry

### Requirement: Listing CVs
The system SHALL list the signed-in user's CVs, newest first, with the target role, the state and the time of the last change of each.

#### Scenario: Returning user
- **WHEN** a user who created two CVs signs in again
- **THEN** the list shows both, newest first

#### Scenario: Other users' CVs
- **WHEN** two users each have CVs
- **THEN** each user's list contains only their own

### Requirement: Manual editing
The system SHALL let the owner change any field of a ready CV, add and remove experience entries, education entries, bullet points, links and skills, and SHALL store the result when the owner saves. Manual edits SHALL be stored as written and are not checked against the facts.

#### Scenario: Editing a bullet point
- **WHEN** the owner rewrites a bullet point and saves
- **THEN** a later read of the CV, from any device, returns the rewritten text

#### Scenario: Adding what the AI left out
- **WHEN** the owner types a phone number that the generated CV lacked and saves
- **THEN** the phone number is stored

#### Scenario: Editing a CV that is not ready
- **WHEN** a save is sent for a CV that is generating, waiting for answers or failed
- **THEN** the system rejects it

### Requirement: Validation of saved documents
The system SHALL accept a saved document only if it matches the document structure and stays within limits on the length of each field and the number of entries, and SHALL treat its content as plain text.

#### Scenario: Oversized field
- **WHEN** a save contains a summary longer than the allowed length
- **THEN** the system rejects it with a validation error naming the field and stores nothing

#### Scenario: Markup in a field
- **WHEN** a saved field contains HTML or script markup
- **THEN** it is stored and later shown and exported as the literal characters, without being interpreted

### Requirement: Version-checked saving
Every save SHALL state the version of the CV it was based on. The system SHALL store the save and increase the version when that version is still current, and SHALL otherwise reject the save without changing the stored CV.

#### Scenario: Save based on the current version
- **WHEN** the owner saves changes based on version 3 and the stored version is 3
- **THEN** the changes are stored and the version becomes 4

#### Scenario: Save based on an outdated version
- **WHEN** the owner saved from a phone, making the version 4, and then saves from a laptop that still holds version 3
- **THEN** the laptop's save is rejected as a conflict, the stored CV is unchanged, and the laptop is offered the current version

### Requirement: Unsaved changes
The web application SHALL show whether the open CV has unsaved changes, and SHALL warn before the owner leaves or reloads the page with unsaved changes.

#### Scenario: Leaving with unsaved changes
- **WHEN** the owner changes a field and tries to close the tab without saving
- **THEN** the browser asks for confirmation

### Requirement: Deleting a CV
The system SHALL let the owner delete a CV together with its facts, questions and answers.

#### Scenario: Deletion
- **WHEN** the owner deletes a CV
- **THEN** it disappears from the list and reading it answers that it was not found

### Requirement: Usable on a phone
The web application SHALL be usable on a screen 360 CSS pixels wide: every screen fits without horizontal scrolling, and every action — signing in, creating a CV, answering questions, editing, saving and downloading — can be completed by touch.

#### Scenario: Editing on a phone
- **WHEN** the owner opens a ready CV on a 360-pixel-wide screen
- **THEN** every field can be read, edited and saved without horizontal scrolling
