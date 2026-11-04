import { useState, useRef, useMemo, useEffect, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconList,
  IconAdjustmentsHorizontal,
  IconChevronDown,
} from '@tabler/icons-react'
import { matrixOf, newName, type EditorObject, type PrimitiveShape } from '../../editor/scene'
import { dropToBed, centerOnBed } from '../../editor/transform'
import { PRIMITIVE_DESCRIPTORS } from '../../editor/primitives'
import { useScene } from '../../editor/sceneStore'
import { useEditorDispatch } from './useEditorDispatch'
import { meshHealth, type MeshHealth } from '../../editor/health'
import { openMeshStore, type MeshStore } from '../cutout/meshStore'
import { Viewport, type Matrix4Tuple, type ViewportSceneConfig } from '../viewport/Viewport'
import { MeasurementsBar } from '../viewport/MeasurementsBar'
import { ActivityLogPanel } from '../../app/ActivityLogPanel'
import { useEditorModel } from './useEditorModel'
import { Outliner } from './Outliner'
import { Properties } from './Properties'
import { Toolbar, EditorDropZone, type TransformTool } from './Toolbar'
import { useHotkeys, type HotkeyDef } from './useHotkeys'
import { loadEditorUi, saveEditorUi } from './editorUiStore'
import { importFiles } from './importFiles'
import { getModelClient } from '../../app/useModel'
import { EditorExportFooter } from './EditorExportFooter'
import { log } from '../../app/activityLog'
import type { MeshData } from '../../geometry/mesh'

