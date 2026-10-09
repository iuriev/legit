# cv-pdf-export Specification

## Purpose
Turns a saved CV into the file the user sends to an employer: an A4 PDF with real, selectable text that shows exactly what was saved.

## Requirements

### Requirement: PDF download
The system SHALL produce, for a ready CV of the signed-in user, a PDF with A4 pages that is offered to the browser as a file download named after the candidate.

#### Scenario: Download of a ready CV
- **WHEN** the owner downloads a ready CV
- **THEN** the response is a PDF whose pages are A4 and which the browser saves as a file

#### Scenario: CV that is not ready
- **WHEN** a download is requested for a CV that is generating, waiting for answers or failed
- **THEN** the system rejects the request

### Requirement: Selectable text
The PDF SHALL contain its content as text, not as an image, so that it can be selected, copied and searched.

#### Scenario: Extracting text
- **WHEN** the text of a downloaded PDF is extracted with a PDF reader
- **THEN** it contains the candidate's name, the summary and every bullet point of the saved CV

### Requirement: The PDF shows the saved CV
The PDF SHALL be rendered from the stored CV at the time of the request, SHALL contain every non-empty field of it, and SHALL omit sections and fields that are empty.

#### Scenario: After a manual edit
- **WHEN** the owner changes a bullet point, saves and downloads
- **THEN** the PDF contains the changed text

#### Scenario: Empty section
- **WHEN** the education section of the CV is empty
- **THEN** the PDF has no education heading

### Requirement: Long and unusual content
The PDF SHALL continue on further A4 pages when the content does not fit on one, and SHALL render Latin text with diacritics and Cyrillic text that the owner typed by hand.

#### Scenario: Content longer than one page
- **WHEN** a CV has more content than fits on one A4 page
- **THEN** the PDF has several A4 pages and no content is cut off

#### Scenario: Characters outside basic Latin
- **WHEN** the owner's name contains the characters "Š" and "ї"
- **THEN** the extracted text of the PDF contains the name unchanged

### Requirement: Download with unsaved changes
The web application SHALL save pending changes before downloading, so that the file never differs from what the owner sees.

#### Scenario: Download with unsaved changes
- **WHEN** the owner changes a field and chooses to download without saving first
- **THEN** the changes are saved and the downloaded PDF contains them
