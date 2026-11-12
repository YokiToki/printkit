import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ConstraintPanel } from './ConstraintPanel'
import { createSketch, addLine, type Constraint } from '../../../editor/sketch/model'

const meta: Meta<typeof ConstraintPanel> = {
  title: 'Editor/ConstraintPanel',
  component: ConstraintPanel,
}

export default meta
type Story = StoryObj<typeof ConstraintPanel>

const createMockSketch = () => {
  const s0 = createSketch('Profile')
  const r1 = addLine(s0, { x: 0, y: 0 }, { x: 50, y: 0 })
  const r2 = addLine(r1.sketch, { x: 50, y: 0 }, { x: 50, y: 30 })
  const curveId = r1.curveId
  const constraints: Constraint[] = [
    { id: 'con-1', kind: 'distance', refs: [curveId], value: 50 },
    { id: 'con-2', kind: 'horizontal', refs: [curveId] },
  ]
  return {
    ...r2.sketch,
    constraints,
  }
}

export const Default: Story = {
  render: () => {
    const [sketch, setSketch] = useState(createMockSketch())
    const curveId = Object.keys(sketch.curves)[0] || 'c1'

    return (
      <div className="w-80 rounded-card border border-border bg-surface-1 p-3">
        <ConstraintPanel
          sketch={sketch}
          selectedCurveIds={[curveId]}
          selectedPointIds={[]}
          dof={3}
          onUpdateConstraint={(id, val) => {
            setSketch({
              ...sketch,
              constraints: sketch.constraints.map((c) =>
                c.id === id ? { ...c, value: val } : c,
              ),
            })
          }}
          onDeleteConstraint={(id) => {
            setSketch({
              ...sketch,
              constraints: sketch.constraints.filter((c) => c.id !== id),
            })
          }}
        />
      </div>
    )
  },
}

export const WithConflicts: Story = {
  render: () => {
    const sketch = createMockSketch()

    return (
      <div className="w-80 rounded-card border border-border bg-surface-1 p-3">
        <ConstraintPanel
          sketch={sketch}
          selectedCurveIds={[]}
          selectedPointIds={[]}
          conflicts={{
            constraints: [sketch.constraints[0].id],
            redundant: [],
          }}
          dof={0}
          onUpdateConstraint={() => {}}
          onDeleteConstraint={() => {}}
          onFixConflict={() => alert('Auto-fix conflict triggered')}
        />
      </div>
    )
  },
}
