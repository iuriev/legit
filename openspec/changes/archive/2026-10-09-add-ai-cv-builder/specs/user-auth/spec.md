# Spec Delta

## Purpose

Provides email and password accounts and the session that ties every CV to its owner, so that a user can come back from any device and reach only their own data.

## ADDED Requirements

### Requirement: Registration
The system SHALL create an account from an email and a password and start a session for it.

#### Scenario: Successful registration
- **WHEN** a visitor submits an email that has no account and a valid password
- **THEN** an account is created and a session is started

#### Scenario: Email already registered
- **WHEN** a visitor submits an email that already has an account
- **THEN** the system rejects the request, says that the email already has an account and starts no session

### Requirement: Credential rules
The system SHALL require a syntactically valid email and a password of 8 to 72 characters that also takes at most 72 bytes in UTF-8. Emails SHALL be compared case-insensitively and ignoring surrounding whitespace, and SHALL be unique across accounts.

#### Scenario: Password too short
- **WHEN** a registration request has a password shorter than 8 characters
- **THEN** the system rejects it with a validation error and creates no account

#### Scenario: Password over 72 bytes
- **WHEN** a registration request has a password of 40 Cyrillic characters, which takes 80 bytes
- **THEN** the system rejects it with a validation error saying that the password is too long and creates no account

#### Scenario: Same email in a different case
- **WHEN** a user registered as "user@example.com" signs in as "User@Example.com"
- **THEN** the system treats it as the same account

### Requirement: Sign-in
The system SHALL start a session when the email and password match an account, and SHALL otherwise reject the request with one error that does not reveal whether the email exists.

#### Scenario: Correct credentials
- **WHEN** a user submits the email and password of their account
- **THEN** a session is started

#### Scenario: Wrong password or unknown email
- **WHEN** a sign-in request has a wrong password, or an email that has no account
- **THEN** the system rejects it with the same error in both cases and starts no session

### Requirement: Session
The system SHALL carry the session in a cookie that page scripts cannot read and that is not sent with cross-site requests that change data. A session SHALL work from any device on which the user signs in, and SHALL end when the user signs out.

#### Scenario: Returning on another device
- **WHEN** a user signs in on a second device
- **THEN** that device shows the same CVs as the first

#### Scenario: Sign-out
- **WHEN** a signed-in user signs out
- **THEN** the session cookie is cleared and later requests from that browser are treated as unauthenticated

#### Scenario: Tampered session
- **WHEN** a request carries a session cookie that was modified or was not issued by the system
- **THEN** the request is treated as unauthenticated

### Requirement: Access control
The system SHALL require a session for every operation on CVs, and SHALL select data by the session's user only, never by a user identifier sent by the client. A CV of another user SHALL be reported as not found.

#### Scenario: Unauthenticated request
- **WHEN** a request without a session asks for a CV, the CV list, or creates, changes, deletes or downloads a CV
- **THEN** the system rejects it as unauthenticated

#### Scenario: Another user's CV
- **WHEN** a signed-in user reads, changes, answers questions for, deletes, retries or downloads a CV that belongs to another user
- **THEN** the system answers that the CV was not found and changes nothing

### Requirement: Protection against guessing
The system SHALL limit how often one client can attempt registration and sign-in.

#### Scenario: Too many attempts
- **WHEN** a client exceeds the allowed number of sign-in or registration attempts in the time window
- **THEN** further attempts are rejected until the window passes
