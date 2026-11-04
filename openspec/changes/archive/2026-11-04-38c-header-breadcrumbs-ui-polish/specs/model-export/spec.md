# model-export Spec Delta

## ADDED Requirements

### Requirement: Export panel layout
The parameter panel footer SHALL present export controls in a compact toolbar layout that minimizes vertical footprint. Format selection, printer selection, and the primary download action SHALL be integrated with tight padding and clear status indication.

#### Scenario: Compact footer footprint
- **WHEN** the export panel is rendered in the parameter sidebar footer
- **THEN** it occupies a compact vertical space with reduced padding, keeping the download action primary and easily accessible

#### Scenario: Status indication
- **WHEN** the model layout status changes (building, fits, or plate overflow)
- **THEN** status feedback is displayed cleanly alongside or within the compact export controls without displacing the primary action
