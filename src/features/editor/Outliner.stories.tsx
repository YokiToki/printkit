import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Outliner } from './Outliner'
import type { EditorObject } from '../../editor/scene'
import type { MeshHealth } from '../../editor/health'

const meta: Meta<typeof Outliner> = {
  title: 'Editor/Outliner',
  component: Outliner,
}

export default meta
type Story = StoryObj<typeof Outliner>

const MOCK_OBJECTS: EditorObject[] = [
  {
    id: 'obj-1',
    name: 'Bin Body',
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'primitive', shape: 'box', params: { width: 42, length: 42, height: 50 } },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  },
  {
    id: 'obj-2',
    name: 'Lip Cutout',
    visible: true,
    locked: false,
    color: 1,
    source: { kind: 'primitive', shape: 'cylinder', params: { radius: 15, height: 10 } },
    transform: { position: [0, 0, 20], rotation: [0, 0, 0], scale: [1, 1, 1] },
  },
  {
    id: 'obj-3',
    name: 'Imported Base (Reference)',
    visible: false,
    locked: true,
    color: 2,
    source: { kind: 'mesh', meshId: 'mesh-123', unit: 'mm' },
    transform: { position: [10, 0, 0], rotation: [0, 0, 45], scale: [1, 1, 1] },
  },
]

export const Default: Story = {
  render: () => {
    const [objects, setObjects] = useState(MOCK_OBJECTS)
    const [selection, setSelection] = useState<string[]>(['obj-1'])

    return (
      <div className="w-72 rounded-card border border-border bg-surface-1">
        <Outliner
          objects={objects}
          selection={selection}
          onSelect={setSelection}
          onToggleVisible={(id) => {
            setObjects(objects.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)))
          }}
          onToggleLock={(id) => {
            setObjects(objects.map((o) => (o.id === id ? { ...o, locked: !o.locked } : o)))
          }}
          onRename={(id, name) => {
            setObjects(objects.map((o) => (o.id === id ? { ...o, name } : o)))
          }}
          onDuplicate={(id) => {
            const target = objects.find((o) => o.id === id)
            if (target) {
              setObjects([...objects, { ...target, id: `obj-${Date.now()}`, name: `${target.name} (Copy)` }])
            }
          }}
          onDelete={(ids) => {
            setObjects(objects.filter((o) => !ids.includes(o.id)))
            setSelection([])
          }}
          onIsolate={(id) => {
            setObjects(objects.map((o) => ({ ...o, visible: o.id === id })))
          }}
          onShowAll={() => {
            setObjects(objects.map((o) => ({ ...o, visible: true })))
          }}
        />
      </div>
    )
  },
}

export const WithHealthIssues: Story = {
  render: () => {
    const [selection, setSelection] = useState<string[]>(['obj-3'])
    const healthMap = new Map<string, MeshHealth>()
    healthMap.set('obj-3', {
      triangles: 1420,
      openEdges: 4,
      nonManifoldEdges: 2,
      degenerate: 1,
      volume: 1250,
      closed: false,
    })

    return (
      <div className="w-72 rounded-card border border-border bg-surface-1">
        <Outliner
          objects={MOCK_OBJECTS}
          selection={selection}
          healthMap={healthMap}
          onSelect={setSelection}
          onToggleVisible={() => {}}
          onToggleLock={() => {}}
          onRename={() => {}}
          onDuplicate={() => {}}
          onDelete={() => {}}
          onIsolate={() => {}}
          onShowAll={() => {}}
        />
      </div>
    )
  },
}
