// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { createEmptyScene, type EditorObject } from '../../editor/scene'
import type { MeshHealth } from '../../editor/health'
import type { MeshData } from '../../geometry/mesh'
import { EditorExportFooter } from './EditorExportFooter'

function createBoxMesh(minZ = 0): MeshData {
  return {
    vertProperties: new Float32Array([
      -5, -5, minZ,
      5, -5, minZ,
      5, 5, minZ,
      -5, 5, minZ,
      -5, -5, minZ + 10,
      5, -5, minZ + 10,
      5, 5, minZ + 10,
      -5, 5, minZ + 10,
    ]),
    triVerts: new Uint32Array([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
      1, 2, 6, 1, 6, 5,
    ]),
    numProp: 3,
    min: [-5, -5, minZ],
    max: [5, 5, minZ + 10],
    volume: 1000,
  }
}

describe('EditorExportFooter', () => {
  const o1: EditorObject = {
    id: 'o1',
    name: 'Object 1',
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'primitive', shape: 'box', params: {} },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }
  const o2: EditorObject = {
    id: 'o2',
    name: 'Object 2',
    visible: true,
    locked: false,
    color: 1,
    source: { kind: 'primitive', shape: 'box', params: {} },
    transform: { position: [0, 0, -5], rotation: [0, 0, 0], scale: [1, 1, 1] }, // below bed
  }

  const normalHealth: MeshHealth = {
    triangles: 12,
    openEdges: 0,
    nonManifoldEdges: 0,
    degenerate: 0,
    volume: 1000,
    closed: true,
  }

  const openHealth: MeshHealth = {
    triangles: 1,
    openEdges: 3,
    nonManifoldEdges: 0,
    degenerate: 0,
    volume: 0,
    closed: false,
  }

  it('renders selection-only toggle and updates parts accordingly', () => {
    const doc = { ...createEmptyScene(), objects: [o1, o2] }
    const meshes = { o1: createBoxMesh(0), o2: createBoxMesh(0) }
    const healthMap = { o1: normalHealth, o2: normalHealth }

    render(
      <I18nextProvider i18n={i18n}>
        <EditorExportFooter
          doc={doc}
          selection={['o1']}
          meshes={meshes}
          healthMap={healthMap}
          busy={false}
        />
      </I18nextProvider>
    )

    const toggle = screen.getByTestId('export-selection-only-toggle') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)
  })

  it('shows below-bed warning when a part sits below z = 0', () => {
    const doc = { ...createEmptyScene(), objects: [o2] }
    const meshes = { o2: createBoxMesh(-5) }
    const healthMap = { o2: normalHealth }

    render(
      <I18nextProvider i18n={i18n}>
        <EditorExportFooter
          doc={doc}
          selection={[]}
          meshes={meshes}
          healthMap={healthMap}
          busy={false}
        />
      </I18nextProvider>
    )

    expect(screen.getByTestId('export-below-bed-warning')).toBeDefined()
  })

  it('shows open-mesh warning when an exported part is an open mesh', () => {
    const doc = { ...createEmptyScene(), objects: [o1] }
    const meshes = { o1: createBoxMesh(0) }
    const healthMap = { o1: openHealth }

    render(
      <I18nextProvider i18n={i18n}>
        <EditorExportFooter
          doc={doc}
          selection={[]}
          meshes={meshes}
          healthMap={healthMap}
          busy={false}
        />
      </I18nextProvider>
    )

    expect(screen.getByTestId('export-open-mesh-warning')).toBeDefined()
  })
})
