import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { SketchToolbar } from './SketchToolbar'
import type { SketchTool } from './toolStateMachine'

const meta: Meta<typeof SketchToolbar> = {
  title: 'Editor/SketchToolbar',
  component: SketchToolbar,
}

export default meta
type Story = StoryObj<typeof SketchToolbar>

export const Default: Story = {
  render: () => {
    const [tool, setTool] = useState<SketchTool>('select')
    const [construction, setConstruction] = useState(false)

    return (
      <div className="w-full bg-surface-1 rounded-card border border-border">
        <SketchToolbar
          tool={tool}
          onToolChange={setTool}
          construction={construction}
          onToggleConstruction={() => setConstruction(!construction)}
          onFinish={() => {}}
          sketchName="Base Profile"
          dof={2}
          hasConflict={false}
        />
      </div>
    )
  },
}

export const FullyConstrained: Story = {
  render: () => {
    const [tool, setTool] = useState<SketchTool>('select')

    return (
      <div className="w-full bg-surface-1 rounded-card border border-border">
        <SketchToolbar
          tool={tool}
          onToolChange={setTool}
          construction={false}
          onToggleConstruction={() => {}}
          onFinish={() => {}}
          sketchName="Mounting Holes"
          dof={0}
          hasConflict={false}
        />
      </div>
    )
  },
}

export const ConflictedState: Story = {
  render: () => {
    const [tool, setTool] = useState<SketchTool>('select')

    return (
      <div className="w-full bg-surface-1 rounded-card border border-border">
        <SketchToolbar
          tool={tool}
          onToolChange={setTool}
          construction={false}
          onToggleConstruction={() => {}}
          onFinish={() => {}}
          sketchName="Conflicted Arc"
          dof={0}
          hasConflict={true}
        />
      </div>
    )
  },
}