export function EditorMode() {
  const { t } = useTranslation()
  const [persistedDoc, setPersistedDoc] = useScene()
  const { doc, dispatch, undo, redo, canUndo, canRedo } = useEditorDispatch(persistedDoc, setPersistedDoc)
  const { model, pending, partsById } = useEditorModel(doc)

  const meshesMap = useMemo(() => {
    const map: Record<string, MeshData> = {}
    for (const [id, part] of partsById.entries()) {
      map[id] = part.mesh
    }
    return map
  }, [partsById])

  const [selection, setSelection] = useState<string[]>([])
  const [tool, setTool] = useState<TransformTool>('select')
  const [snap, setSnap] = useState(true)
  const [snapStepMm, setSnapStepMm] = useState(5)
  const [snapStepDeg, setSnapStepDeg] = useState(15)
  const [projection, setProjection] = useState<'persp' | 'ortho'>('persp')

  // Desktop panel collapse state
  const [outlinerCollapsed, setOutlinerCollapsed] = useState(false)
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false)

  // Mobile drawer state: 'none' | 'outliner' | 'properties'
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'outliner' | 'properties'>('none')
  const [drawerTop, setDrawerTop] = useState(300)

  // Camera viewcube rotation
  const [cameraRotation, setCameraRotation] = useState<[number, number, number]>([0, 0, 0])
  const fitRef = useRef<() => void>(() => {})

  // Load saved UI settings
  useEffect(() => {
    const saved = loadEditorUi()
    setTool(saved.tool)
    setSnap(saved.snap)
    setSnapStepMm(saved.snapStepMm)
    setSnapStepDeg(saved.snapStepDeg)
    setProjection(saved.projection)
    setOutlinerCollapsed(!saved.outlinerOpen)
    setPropertiesCollapsed(!saved.propertiesOpen)
  }, [])

  // Save UI settings on change
  const handleToolChange = (newTool: TransformTool) => {
    setTool(newTool)
    saveEditorUi({ tool: newTool })
  }

  const handleSnapChange = (newSnap: boolean) => {
    setSnap(newSnap)
    saveEditorUi({ snap: newSnap })
  }

  const handleSnapStepChange = (mm: number, deg: number) => {
    setSnapStepMm(mm)
    setSnapStepDeg(deg)
    saveEditorUi({ snapStepMm: mm, snapStepDeg: deg })
  }

  const handleProjectionChange = (newProj: 'persp' | 'ortho') => {
    setProjection(newProj)
    saveEditorUi({ projection: newProj })
  }

  const toggleOutlinerCollapse = () => {
    setOutlinerCollapsed((prev) => {
      saveEditorUi({ outlinerOpen: prev })
      return !prev
    })
  }

  const togglePropertiesCollapse = () => {
    setPropertiesCollapsed((prev) => {
      saveEditorUi({ propertiesOpen: prev })
      return !prev
    })
  }

  // Pre-calculate mesh health for all mesh objects
  const [healthMap, setHealthMap] = useState<Map<string, MeshHealth>>(new Map())
  useEffect(() => {
    let cancelled = false
    const computeHealth = async () => {
      const store = await openMeshStore()
      const nextMap = new Map<string, MeshHealth>()
      for (const obj of doc.objects) {
        if (obj.source.kind === 'mesh') {
          const mesh = await store.load(obj.source.meshId)
          if (mesh && !cancelled) {
            nextMap.set(obj.id, meshHealth(mesh))
          }
        }
      }
      if (!cancelled) {
        setHealthMap(nextMap)
      }
    }
    computeHealth()
    return () => {
      cancelled = true
    }
  }, [doc.objects])

  // Import files handler
  const handleImportFiles = async (files: File[], unit: 'mm' | 'in') => {
    const store = await openMeshStore()
    const fileBuffers = await Promise.all(
      files.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() }))
    )
    const res = await importFiles(fileBuffers, {
      unit,
      store,
      existingNames: doc.objects.map((o) => o.name),
    })
    if (res.objects.length > 0) {
      log.info('editor', 'log.editor.imported', { count: res.objects.length, names: files.map((f) => f.name).join(', ') })
      dispatch(
        t('log.editor.imported', { count: res.objects.length, names: files.map((f) => f.name).join(', ') }),
        (prev) => ({
          ...prev,
          objects: [...prev.objects, ...res.objects],
        })
      )
      setSelection(res.objects.map((o) => o.id))
    }
  }

  // Add primitive handler
  const handleAddPrimitive = (shape: PrimitiveShape) => {
    const desc = PRIMITIVE_DESCRIPTORS[shape]
    const defaultParams: Record<string, number> = {}
    for (const p of desc.params) {
      defaultParams[p.key] = p.default
    }
    const name = newName(t(desc.labelKey), doc.objects.map((o) => o.name))
    const newObj: EditorObject = {
      id: crypto.randomUUID ? crypto.randomUUID() : `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      visible: true,
      locked: false,
      color: doc.objects.length % 7,
      source: {
        kind: 'primitive',
        shape,
        params: defaultParams,
      },
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    }
    log.info('editor', 'log.editor.added', { shape: t(desc.labelKey) })
    dispatch(t('log.editor.added', { shape: t(desc.labelKey) }), (prev) => ({
      ...prev,
      objects: [...prev.objects, newObj],
    }))
    setSelection([newObj.id])
  }

  // Object updates
  const handleUpdateObject = (id: string, patch: Partial<EditorObject>, mergeKey?: string) => {
    dispatch('Update', (prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }), mergeKey)
  }

  const handleUpdateTransform = (id: string, newTransform: EditorObject['transform'], mergeKey?: string) => {
    const obj = doc.objects.find((o) => o.id === id)
    if (obj) {
      log.info('editor', 'log.editor.transformed', { name: obj.name })
    }
    dispatch('Transform', (prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (o.id === id ? { ...o, transform: newTransform } : o)),
    }), mergeKey)
  }

  const handleUpdatePrimitiveParams = (id: string, params: Record<string, number>, mergeKey?: string) => {
    dispatch('Parameters', (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === id && o.source.kind === 'primitive'
          ? { ...o, source: { ...o.source, params } }
          : o
      ),
    }), mergeKey)
  }

  const handleDelete = (ids: string[]) => {
    if (!ids.length) return
    log.info('editor', 'log.editor.deleted', { count: ids.length })
    dispatch(t('log.editor.deleted', { count: ids.length }), (prev) => ({
      ...prev,
      objects: prev.objects.filter((o) => !ids.includes(o.id)),
    }))
    setSelection((sel) => sel.filter((id) => !ids.includes(id)))
  }

  const handleDuplicate = (id: string) => {
    const orig = doc.objects.find((o) => o.id === id)
    if (!orig) return
    const dup: EditorObject = {
      ...orig,
      id: crypto.randomUUID ? crypto.randomUUID() : `obj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName(orig.name, doc.objects.map((o) => o.name)),
      transform: {
        ...orig.transform,
        position: [orig.transform.position[0] + 10, orig.transform.position[1] + 10, orig.transform.position[2]],
      },
    }
    log.info('editor', 'log.editor.duplicated', { name: orig.name })
    dispatch(t('log.editor.duplicated', { name: orig.name }), (prev) => ({
      ...prev,
      objects: [...prev.objects, dup],
    }))
    setSelection([dup.id])
  }

  const handleToggleVisible = (id: string) => {
    handleUpdateObject(id, { visible: !doc.objects.find((o) => o.id === id)?.visible })
  }

  const handleToggleLocked = (id: string) => {
    handleUpdateObject(id, { locked: !doc.objects.find((o) => o.id === id)?.locked })
  }

  const handleDropToBed = (ids: string[]) => {
    dispatch(t('editor.properties.dropToBed'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (ids.includes(o.id) ? dropToBed(o) : o)),
    }))
  }

  const handleCenterOnBed = (ids: string[]) => {
    dispatch(t('editor.properties.centerOnBed'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) => (ids.includes(o.id) ? centerOnBed(o) : o)),
    }))
  }

  // Hotkey commands
  const hotkeyCommands: HotkeyDef[] = useMemo(
    () => [
      {
        id: 'delete',
        key: 'Delete',
        labelKey: 'editor.outliner.delete',
        action: () => {
          if (selection.length > 0) handleDelete(selection)
        },
      },
      {
        id: 'backspace',
        key: 'Backspace',
        labelKey: 'editor.outliner.delete',
        action: () => {
          if (selection.length > 0) handleDelete(selection)
        },
      },
      {
        id: 'duplicate',
        key: 'd',
        ctrl: true,
        labelKey: 'editor.outliner.duplicate',
        action: () => {
          if (selection.length === 1) handleDuplicate(selection[0])
        },
      },
      {
        id: 'undo',
        key: 'z',
        ctrl: true,
        labelKey: 'common.reset',
        action: () => {
          if (canUndo) undo()
        },
      },
      {
        id: 'redo-shift',
        key: 'z',
        ctrl: true,
        shift: true,
        labelKey: 'common.reset',
        action: () => {
          if (canRedo) redo()
        },
      },
      {
        id: 'redo-y',
        key: 'y',
        ctrl: true,
        labelKey: 'common.reset',
        action: () => {
          if (canRedo) redo()
        },
      },
      {
        id: 'select-all',
        key: 'a',
        ctrl: true,
        labelKey: 'editor.toolbar.select',
        action: () => setSelection(doc.objects.map((o) => o.id)),
      },
      {
        id: 'deselect',
        key: 'Escape',
        labelKey: 'editor.toolbar.select',
        action: () => setSelection([]),
      },
      {
        id: 'move',
        key: 'g',
        labelKey: 'editor.toolbar.move',
        action: () => handleToolChange('translate'),
      },
      {
        id: 'rotate',
        key: 'r',
        labelKey: 'editor.toolbar.rotate',
        action: () => handleToolChange('rotate'),
      },
      {
        id: 'scale',
        key: 's',
        labelKey: 'editor.toolbar.scale',
        action: () => handleToolChange('scale'),
      },
      {
        id: 'fit-selection',
        key: 'f',
        labelKey: 'editor.view.fitSelection',
        action: () => fitRef.current(),
      },
      {
        id: 'fit-all',
        key: 'f',
        shift: true,
        labelKey: 'editor.view.fitAll',
        action: () => fitRef.current(),
      },
      {
        id: 'toggle-projection',
        key: '5',
        labelKey: 'editor.toolbar.perspective',
        action: () => handleProjectionChange(projection === 'persp' ? 'ortho' : 'persp'),
      },
      {
        id: 'hide',
        key: 'h',
        labelKey: 'editor.outliner.hide',
        action: () => {
          for (const id of selection) handleUpdateObject(id, { visible: false })
        },
      },
      {
        id: 'show-all',
        key: 'h',
        alt: true,
        labelKey: 'editor.outliner.showAll',
        action: () => {
          for (const obj of doc.objects) handleUpdateObject(obj.id, { visible: true })
        },
      },
      {
        id: 'drop-bed',
        key: 'd',
        labelKey: 'editor.properties.dropToBed',
        action: () => {
          if (selection.length > 0) handleDropToBed(selection)
        },
      },
    ],
    [selection, doc.objects, undo, redo, canUndo, canRedo, projection]
  )

  useHotkeys(hotkeyCommands)

  // Viewport scene descriptor
  const viewportScene = useMemo((): ViewportSceneConfig => {
    const matrices: Record<string, Matrix4Tuple> = {}
    for (const obj of doc.objects) {
      matrices[obj.id] = matrixOf(obj.transform)
    }

    return {
      matrices,
      selection,
      locked: doc.objects.filter((o) => o.locked).map((o) => o.id),
      hidden: doc.objects.filter((o) => !o.visible).map((o) => o.id),
      gizmo:
        tool === 'select'
          ? undefined
          : {
              mode: tool,
              space: 'local' as const,
              snap: snap ? { grid: snapStepMm, angle: snapStepDeg } : undefined,
            },
      projection,
    }
  }, [doc.objects, selection, tool, snap, snapStepMm, snapStepDeg, projection])

  // Viewport picking & gizmo callbacks
  const handlePick = (label: string | null, additive: boolean) => {
    if (!label) {
      if (!additive) setSelection([])
      return
    }
    if (additive) {
      setSelection((prev) => (prev.includes(label) ? prev.filter((id) => id !== label) : [...prev, label]))
    } else {
      setSelection([label])
    }
  }

  const handleBoxSelect = (labels: string[]) => {
    setSelection(labels)
  }

  const draftMatricesRef = useRef<Record<string, Matrix4Tuple> | null>(null)
  const handleGizmoChange = (newMatrices: Record<string, Matrix4Tuple>) => {
    draftMatricesRef.current = newMatrices
  }

  const handleGizmoCommit = () => {
    const drafts = draftMatricesRef.current
    if (!drafts) return
    draftMatricesRef.current = null
    dispatch('Transform', (prev) => ({
      ...prev,
      objects: prev.objects.map((obj) => {
        const m = drafts[obj.id]
        if (!m) return obj
        return {
          ...obj,
          transform: {
            ...obj.transform,
            position: [m[12], m[13], m[14]],
          },
        }
      }),
    }))
  }

  // Mobile drawer drag handlers
  const dragRef = useRef<{ y: number; top: number; moved: boolean } | null>(null)
  const onDrawerPointerDown = (e: PointerEvent) => {
    dragRef.current = { y: e.clientY, top: drawerTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDrawerPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return
    const dy = e.clientY - dragRef.current.y
    if (Math.abs(dy) > 3) dragRef.current.moved = true
    setDrawerTop(Math.min(window.innerHeight - 140, Math.max(120, dragRef.current.top + dy)))
  }
  const onDrawerPointerUp = () => {
    if (dragRef.current && !dragRef.current.moved) {
      setDrawerTop((v) => (v > window.innerHeight - 200 ? 300 : window.innerHeight - 140))
    }
    dragRef.current = null
  }

  return (
    <div data-testid="editor-mode" className="flex flex-col flex-1 min-h-0 w-full h-full bg-bg">
      {/* Top Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={handleToolChange}
        snap={snap}
        onSnapChange={handleSnapChange}
        snapStepMm={snapStepMm}
        snapStepDeg={snapStepDeg}
        onSnapStepChange={handleSnapStepChange}
        projection={projection}
        onProjectionChange={handleProjectionChange}
        onFit={() => fitRef.current()}
        onAddPrimitive={handleAddPrimitive}
        onImportFiles={handleImportFiles}
      />

      {/* Main Workspace Area */}
      <div className="relative flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left: Outliner (desktop collapsible) */}
        <aside
          data-testid="editor-outliner-panel"
          className={`hidden md:flex flex-col flex-none border-r border-border bg-surface-1 transition-[width] duration-150 ${
            outlinerCollapsed ? 'w-0 overflow-hidden border-none' : 'w-60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-semibold text-xs text-text">{t('editor.outliner.title')}</span>
            <button
              type="button"
              data-testid="outliner-collapse-btn"
              title={t('common.collapse')}
              onClick={toggleOutlinerCollapse}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:text-text cursor-pointer"
            >
              <IconLayoutSidebarLeftCollapse size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Outliner
              objects={doc.objects}
              selection={selection}
              onSelect={setSelection}
              onToggleVisible={handleToggleVisible}
              onToggleLock={handleToggleLocked}
              onRename={(id, name) => handleUpdateObject(id, { name })}
              onDuplicate={handleDuplicate}
              onDelete={(ids) => handleDelete(ids)}
              onIsolate={(id) =>
                dispatch('Isolate', (prev) => ({
                  ...prev,
                  objects: prev.objects.map((o) => ({ ...o, visible: o.id === id })),
                }))
              }
              onShowAll={() =>
                dispatch('Show all', (prev) => ({
                  ...prev,
                  objects: prev.objects.map((o) => ({ ...o, visible: true })),
                }))
              }
              healthMap={healthMap}
            />
          </div>
        </aside>

        {/* Center: Viewport + DropZone */}
        <main className="relative flex flex-1 min-w-0 h-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#1a2029_0%,#0b0d10_75%)]">
          {/* Outliner expand button on desktop when collapsed */}
          {outlinerCollapsed && (
            <button
              type="button"
              data-testid="outliner-expand-btn"
              title={t('common.expand')}
              onClick={toggleOutlinerCollapse}
              className="absolute top-3 left-3 z-20 hidden md:inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-1/90 text-text-muted hover:text-text shadow-sm cursor-pointer"
            >
              <IconLayoutSidebarLeftExpand size={16} />
            </button>
          )}

          {/* Properties expand button on desktop when collapsed */}
          {propertiesCollapsed && (
            <button
              type="button"
              data-testid="properties-expand-btn"
              title={t('common.expand')}
              onClick={togglePropertiesCollapse}
              className="absolute top-3 right-3 z-20 hidden md:inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface-1/90 text-text-muted hover:text-text shadow-sm cursor-pointer"
            >
              <IconLayoutSidebarRightExpand size={16} />
            </button>
          )}

          {/* Viewport wrapped with file drop zone */}
          <EditorDropZone onDropFiles={(files) => handleImportFiles(files, 'mm')}>
            <Viewport
              model={model}
              scene={viewportScene}
              onPick={handlePick}
              onBoxSelect={handleBoxSelect}
              onGizmoChange={handleGizmoChange}
              onGizmoCommit={handleGizmoCommit}
              onCameraChange={setCameraRotation}
              onFitReady={(fit) => {
                fitRef.current = fit
              }}
            />
          </EditorDropZone>

          {/* Measurements and status */}
          <MeasurementsBar model={model} />
          <ActivityLogPanel />
        </main>

        {/* Right: Properties (desktop collapsible) */}
        <aside
          data-testid="editor-properties-panel"
          className={`hidden md:flex flex-col flex-none border-l border-border bg-surface-1 transition-[width] duration-150 ${
            propertiesCollapsed ? 'w-0 overflow-hidden border-none' : 'w-[300px]'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-semibold text-xs text-text">{t('editor.properties.transform')}</span>
            <button
              type="button"
              data-testid="properties-collapse-btn"
              title={t('common.collapse')}
              onClick={togglePropertiesCollapse}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:text-text cursor-pointer"
            >
              <IconLayoutSidebarRightCollapse size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Properties
              objects={doc.objects}
              selection={selection}
              onUpdateObject={handleUpdateObject}
              onUpdateTransform={handleUpdateTransform}
              onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
              healthMap={healthMap}
            />
          </div>
          <EditorExportFooter
            doc={doc}
            selection={selection}
            meshes={meshesMap}
            healthMap={healthMap}
            busy={pending}
          />
        </aside>

        {/* Mobile bottom drawer buttons (below 768px) */}
        <div
          data-testid="mobile-drawer-bar"
          className="md:hidden absolute bottom-11 inset-x-0 z-20 flex justify-center gap-2 pointer-events-none"
        >
          <button
            type="button"
            data-testid="mobile-outliner-btn"
            onClick={() => setMobileDrawer((cur) => (cur === 'outliner' ? 'none' : 'outliner'))}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-1/95 px-4 text-xs font-medium text-text shadow-float cursor-pointer backdrop-blur-xs"
          >
            <IconList size={16} />
            <span>{t('editor.outliner.title')} ({doc.objects.length})</span>
          </button>
          <button
            type="button"
            data-testid="mobile-properties-btn"
            onClick={() => setMobileDrawer((cur) => (cur === 'properties' ? 'none' : 'properties'))}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-1/95 px-4 text-xs font-medium text-text shadow-float cursor-pointer backdrop-blur-xs"
          >
            <IconAdjustmentsHorizontal size={16} />
            <span>{t('editor.properties.transform')}</span>
          </button>
        </div>

        {/* Mobile bottom drawer */}
        {mobileDrawer !== 'none' && (
          <aside
            data-testid="mobile-drawer"
            style={{ '--dt': `${drawerTop}px` } as React.CSSProperties}
            className="md:hidden absolute top-(--dt) inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border border-b-0 border-border-strong bg-surface-1 shadow-float"
          >
            {/* Drawer handle */}
            <button
              type="button"
              aria-label={t('shell.dragDrawer')}
              onPointerDown={onDrawerPointerDown}
              onPointerMove={onDrawerPointerMove}
              onPointerUp={onDrawerPointerUp}
              className="flex h-7 flex-none cursor-grab touch-none items-center justify-center border-0 bg-transparent"
            >
              <span className="h-1 w-10 rounded-full bg-border-strong" />
            </button>

            <div className="flex flex-none items-center justify-between pr-2 pb-2 pl-4 border-b border-border">
              <b className="text-[14px]">
                {mobileDrawer === 'outliner' ? t('editor.outliner.title') : t('editor.properties.transform')}
              </b>
              <button
                type="button"
                data-testid="mobile-drawer-close"
                aria-label={t('shell.collapseDrawer')}
                onClick={() => setMobileDrawer('none')}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted"
              >
                <IconChevronDown size={18} stroke={1.75} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {mobileDrawer === 'outliner' ? (
                <Outliner
                  objects={doc.objects}
                  selection={selection}
                  onSelect={setSelection}
                  onToggleVisible={handleToggleVisible}
                  onToggleLock={handleToggleLocked}
                  onRename={(id, name) => handleUpdateObject(id, { name })}
                  onDuplicate={handleDuplicate}
                  onDelete={(ids) => handleDelete(ids)}
                  onIsolate={(id) =>
                    dispatch('Isolate', (prev) => ({
                      ...prev,
                      objects: prev.objects.map((o) => ({ ...o, visible: o.id === id })),
                    }))
                  }
                  onShowAll={() =>
                    dispatch('Show all', (prev) => ({
                      ...prev,
                      objects: prev.objects.map((o) => ({ ...o, visible: true })),
                    }))
                  }
                  healthMap={healthMap}
                />
              ) : (
                <>
                  <Properties
                    objects={doc.objects}
                    selection={selection}
                    onUpdateObject={handleUpdateObject}
                    onUpdateTransform={handleUpdateTransform}
                    onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
                    healthMap={healthMap}
                  />
                  <div className="mt-4">
                    <EditorExportFooter
                      doc={doc}
                      selection={selection}
                      meshes={meshesMap}
                      healthMap={healthMap}
                      busy={pending}
                    />
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
