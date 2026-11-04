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
import { SketchToolbar } from './sketch/SketchToolbar'
import { ConstraintPanel } from './sketch/ConstraintPanel'
import { FeatureDialog } from './sketch/FeatureDialog'
import { SvgImportDialog } from './sketch/SvgImportDialog'
import type { Feature } from '../../geometry/features/evaluate'
import {
  initialToolState,
  sketchToolReducer,
  type SketchTool,
  type ToolState,
} from './sketch/toolStateMachine'
import { dof as computeDof } from '../../editor/sketch/dof'
import {
  addSketchCommand,
  updateSketchInDoc,
  deleteSketchCommand,
  renameSketchCommand,
  toggleSketchVisibleCommand,
  updateDimensionCommand,
  deleteConstraintCommand,
  deleteSelectionCommand,
  dragPointCommand,
} from './sketch/sketchCommands'
import { newId, type PlaneDefinition, type Constraint, type Sketch } from '../../editor/sketch/model'
import type { ScreenPickResult } from '../viewport/sketchPicking'
import type { ViewportSketchConfig } from '../viewport/sketchMesh'
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

  // Sketch mode state
  const [activeSketchId, setActiveSketchId] = useState<string | null>(null)
  const activeSketch = useMemo(
    () => doc.sketches?.find((s) => s.id === activeSketchId),
    [doc.sketches, activeSketchId],
  )
  const [sketchToolState, setSketchToolState] = useState<ToolState>(initialToolState('select'))

  // Feature dialog state
  const [activeFeatureDialog, setActiveFeatureDialog] = useState<{
    kind: 'extrude' | 'revolve'
    targetObjectId?: string
    featureIndex?: number
  } | null>(null)

  // SVG import modal state
  const [svgImportState, setSvgImportState] = useState<{
    open: boolean
    file?: File | null
    svgText?: string | null
  }>({ open: false })

  const dofInfo = useMemo(() => {
    if (!activeSketch) return { dof: 0, conflicts: [], redundant: [], entityStatus: {} }
    const res = computeDof(activeSketch)
    return {
      dof: res.dof,
      conflicts: res.conflictingConstraints,
      redundant: res.redundantConstraints,
      entityStatus: { ...res.pointStatus, ...res.curveStatus },
    }
  }, [activeSketch])

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
            getModelClient().registerMesh(obj.source.meshId, mesh)
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

  const handleOpenFeatureDialog = (
    kind: 'extrude' | 'revolve',
    targetObjectId?: string,
    featureIndex?: number,
  ) => {
    setActiveFeatureDialog({ kind, targetObjectId, featureIndex })
  }

  const handleApplyFeature = (
    feature: Feature,
    targetObjectId?: string,
    featureIndex?: number,
  ) => {
    if (targetObjectId) {
      const targetObj = doc.objects.find((o) => o.id === targetObjectId)
      if (!targetObj) return

      let nextFeatures: Feature[] = []
      if (targetObj.source.kind === 'feature') {
        nextFeatures = [...targetObj.source.features]
        if (featureIndex !== undefined && featureIndex >= 0 && featureIndex < nextFeatures.length) {
          nextFeatures[featureIndex] = feature
        } else {
          nextFeatures.push(feature)
        }
      } else {
        nextFeatures = [feature]
      }

      dispatch(`Update ${feature.kind}`, (prev) => ({
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === targetObjectId
            ? { ...o, source: { kind: 'feature', features: nextFeatures } }
            : o,
        ),
      }))
    } else {
      const existingNames = doc.objects.map((o) => o.name)
      const label =
        feature.kind === 'extrude'
          ? t('sketch.feature.extrude', 'Extrude')
          : t('sketch.feature.revolve', 'Revolve')
      const name = newName(label, existingNames)
      const newObj: EditorObject = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `body-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        visible: true,
        locked: false,
        color: doc.objects.length % 7,
        source: {
          kind: 'feature',
          features: [feature],
        },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      }

      dispatch(`Add ${feature.kind}`, (prev) => ({
        ...prev,
        objects: [...prev.objects, newObj],
        sketches: prev.sketches?.map((s) =>
          s.id === feature.sketch ? { ...s, visible: false } : s,
        ),
      }))
      setSelection([newObj.id])
    }
    setActiveFeatureDialog(null)
  }

  const handleDeleteFeature = (objectId: string, featureIndex: number) => {
    const targetObj = doc.objects.find((o) => o.id === objectId)
    if (!targetObj || targetObj.source.kind !== 'feature') return

    const nextFeatures = targetObj.source.features.filter((_, idx) => idx !== featureIndex)
    if (nextFeatures.length === 0) {
      handleDelete([objectId])
    } else {
      dispatch('Delete Feature', (prev) => ({
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === objectId ? { ...o, source: { kind: 'feature', features: nextFeatures } } : o,
        ),
      }))
    }
  }

  const handleOpenSvgImport = (file?: File, svgText?: string) => {
    setSvgImportState({ open: true, file, svgText })
  }

  const handleSvgImport = (
    sketch: Sketch,
    isNew: boolean,
    meta: { name: string; size: number; curves: number }
  ) => {
    log.info('editor', 'log.editor.sketch.svgImported', {
      name: meta.name,
      size: meta.size,
      curves: meta.curves,
    })

    if (isNew) {
      dispatch('Import SVG', (prev) => ({
        ...prev,
        sketches: [...(prev.sketches ?? []), sketch],
      }))
      setActiveSketchId(sketch.id)
    } else {
      dispatch('Import SVG into Sketch', (prev) => ({
        ...prev,
        sketches: (prev.sketches ?? []).map((s) => (s.id === sketch.id ? sketch : s)),
      }))
    }
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

  // Sketch Viewport config
  const viewportSketch = useMemo((): ViewportSketchConfig | null => {
    if (!activeSketch) return null
    return {
      plane: activeSketch.plane,
      sketch: activeSketch,
      selection: {
        points: sketchToolState.selectedPointIds,
        curves: sketchToolState.selectedCurveIds,
      },
      preview: sketchToolState.preview,
      tool: sketchToolState.tool,
      dofStatus: {
        points: dofInfo.entityStatus,
        curves: dofInfo.entityStatus,
      },
      conflicts: {
        constraints: dofInfo.conflicts,
      },
    }
  }, [activeSketch, sketchToolState, dofInfo])

  // Sketch add handler
  const handleAddSketch = (plane: PlaneDefinition) => {
    const existingNames = (doc.sketches ?? []).map((s) => s.name)
    const name = newName(t('sketch.defaultName', 'Sketch'), existingNames)
    let newSketchId = ''
    dispatch('Add Sketch', (prev) => {
      const res = addSketchCommand(prev, name, plane)
      newSketchId = res.sketchId
      return res.doc
    })
    setActiveSketchId(newSketchId)
    setSketchToolState(initialToolState('select'))
  }

  // Sketch constraint addition
  const handleAddConstraint = (kind: Constraint['kind']) => {
    if (!activeSketch) return
    const pts = sketchToolState.selectedPointIds
    const crvs = sketchToolState.selectedCurveIds
    let refs: string[] = []
    let value: number | undefined = undefined

    if (kind === 'horizontal' || kind === 'vertical') {
      if (crvs.length === 1) refs = [crvs[0]]
      else if (pts.length === 2) refs = [pts[0], pts[1]]
    } else if (kind === 'coincident') {
      if (pts.length >= 2) refs = [pts[0], pts[1]]
      else if (pts.length === 1 && crvs.length === 1) refs = [pts[0], crvs[0]]
    } else if (kind === 'parallel' || kind === 'perpendicular' || kind === 'equal') {
      if (crvs.length === 2) refs = [crvs[0], crvs[1]]
    } else if (kind === 'tangent') {
      if (crvs.length === 2) refs = [crvs[0], crvs[1]]
    } else if (kind === 'distance') {
      if (pts.length === 2) {
        refs = [pts[0], pts[1]]
        const p1 = activeSketch.points[pts[0]]
        const p2 = activeSketch.points[pts[1]]
        if (p1 && p2) value = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      } else if (crvs.length === 1) {
        refs = [crvs[0]]
        const c = activeSketch.curves[crvs[0]]
        if (c && c.kind === 'line') {
          const p1 = activeSketch.points[c.a]
          const p2 = activeSketch.points[c.b]
          if (p1 && p2) value = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        }
      }
    } else if (kind === 'radius') {
      if (crvs.length === 1) {
        refs = [crvs[0]]
        const c = activeSketch.curves[crvs[0]]
        if (c && c.kind === 'circle') value = c.r
        else if (c && c.kind === 'arc') {
          const p1 = activeSketch.points[c.c]
          const p2 = activeSketch.points[c.a]
          if (p1 && p2) value = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        }
      }
    } else if (kind === 'fixed') {
      if (pts.length === 1) refs = [pts[0]]
    }

    if (refs.length > 0) {
      const newCon: Constraint = {
        id: newId('con'),
        kind,
        refs,
        value,
      }
      dispatch(`Add ${kind} constraint`, (prev) =>
        updateSketchInDoc(prev, activeSketch.id, (s) => ({
          ...s,
          constraints: [...s.constraints, newCon],
        })),
      )
    }
  }

  // Sketch pointer and select interactions
  const dragPointRef = useRef<string | null>(null)
  const handleSketchSelect = (hit: ScreenPickResult | null, additive: boolean) => {
    if (!hit) {
      if (!additive) {
        setSketchToolState((prev) => ({
          ...prev,
          selectedPointIds: [],
          selectedCurveIds: [],
        }))
      }
      return
    }
    if (hit.kind === 'point') {
      setSketchToolState((prev) => ({
        ...prev,
        selectedPointIds: additive
          ? prev.selectedPointIds.includes(hit.id)
            ? prev.selectedPointIds.filter((id) => id !== hit.id)
            : [...prev.selectedPointIds, hit.id]
          : [hit.id],
        selectedCurveIds: additive ? prev.selectedCurveIds : [],
      }))
    } else if (hit.kind === 'curve') {
      setSketchToolState((prev) => ({
        ...prev,
        selectedPointIds: additive ? prev.selectedPointIds : [],
        selectedCurveIds: additive
          ? prev.selectedCurveIds.includes(hit.id)
            ? prev.selectedCurveIds.filter((id) => id !== hit.id)
            : [...prev.selectedCurveIds, hit.id]
          : [hit.id],
      }))
    }
  }

  const handleSketchPointer = (
    kind: 'down' | 'move' | 'up' | 'click' | 'dblclick',
    pos: { x: number; y: number },
    mods: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean },
  ) => {
    if (!activeSketch) return
    if (kind === 'move' && sketchToolState.tool === 'select' && dragPointRef.current) {
      dispatch(
        'Drag Point',
        (prev) => dragPointCommand(prev, activeSketch.id, dragPointRef.current!, pos),
        'sketch-drag-point',
      )
      return
    }
    if (kind === 'up' && dragPointRef.current) {
      dragPointRef.current = null
      return
    }
    if (sketchToolState.tool === 'select' && kind === 'down') {
      for (const [pId, pt] of Object.entries(activeSketch.points)) {
        if (Math.hypot(pt.x - pos.x, pt.y - pos.y) < 2) {
          dragPointRef.current = pId
          break
        }
      }
    }

    const type = kind === 'down' ? 'down' : kind === 'move' ? 'move' : 'up'
    const res = sketchToolReducer(activeSketch, sketchToolState, {
      type,
      pos,
      shift: mods.shift,
      ctrl: mods.ctrl,
      alt: mods.alt,
    })
    setSketchToolState(res.state)
    if (res.sketch !== activeSketch) {
      dispatch(
        res.command?.label ?? 'Sketch Edit',
        (prev) => updateSketchInDoc(prev, activeSketch.id, () => res.sketch),
        res.command?.mergeKey,
      )
    }
  }

  // Sketch hotkeys
  const sketchHotkeyCommands: HotkeyDef[] = useMemo(
    () => [
      {
        id: 'sketch-select',
        key: 's',
        labelKey: 'editor.toolbar.select',
        action: () => setSketchToolState(initialToolState('select', sketchToolState.construction)),
      },
      {
        id: 'sketch-line',
        key: 'l',
        labelKey: 'sketch.tool.line',
        action: () => setSketchToolState(initialToolState('line', sketchToolState.construction)),
      },
      {
        id: 'sketch-rect',
        key: 'r',
        labelKey: 'sketch.tool.rect2pt',
        action: () => setSketchToolState(initialToolState('rect-2pt', sketchToolState.construction)),
      },
      {
        id: 'sketch-circle',
        key: 'c',
        labelKey: 'sketch.tool.circle',
        action: () => setSketchToolState(initialToolState('circle', sketchToolState.construction)),
      },
      {
        id: 'sketch-arc',
        key: 'a',
        labelKey: 'sketch.tool.arc3pt',
        action: () => setSketchToolState(initialToolState('arc-3pt', sketchToolState.construction)),
      },
      {
        id: 'sketch-toggle-construction',
        key: 'x',
        labelKey: 'sketch.toggleConstruction',
        action: () => {
          setSketchToolState((prev) => ({ ...prev, construction: !prev.construction }))
        },
      },
      {
        id: 'sketch-esc',
        key: 'Escape',
        labelKey: 'editor.toolbar.select',
        action: () => {
          if (sketchToolState.stage > 0) {
            setSketchToolState((prev) => ({
              ...prev,
              stage: 0,
              startPt: undefined,
              preview: undefined,
            }))
          } else if (
            sketchToolState.selectedPointIds.length > 0 ||
            sketchToolState.selectedCurveIds.length > 0
          ) {
            setSketchToolState((prev) => ({
              ...prev,
              selectedPointIds: [],
              selectedCurveIds: [],
            }))
          } else if (sketchToolState.tool !== 'select') {
            setSketchToolState(initialToolState('select', sketchToolState.construction))
          }
        },
      },
      {
        id: 'sketch-delete',
        key: 'Delete',
        labelKey: 'editor.outliner.delete',
        action: () => {
          if (
            activeSketch &&
            (sketchToolState.selectedPointIds.length > 0 || sketchToolState.selectedCurveIds.length > 0)
          ) {
            dispatch(
              'Delete Selection',
              (prev) =>
                deleteSelectionCommand(
                  prev,
                  activeSketch.id,
                  sketchToolState.selectedCurveIds,
                  sketchToolState.selectedPointIds,
                ),
            )
            setSketchToolState((prev) => ({
              ...prev,
              selectedPointIds: [],
              selectedCurveIds: [],
            }))
          }
        },
      },
      {
        id: 'sketch-backspace',
        key: 'Backspace',
        labelKey: 'editor.outliner.delete',
        action: () => {
          if (
            activeSketch &&
            (sketchToolState.selectedPointIds.length > 0 || sketchToolState.selectedCurveIds.length > 0)
          ) {
            dispatch(
              'Delete Selection',
              (prev) =>
                deleteSelectionCommand(
                  prev,
                  activeSketch.id,
                  sketchToolState.selectedCurveIds,
                  sketchToolState.selectedPointIds,
                ),
            )
            setSketchToolState((prev) => ({
              ...prev,
              selectedPointIds: [],
              selectedCurveIds: [],
            }))
          }
        },
      },
      {
        id: 'sketch-undo',
        key: 'z',
        ctrl: true,
        labelKey: 'common.reset',
        action: () => {
          if (canUndo) undo()
        },
      },
      {
        id: 'sketch-redo',
        key: 'z',
        ctrl: true,
        shift: true,
        labelKey: 'common.reset',
        action: () => {
          if (canRedo) redo()
        },
      },
    ],
    [activeSketch, sketchToolState, canUndo, canRedo, undo, redo, dispatch],
  )

  useHotkeys(activeSketch ? sketchHotkeyCommands : hotkeyCommands)

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
      {activeSketch ? (
        <SketchToolbar
          tool={sketchToolState.tool}
          onToolChange={(tool) => setSketchToolState(initialToolState(tool, sketchToolState.construction))}
          construction={sketchToolState.construction}
          onToggleConstruction={() =>
            setSketchToolState((prev) => ({ ...prev, construction: !prev.construction }))
          }
          onAddConstraint={handleAddConstraint}
          onImportSvg={() => handleOpenSvgImport()}
          onFinish={() => {
            setActiveSketchId(null)
          }}
          sketchName={activeSketch.name}
          dof={dofInfo.dof}
          hasConflict={dofInfo.conflicts.length > 0}
        />
      ) : (
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
          onAddSketch={handleAddSketch}
          onImportSvgClick={() => handleOpenSvgImport()}
          onImportSvgFile={(file) => handleOpenSvgImport(file)}
          hasSketches={(doc.sketches?.length ?? 0) > 0}
          onOpenFeatureDialog={(k) => handleOpenFeatureDialog(k)}
        />
      )}

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
              sketches={doc.sketches}
              activeSketchId={activeSketchId}
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
              onEditSketch={(id) => {
                setActiveSketchId(id)
                setSketchToolState(initialToolState('select'))
              }}
              onToggleSketchVisible={(id) =>
                dispatch('Toggle Sketch Visibility', (prev) => toggleSketchVisibleCommand(prev, id))
              }
              onRenameSketch={(id, name) =>
                dispatch('Rename Sketch', (prev) => renameSketchCommand(prev, id, name))
              }
              onDeleteSketch={(id) => {
                dispatch('Delete Sketch', (prev) => deleteSketchCommand(prev, id))
                if (activeSketchId === id) {
                  setActiveSketchId(null)
                }
              }}
              onEditFeature={(objId, fIdx) => {
                const obj = doc.objects.find((o) => o.id === objId)
                if (obj?.source.kind === 'feature') {
                  handleOpenFeatureDialog(obj.source.features[fIdx].kind, objId, fIdx)
                }
              }}
              onDeleteFeature={handleDeleteFeature}
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
          <EditorDropZone
            onDropFiles={(files) => handleImportFiles(files, 'mm')}
            onDropSvgFile={(file) => handleOpenSvgImport(file)}
          >
            <Viewport
              model={model}
              scene={viewportScene}
              sketch={viewportSketch}
              onPick={handlePick}
              onBoxSelect={handleBoxSelect}
              onGizmoChange={handleGizmoChange}
              onGizmoCommit={handleGizmoCommit}
              onCameraChange={setCameraRotation}
              onFitReady={(fit) => {
                fitRef.current = fit
              }}
              onSketchPointer={handleSketchPointer}
              onSketchSelect={handleSketchSelect}
              onUpdateConstraint={(id, val) => {
                if (activeSketchId) {
                  dispatch('Update Constraint', (prev) =>
                    updateDimensionCommand(prev, activeSketchId, id, val),
                  )
                }
              }}
              onDeleteConstraint={(id) => {
                if (activeSketchId) {
                  dispatch('Delete Constraint', (prev) =>
                    deleteConstraintCommand(prev, activeSketchId, id),
                  )
                }
              }}
            />
          </EditorDropZone>

          {/* Measurements and status */}
          <MeasurementsBar model={model} />
          <ActivityLogPanel />
        </main>

        {/* Right: Properties / Constraints (desktop collapsible) */}
        <aside
          data-testid="editor-properties-panel"
          className={`hidden md:flex flex-col flex-none border-l border-border bg-surface-1 transition-[width] duration-150 ${
            propertiesCollapsed ? 'w-0 overflow-hidden border-none' : 'w-[300px]'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-semibold text-xs text-text">
              {activeFeatureDialog
                ? activeFeatureDialog.kind === 'extrude'
                  ? t('sketch.feature.extrude', 'Extrude')
                  : t('sketch.feature.revolve', 'Revolve')
                : activeSketch
                  ? activeSketch.name
                  : t('editor.properties.transform')}
            </span>
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
            {activeFeatureDialog ? (
              <FeatureDialog
                kind={activeFeatureDialog.kind}
                sketches={doc.sketches ?? []}
                objects={doc.objects}
                targetObjectId={activeFeatureDialog.targetObjectId}
                featureIndex={activeFeatureDialog.featureIndex}
                initialFeature={
                  activeFeatureDialog.targetObjectId && activeFeatureDialog.featureIndex !== undefined
                    ? (
                        doc.objects.find((o) => o.id === activeFeatureDialog.targetObjectId)
                          ?.source as { kind: 'feature'; features: Feature[] }
                      )?.features?.[activeFeatureDialog.featureIndex]
                    : undefined
                }
                onApply={handleApplyFeature}
                onCancel={() => setActiveFeatureDialog(null)}
              />
            ) : activeSketch ? (
              <ConstraintPanel
                sketch={activeSketch}
                selectedCurveIds={sketchToolState.selectedCurveIds}
                selectedPointIds={sketchToolState.selectedPointIds}
                conflicts={{
                  constraints: dofInfo.conflicts,
                  redundant: dofInfo.redundant,
                }}
                onUpdateConstraint={(id, val) =>
                  dispatch('Update Constraint', (prev) =>
                    updateDimensionCommand(prev, activeSketch.id, id, val),
                  )
                }
                onDeleteConstraint={(id) =>
                  dispatch('Delete Constraint', (prev) =>
                    deleteConstraintCommand(prev, activeSketch.id, id),
                  )
                }
              />
            ) : (
              <Properties
                objects={doc.objects}
                selection={selection}
                onUpdateObject={handleUpdateObject}
                onUpdateTransform={handleUpdateTransform}
                onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
                onEditFeature={(objId, fIdx) => {
                  const obj = doc.objects.find((o) => o.id === objId)
                  if (obj?.source.kind === 'feature') {
                    handleOpenFeatureDialog(obj.source.features[fIdx].kind, objId, fIdx)
                  }
                }}
                onDeleteFeature={handleDeleteFeature}
                onAddFeature={(objId, kind) => handleOpenFeatureDialog(kind, objId)}
                healthMap={healthMap}
                meshes={meshesMap}
              />
            )}
          </div>
          {!activeSketch && !activeFeatureDialog && (
            <EditorExportFooter
              doc={doc}
              selection={selection}
              meshes={meshesMap}
              healthMap={healthMap}
              busy={pending}
            />
          )}
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
            <span>{activeSketch ? activeSketch.name : t('editor.properties.transform')}</span>
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
                {mobileDrawer === 'outliner'
                  ? t('editor.outliner.title')
                  : activeFeatureDialog
                    ? activeFeatureDialog.kind === 'extrude'
                      ? t('sketch.feature.extrude', 'Extrude')
                      : t('sketch.feature.revolve', 'Revolve')
                    : activeSketch
                      ? activeSketch.name
                      : t('editor.properties.transform')}
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
                  sketches={doc.sketches}
                  activeSketchId={activeSketchId}
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
                  onEditSketch={(id) => {
                    setActiveSketchId(id)
                    setSketchToolState(initialToolState('select'))
                  }}
                  onToggleSketchVisible={(id) =>
                    dispatch('Toggle Sketch Visibility', (prev) => toggleSketchVisibleCommand(prev, id))
                  }
                  onRenameSketch={(id, name) =>
                    dispatch('Rename Sketch', (prev) => renameSketchCommand(prev, id, name))
                  }
                  onDeleteSketch={(id) => {
                    dispatch('Delete Sketch', (prev) => deleteSketchCommand(prev, id))
                    if (activeSketchId === id) {
                      setActiveSketchId(null)
                    }
                  }}
                  onEditFeature={(objId, fIdx) => {
                    const obj = doc.objects.find((o) => o.id === objId)
                    if (obj?.source.kind === 'feature') {
                      handleOpenFeatureDialog(obj.source.features[fIdx].kind, objId, fIdx)
                    }
                  }}
                  onDeleteFeature={handleDeleteFeature}
                  healthMap={healthMap}
                />
              ) : activeFeatureDialog ? (
                <FeatureDialog
                  kind={activeFeatureDialog.kind}
                  sketches={doc.sketches ?? []}
                  objects={doc.objects}
                  targetObjectId={activeFeatureDialog.targetObjectId}
                  featureIndex={activeFeatureDialog.featureIndex}
                  initialFeature={
                    activeFeatureDialog.targetObjectId && activeFeatureDialog.featureIndex !== undefined
                      ? (
                          doc.objects.find((o) => o.id === activeFeatureDialog.targetObjectId)
                            ?.source as { kind: 'feature'; features: Feature[] }
                        )?.features?.[activeFeatureDialog.featureIndex]
                      : undefined
                  }
                  onApply={handleApplyFeature}
                  onCancel={() => setActiveFeatureDialog(null)}
                />
              ) : activeSketch ? (
                <ConstraintPanel
                  sketch={activeSketch}
                  selectedCurveIds={sketchToolState.selectedCurveIds}
                  selectedPointIds={sketchToolState.selectedPointIds}
                  conflicts={{
                    constraints: dofInfo.conflicts,
                    redundant: dofInfo.redundant,
                  }}
                  onUpdateConstraint={(id, val) =>
                    dispatch('Update Constraint', (prev) =>
                      updateDimensionCommand(prev, activeSketch.id, id, val),
                    )
                  }
                  onDeleteConstraint={(id) =>
                    dispatch('Delete Constraint', (prev) =>
                      deleteConstraintCommand(prev, activeSketch.id, id),
                    )
                  }
                />
              ) : (
                <>
                  <Properties
                    objects={doc.objects}
                    selection={selection}
                    onUpdateObject={handleUpdateObject}
                    onUpdateTransform={handleUpdateTransform}
                    onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
                    onEditFeature={(objId, fIdx) => {
                      const obj = doc.objects.find((o) => o.id === objId)
                      if (obj?.source.kind === 'feature') {
                        handleOpenFeatureDialog(obj.source.features[fIdx].kind, objId, fIdx)
                      }
                    }}
                    onDeleteFeature={handleDeleteFeature}
                    onAddFeature={(objId, kind) => handleOpenFeatureDialog(kind, objId)}
                    healthMap={healthMap}
                    meshes={meshesMap}
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

      {svgImportState.open && (
        <SvgImportDialog
          initialFile={svgImportState.file}
          initialSvgText={svgImportState.svgText}
          activeSketch={activeSketch}
          onImport={handleSvgImport}
          onClose={() => setSvgImportState({ open: false })}
        />
      )}
    </div>
  )
}
