# Spec Delta

## MODIFIED Requirements

### Requirement: Analytics consent
The site SHALL use Yandex Metrika for visit statistics only after the visitor consents. A consent banner SHALL be shown on the first visit as a floating popover card in the bottom-left corner with rounded corners, overlaying the interface without taking space in the document layout flow, with Accept and Decline of equal prominence and a short statement of what is collected, without naming the analytics service. Until Accept is pressed, the analytics script SHALL NOT be loaded and no analytics cookie or request SHALL be made. The choice SHALL be remembered and SHALL be changeable from the footer. Session replay and click maps SHALL be off, and the statistics SHALL NOT contain photos, files, parameter values or anything else the visitor enters.

#### Scenario: First visit
- **WHEN** a visitor opens the site for the first time
- **THEN** the floating consent card is shown in the bottom-left corner and no request to the analytics host is made

#### Scenario: Floating popover appearance
- **WHEN** the consent banner is visible
- **THEN** it floats above the page content in the bottom-left corner with rounded corners and shadow, without pushing or affecting the page layout or status bar

#### Scenario: Accept
- **WHEN** the visitor presses Accept
- **THEN** the banner closes, the analytics script is loaded and later page views are counted

#### Scenario: Decline
- **WHEN** the visitor presses Decline
- **THEN** the banner closes, nothing is loaded, and the banner does not return on later visits

#### Scenario: Change of mind
- **WHEN** the visitor uses the analytics link in the footer
- **THEN** they can accept or decline again, and a withdrawn consent stops counting in the same session

#### Scenario: Photos and parameters
- **WHEN** the visitor uses the photo tool or edits parameters
- **THEN** no photo, file or parameter value is sent to the analytics host

#### Scenario: Remembered choice
- **WHEN** the visitor has accepted and returns
- **THEN** the banner is not shown and counting resumes
