import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Toolbar, type TransformTool } from './Toolbar'
import type { SelectionMode } from './face/FaceToolsPanel'

const meta: Meta<typeof Toolbar> = {
  title: 'Editor/Toolbar',
  component: Toolbar,
}

export default meta
type Story = StoryObj<typeof Toolbar>

export const Default: Story = {
  render: () => {
    const [tool, setTool] = useState<TransformTool>('select')
    const [snap, setSnap] = useState(true)
    const [snapMm, setSnapMm] = useState(5)
    const [snapDeg, setSnapDeg] = useState(15)
    const [proj, setProj] = useState<'persp' | 'ortho'>('persp')
    const [mode, setMode] = useState<SelectionMode>('object')

    return (
      <div className="w-full bg-surface-1 rounded-card border border-border p-1">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          snap={snap}
          onSnapChange={setSnap}
          snapStepMm={snapMm}
          snapStepDeg={snapDeg}
          onSnapStepChange={(mm, deg) => {
            setSnapMm(mm)
            setSnapDeg(deg)
          }}
          projection={proj}
          onProjectionChange={setProj}
          selectionMode={mode}
          onSelectionModeChange={setMode}
          onFit={() => {}}
          onAddPrimitive={() => {}}
          onImportFiles={() => {}}
          onAddSketch={() => {}}
        />
      </div>
    )
  },
}

export const FaceSelectionMode: Story = {
  render: () => {
    const [tool, setTool] = useState<TransformTool>('select')
    const [mode, setMode] = useState<SelectionMode>('face')

    return (
      <div className="w-full bg-surface-1 rounded-card border border-border p-1">
        <Toolbar
          tool={tool}
          onToolChange={setTool}
          snap={false}
          onSnapChange={() => {}}
          projection="persp"
          onProjectionChange={() => {}}
          selectionMode={mode}
          onSelectionModeChange={setMode}
          onFit={() => {}}
          onAddPrimitive={() => {}}
          onImportFiles={() => {}}
          onAddSketch={() => {}}
        />
      </div>
    )
  },
}
