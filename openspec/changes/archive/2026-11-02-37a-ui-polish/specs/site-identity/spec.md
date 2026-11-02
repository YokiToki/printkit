# Spec Delta

## MODIFIED Requirements

### Requirement: Donation address
The start pages SHALL show a footer with a "Support the project" heading accompanied by a glowing red heart icon, a donation address on the TRON network (TRC20), and a button that copies the address. The footer SHALL say what the address is for and that donations are optional. When the interface language is Russian (`ru`), the footer SHALL also state that support is possible via USDT or CloudTips and SHALL show a link button that opens the CloudTips page (`https://pay.cloudtips.ru/p/67563a44`) in a new tab without giving the new page access to the opener; when the interface language is English (`en`), the CloudTips link SHALL NOT be shown and the text SHALL name USDT only.

#### Scenario: Support heading icon
- **WHEN** a start page footer is shown
- **THEN** the support heading displays a red heart icon with a soft glow next to the localized heading text

#### Scenario: Copy
- **WHEN** the user presses the copy button
- **THEN** the address is placed on the clipboard and a short confirmation is shown

#### Scenario: No clipboard access
- **WHEN** copying is not permitted by the browser
- **THEN** the address stays visible and selectable so it can be copied by hand

#### Scenario: CloudTips in Russian only
- **WHEN** the interface language is Russian
- **THEN** the donation text mentions USDT and CloudTips and a CloudTips link button is shown that opens `https://pay.cloudtips.ru/p/67563a44` in a new tab with `noopener`, and when the language is switched to English the CloudTips link button is hidden and the text mentions USDT only

#### Scenario: Not in tools
- **WHEN** a tool is open
- **THEN** the footer is not shown
