import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle } from '@tabler/icons-react'
import { log } from '../../app/activityLog'
import type { MeshHealth } from '../../editor/health'
import type { SceneDoc } from '../../editor/scene'
import type { MeshData } from '../../geometry/mesh'
import type { ModelResult } from '../../geometry/model'
import { ExportPanel } from '../export/ExportPanel'
import { editorParts } from './editorParts'

export interface EditorExportFooterProps {
  doc: SceneDoc
  selection: string[]
  meshes: Map<string, MeshData> | Record<string, MeshData>
  healthMap: Map<string, MeshHealth> | Record<string, MeshHealth>
  busy: boolean
}

/**
 * Закреплённый блок экспорта редактора: выбор «Только выделение»,
 * предупреждения о незамкнутых сетках и объектах ниже стола, и панель ExportPanel.
 */
export function EditorExportFooter({
  doc,
  selection,
  meshes,
  healthMap,
  busy,
}: EditorExportFooterProps) {
  const { t } = useTranslation()
  const [selectionOnly, setSelectionOnly] = useState(false)

  const parts = useMemo(
    () => editorParts(doc, meshes, { selectionOnly, selection }),
    [doc, meshes, selectionOnly, selection]
  )

  const exportModel: ModelResult | null = useMemo(
    () => (parts.length > 0 ? { parts } : null),
    [parts]
  )

  const hasBelowBed = useMemo(
    () => parts.some((p) => p.mesh.min[2] < -0.001),
    [parts]
  )

  const openMeshObjects = useMemo(() => {
    const exportedIds = selectionOnly
      ? selection
      : doc.objects.filter((o) => o.visible !== false).map((o) => o.id)
    const getHealth = (id: string): MeshHealth | undefined =>
      healthMap instanceof Map ? healthMap.get(id) : healthMap[id]

    return doc.objects.filter((o) => {
      if (!exportedIds.includes(o.id)) return false
      const h = getHealth(o.id)
      return h && !h.closed
    })
  }, [doc.objects, selectionOnly, selection, healthMap])

  const hasOpenMesh = openMeshObjects.length > 0

  useEffect(() => {
    if (hasOpenMesh) {
      for (const o of openMeshObjects) {
        log.warn('export', 'log.editor.openMesh', { name: o.name })
      }
    }
  }, [hasOpenMesh, openMeshObjects])

  return (
    <div data-testid="editor-export-footer" className="flex flex-col gap-2 border-t border-border p-3 bg-surface-1">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="export-selection-only-toggle"
            checked={selectionOnly}
            onChange={(e) => setSelectionOnly(e.target.checked)}
            className="rounded border-border cursor-pointer"
          />
          <span>{t('editor.export.selectionOnly')}</span>
        </label>
      </div>

      {hasBelowBed && (
        <div data-testid="export-below-bed-warning" className="flex items-center gap-1.5 text-xs text-warn-text" role="alert">
          <IconAlertTriangle size={14} className="flex-none" />
          <span>{t('editor.export.belowBedWarning')}</span>
        </div>
      )}

      {hasOpenMesh && (
        <div data-testid="export-open-mesh-warning" className="flex items-center gap-1.5 text-xs text-warn-text" role="alert">
          <IconAlertTriangle size={14} className="flex-none" />
          <span>{t('editor.export.openMeshWarning')}</span>
        </div>
      )}

      <ExportPanel
        model={exportModel}
        busy={busy}
        name="scene"
        onExport={(name) => {
          log.info('editor', 'log.editor.exported', { name })
          if (hasOpenMesh) {
            for (const o of openMeshObjects) {
              log.warn('editor', 'log.editor.openMesh', { name: o.name })
            }
          }
        }}
      />
    </div>
  )
}
