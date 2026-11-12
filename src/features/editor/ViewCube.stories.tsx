import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ViewCube } from './ViewCube'
import type { ViewFace } from './viewCommands'

const meta: Meta<typeof ViewCube> = {
  title: 'Editor/ViewCube',
  component: ViewCube,
}

export default meta
type Story = StoryObj<typeof ViewCube>

export const Default: Story = {
  render: () => {
    const [rot, setRot] = useState<[number, number, number]>([-25, 45, 0])
    const [selectedFace, setSelectedFace] = useState<ViewFace | null>(null)

    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="h-28 w-28">
          <ViewCube
            rotation={rot}
            onSelectFace={(f) => {
              setSelectedFace(f)
              if (f === 'top') setRot([-90, 0, 0])
              else if (f === 'front') setRot([0, 0, 0])
              else if (f === 'right') setRot([0, -90, 0])
              else if (f === 'bottom') setRot([90, 0, 0])
              else if (f === 'back') setRot([0, 180, 0])
              else if (f === 'left') setRot([0, 90, 0])
            }}
            onOrbit={(dx, dy) => {
              setRot(([p, y, r]) => [p + dy * 0.5, y + dx * 0.5, r])
            }}
          />
        </div>
        <div className="text-xs text-text-muted">
          Active Face: <span className="font-mono text-accent">{selectedFace ?? 'Isometric'}</span>
        </div>
      </div>
    )
  },
}
