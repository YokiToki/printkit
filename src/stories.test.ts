// @vitest-environment jsdom
import React from 'react'
import './i18n'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { composeStories } from '@storybook/react'
import { UnitProvider } from './ui/UnitProvider'

import * as ButtonStories from './ui/Button.stories'
import * as ToggleStories from './ui/Toggle.stories'
import * as SegmentedControlStories from './ui/SegmentedControl.stories'
import * as NumberFieldStories from './ui/NumberField.stories'
import * as LengthFieldStories from './ui/LengthField.stories'
import * as SectionStories from './ui/Section.stories'
import * as BannerStories from './ui/Banner.stories'
import * as ConfirmDialogStories from './ui/ConfirmDialog.stories'

import * as ToolbarStories from './features/editor/Toolbar.stories'
import * as SketchToolbarStories from './features/editor/sketch/SketchToolbar.stories'
import * as ViewCubeStories from './features/editor/ViewCube.stories'
import * as OutlinerStories from './features/editor/Outliner.stories'
import * as PropertiesStories from './features/editor/Properties.stories'
import * as ConstraintPanelStories from './features/editor/sketch/ConstraintPanel.stories'
import * as FeatureDialogStories from './features/editor/sketch/FeatureDialog.stories'
import * as CutPanelStories from './features/editor/cut/CutPanel.stories'

const storyModules = {
  Button: ButtonStories,
  Toggle: ToggleStories,
  SegmentedControl: SegmentedControlStories,
  NumberField: NumberFieldStories,
  LengthField: LengthFieldStories,
  Section: SectionStories,
  Banner: BannerStories,
  ConfirmDialog: ConfirmDialogStories,
  Toolbar: ToolbarStories,
  SketchToolbar: SketchToolbarStories,
  ViewCube: ViewCubeStories,
  Outliner: OutlinerStories,
  Properties: PropertiesStories,
  ConstraintPanel: ConstraintPanelStories,
  FeatureDialog: FeatureDialogStories,
  CutPanel: CutPanelStories,
}

describe('Storybook Stories Smoke Test', () => {
  for (const [moduleName, module] of Object.entries(storyModules)) {
    describe(moduleName, () => {
      const composed = composeStories(module)
      for (const [storyName, Story] of Object.entries(composed)) {
        it(`renders ${storyName} without crashing`, () => {
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
          const { container } = render(
            React.createElement(UnitProvider, null, React.createElement(Story))
          )
          expect(container).toBeDefined()
          expect(consoleSpy).not.toHaveBeenCalled()
          consoleSpy.mockRestore()
        })
      }
    })
  }
})
