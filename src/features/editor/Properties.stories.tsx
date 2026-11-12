import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Properties } from './Properties'
import type { EditorObject } from '../../editor/scene'
import type { MeshHealth } from '../../editor/health'

const meta: Meta<typeof Properties> = {
  title: 'Editor/Properties',
  component: Properties,
}

export default meta
type Story = StoryObj<typeof Properties>

const PRIMITIVE_BOX: EditorObject = {
  id: 'box-1',
  name: 'Parametric Box',
  visible: true,
  locked: false,
  color: 0,
  source: {
    kind: 'primitive',
    shape: 'box',
    params: { width: 42, length: 42, height: 28 },
  },
  transform: {
    position: [0, 0, 14],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
}

export const BoxPrimitive: Story = {
  render: () => {
    const [obj, setObj] = useState(PRIMITIVE_BOX)

    return (
      <div className="w-80 rounded-card border border-border bg-surface-1">
        <Properties
          objects={[obj]}
          selection={[obj.id]}
          onUpdateObject={(_id, patch) => setObj({ ...obj, ...patch })}
          onUpdateTransform={(_id, transform) => setObj({ ...obj, transform })}
          onUpdatePrimitiveParams={(_id, params) => {
            if (obj.source.kind === 'primitive') {
              setObj({
                ...obj,
                source: { ...obj.source, params: { ...obj.source.params, ...params } },
              })
            }
          }}
        />
      </div>
    )
  },
}

export const MeshWithHealthDiagnostics: Story = {
  render: () => {
    const meshObj: EditorObject = {
      id: 'mesh-1',
      name: 'Scan_Part.stl',
      visible: true,
      locked: false,
      color: 3,
      source: { kind: 'mesh', meshId: 'm1', unit: 'mm' },
      transform: { position: [10, 20, 0], rotation: [0, 0, 90], scale: [1, 1, 1] },
    }
    const healthMap = new Map<string, MeshHealth>()
    healthMap.set('mesh-1', {
      triangles: 8432,
      openEdges: 12,
      nonManifoldEdges: 4,
      degenerate: 2,
      volume: 45000,
      closed: false,
    })

    return (
      <div className="w-80 rounded-card border border-border bg-surface-1">
        <Properties
          objects={[meshObj]}
          selection={[meshObj.id]}
          healthMap={healthMap}
          onUpdateObject={() => {}}
          onUpdateTransform={() => {}}
          onUpdatePrimitiveParams={() => {}}
        />
      </div>
    )
  },
}
