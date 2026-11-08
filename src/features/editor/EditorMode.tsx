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
import { Viewport, type Matrix4Tuple, type ViewportSceneConfig, type ViewportTopologyConfig } from '../viewport/Viewport'
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
import { newId, type PlaneDefinition as SketchPlaneDefinition, type Constraint, type Sketch, addLine, addPoint, addProjectedGeometry } from '../../editor/sketch/model'
import { frameForFace, facePlaneFrame, projectChains, type FacePlaneDefinition } from '../../editor/sketch/plane'
import { faceRef, edgeRef } from '../../geometry/topology/reference'
import type { MeshTopology } from '../../geometry/topology'
import { getMeshClient, TopologyLimitError } from '../../geometry/mesh/meshClient'
import { FaceToolsPanel, type SelectionMode } from './face/FaceToolsPanel'
import { dimensionFor, constraintEntities } from '../../editor/sketch/measure'
import { rectangleMacro } from '../../editor/sketch/tools/rectangle'
import type { ScreenPickResult } from '../viewport/sketchPicking'
import type { ViewportSketchConfig } from '../viewport/sketchMesh'
import type { MeshData } from '../../geometry/mesh'
import type { Op } from '../../editor/stack'
import { addOp, updateOp, removeOp, toggleOp, moveOp, featureToOp } from '../../editor/stack'
import { combineObjects, releaseTool } from '../../geometry/features/ops/boolean'
import { meshRegistry } from '../../geometry/model'
import type { IndexedMesh } from '../../geometry/stl-import'
import { MeasurePanel, type MeasurementItem } from './mesh/MeasurePanel'
import { AnalysisPanel, type AnalysisSettings } from './mesh/AnalysisPanel'
import type { MeshHighlight } from './mesh/MeshSection'
import { CutPanel, type CutOperationMode } from './cut/CutPanel'
import { SplitDialog } from './cut/SplitDialog'
import { HoleToolPanel } from './ops/HoleToolPanel'
import { TextToolPanel } from './ops/TextToolPanel'
import { createCutGroup, deleteCutGroup, updateCutGroup, type CutGroup, type CutPartSource } from '../../editor/cuts'
import type { HoleOp, TextOp } from '../../editor/stack'
import type { HoleParams } from '../../geometry/features/ops/hole'
import type { TextOpParams } from '../../geometry/features/ops/text'
import type { CutConnectorConfig } from '../../geometry/cut/connectors'
import type { PlaneDefinition as CutPlaneDefinition } from '../../geometry/cut/plane'
import {
  measureDistance,
  measureAngle,
  fitCircle3D,
  measureWallThickness,
  snapToMesh,
  type Vec3,
} from '../../geometry/mesh/measure'
import { getSectionPlane } from '../../geometry/mesh/analysisOverlays'

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

  // Режимы граней и рёбер
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('object')
  const [faceSelection, setFaceSelection] = useState<number[]>([])
  const [edgeSelection, setEdgeSelection] = useState<number[]>([])
  const [hoverFace, setHoverFace] = useState<number | null>(null)
  const [hoverEdge, setHoverEdge] = useState<number | null>(null)
  const [pushDistance, setPushDistance] = useState(5)
  const [breakKind, setBreakKind] = useState<'chamfer' | 'fillet'>('chamfer')
  const [breakSize, setBreakSize] = useState(1)
  const [sharpness, setSharpness] = useState(30)
  const [topology, setTopology] = useState<MeshTopology | null>(null)
  const [topologyError, setTopologyError] = useState<string | null>(null)
  const [faceOpError, setFaceOpError] = useState<{
    key: string
    params?: Record<string, string | number>
  } | null>(null)

  /** Объект, чья топология используется в режимах граней и рёбер. */
  const topologyObjectId = selectionMode === 'object' ? null : (selection[0] ?? null)
  const topologyMesh = topologyObjectId ? meshesMap[topologyObjectId] : undefined


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

  // Measure & Analysis states
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>({
    overhangEnabled: false,
    overhangThreshold: 45,
    thinWallEnabled: false,
    thinWallThreshold: 0.8,
    sectionEnabled: false,
    sectionAxis: 'z',
    sectionOffset: 0,
  })
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([])
  const [pickedMeasurePoints, setPickedMeasurePoints] = useState<Vec3[]>([])
  const [activeHighlight, setActiveHighlight] = useState<MeshHighlight | null>(null)
  const [meshSectionOpen, setMeshSectionOpen] = useState(false)

  // Cut, Split, Hole and Text states
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [pickedPoint, setPickedPoint] = useState<[number, number, number] | null>(null)
  const [pickedNormal, setPickedNormal] = useState<[number, number, number] | null>(null)
  const [pickedFace, setPickedFace] = useState<{ normal: [number, number, number]; origin: [number, number, number] } | undefined>(undefined)

  const handleRepairMesh = (targetId?: string) => {
    if (targetId) setSelection([targetId])
    setMeshSectionOpen(true)
  }

  const clippingPlane = useMemo(() => {
    if (!analysisSettings.sectionEnabled) return null
    return getSectionPlane(analysisSettings.sectionAxis, analysisSettings.sectionOffset)
  }, [analysisSettings.sectionEnabled, analysisSettings.sectionAxis, analysisSettings.sectionOffset])

  const handleMeasurePick = (hit: {
    point: [number, number, number]
    normal: [number, number, number]
    faceIndex: number
    objectId?: string
    screenPos: { x: number; y: number }
  }) => {
    if (tool === 'hole' || tool === 'text') {
      setPickedPoint(hit.point)
      setPickedNormal(hit.normal)
      if (hit.objectId) setSelection([hit.objectId])
      return
    }
    if (tool === 'cut') {
      setPickedFace({ normal: hit.normal, origin: hit.point })
      if (hit.objectId) setSelection([hit.objectId])
      return
    }

    const obj = doc.objects.find((o) => o.id === hit.objectId)
    const mesh = obj?.source.kind === 'mesh' ? meshRegistry.get(obj.source.meshId) : undefined
    let p: Vec3 = hit.point
    if (mesh) {
      const snapped = snapToMesh(
        hit.point,
        hit.faceIndex,
        mesh,
        () => ({ x: hit.screenPos.x, y: hit.screenPos.y }),
        8
      )
      p = snapped.point
    }
    const newPoints = [...pickedMeasurePoints, p]
    setPickedMeasurePoints(newPoints)

    if (mesh) {
      const thick = measureWallThickness(p, hit.normal, mesh)
      if (thick !== null && thick > 0) {
        setMeasurements((prev) => [
          ...prev,
          {
            id: `thick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'thickness',
            value: thick,
            points: [p],
          },
        ])
      }
    }

    if (newPoints.length === 2) {
      const d = measureDistance(newPoints[0], newPoints[1])
      setMeasurements((prev) => [
        ...prev,
        {
          id: `dist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'distance',
          value: d,
          points: [newPoints[0], newPoints[1]],
        },
      ])
    } else if (newPoints.length >= 3) {
      const last3 = newPoints.slice(-3)
      const angle = measureAngle(last3[0], last3[1], last3[2])
      setMeasurements((prev) => [
        ...prev,
        {
          id: `angle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: 'angle',
          value: angle,
          points: last3,
        },
      ])

      const circle = fitCircle3D(newPoints)
      if (circle && circle.residual < 0.1) {
        setMeasurements((prev) => [
          ...prev,
          {
            id: `circle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: 'circle',
            value: circle.diameter,
            residual: circle.residual,
            points: [...newPoints],
          },
        ])
      }
    }
  }

  const oversizePartIds = useMemo(() => {
    const ids = new Set<string>()
    if (!model?.parts) return ids
    for (const p of model.parts) {
      if (p.oversize) {
        const obj = doc.objects.find(
          (o) => o.source.kind === 'cutPart' && (o.source as CutPartSource).partLabel === p.label
        )
        if (obj) ids.add(obj.id)
      }
    }
    return ids
  }, [model?.parts, doc.objects])

  const handleApplyCut = (params: {
    plane: CutPlaneDefinition
    mode: CutOperationMode
    sliceCount?: number
    connector?: CutConnectorConfig
  }) => {
    const targetObj = selection[0] ? doc.objects.find((o) => o.id === selection[0]) : doc.objects.find((o) => o.visible)
    if (!targetObj) return

    const groupId = `cut-${Date.now()}`
    let partLabels: string[] = []
    if (params.mode === 'both') {
      partLabels = ['A', 'B']
    } else if (params.mode === 'keepNegative') {
      partLabels = ['A']
    } else if (params.mode === 'keepPositive') {
      partLabels = ['B']
    } else if (params.mode === 'slice') {
      const count = params.sliceCount ?? 3
      partLabels = Array.from({ length: count }, (_, i) => `Part ${i + 1}`)
    }

    const cutName = `${targetObj.name} (${t('cut.planeTitle', 'Plane Cut')})`
    const cutGroup: CutGroup = {
      id: groupId,
      name: cutName,
      sourceObjectId: targetObj.id,
      type: 'plane',
      plane: {
        mode: params.mode,
        plane: params.plane,
        sliceCount: params.sliceCount,
      },
      connector: params.connector,
      explodeGap: 0,
    }

    dispatch(t('cut.planeTitle', 'Plane Cut'), (prev) => createCutGroup(prev, cutGroup, partLabels))
    setTool('select')
  }

  const handleApplySplit = (params: {
    grid: { x: number[]; y: number[]; z: number[] }
    bed: { width: number; depth: number; margin: number }
    connector?: CutConnectorConfig
    explodeGap: number
  }) => {
    const targetObj = selection[0] ? doc.objects.find((o) => o.id === selection[0]) : doc.objects.find((o) => o.visible)
    if (!targetObj) return

    const groupId = `split-${Date.now()}`
    const cols = params.grid.x.length + 1
    const rows = params.grid.y.length + 1
    const partLabels: string[] = []
    for (let c = 0; c < cols; c++) {
      const colLetter = String.fromCharCode(65 + c)
      for (let r = 0; r < rows; r++) {
        partLabels.push(`${colLetter}${r + 1}`)
      }
    }

    const splitName = `${targetObj.name} (${t('cut.splitTitle', 'Split to Bed')})`
    const cutGroup: CutGroup = {
      id: groupId,
      name: splitName,
      sourceObjectId: targetObj.id,
      type: 'grid',
      grid: params.grid,
      bed: params.bed,
      connector: params.connector,
      explodeGap: params.explodeGap,
    }

    dispatch(t('cut.splitTitle', 'Split to Bed'), (prev) => createCutGroup(prev, cutGroup, partLabels))
    setSplitDialogOpen(false)
  }

  const handleApplyHole = (params: HoleParams) => {
    const targetId = selection[0] ?? doc.objects.find((o) => o.visible)?.id
    if (!targetId) return

    const op: HoleOp = {
      id: `hole-${Date.now()}`,
      kind: 'hole',
      enabled: true,
      params,
    }

    handleAddOp(targetId, op)
    setTool('select')
  }

  const handleApplyText = (params: TextOpParams) => {
    const targetId = selection[0] ?? doc.objects.find((o) => o.visible)?.id
    if (!targetId) return

    const op: TextOp = {
      id: `text-${Date.now()}`,
      kind: 'text',
      enabled: true,
      params,
    }

    handleAddOp(targetId, op)
    setTool('select')
  }

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
    if (newTool === 'select' || newTool === 'translate' || newTool === 'rotate' || newTool === 'scale') {
      saveEditorUi({ tool: newTool })
    }
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

  const selectedObjectBounds = useMemo(() => {
    const targetId = selection[0]
    const mesh = targetId ? meshesMap[targetId] : undefined
    if (mesh) {
      return { min: mesh.min, max: mesh.max }
    }
    return { min: [-50, -50, 0] as [number, number, number], max: [50, 50, 50] as [number, number, number] }
  }, [selection, meshesMap])
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

  const getInitialFeature = (
    obj: EditorObject | undefined,
    featureIndex: number | undefined,
  ): Feature | undefined => {
    if (!obj || featureIndex === undefined || featureIndex < 0) return undefined
    if (obj.source.kind === 'feature') {
      return obj.source.features[featureIndex]
    }
    const op = obj.stack?.[featureIndex]
    if (op && (op.kind === 'extrude' || op.kind === 'revolve')) {
      if (op.kind === 'extrude') {
        const p = op.params as any
        return {
          id: op.id,
          kind: 'extrude',
          sketch: p.sketchId,
          sketchId: p.sketchId,
          regions: p.regions,
          side: p.side ?? 'one',
          d1: p.d1 ?? 10,
          d2: p.d2,
          op: p.op ?? 'new',
          top: p.top,
          bottom: p.bottom,
        }
      } else {
        const p = op.params as any
        return {
          id: op.id,
          kind: 'revolve',
          sketch: p.sketchId,
          sketchId: p.sketchId,
          regions: p.regions,
          axis: p.axis,
          angle: p.angle ?? 360,
          op: p.op ?? 'new',
        }
      }
    }
    return undefined
  }

  const handleOpenFeatureDialog = (
    kind: 'extrude' | 'revolve',
    targetObjectId?: string,
    featureIndex?: number,
  ) => {
    setActiveFeatureDialog({ kind, targetObjectId, featureIndex })
  }

  const handleEditFeature = (objId: string, fIdx: number) => {
    const obj = doc.objects.find((o) => o.id === objId)
    if (obj) {
      if (obj.source.kind === 'feature' && obj.source.features[fIdx]) {
        handleOpenFeatureDialog(obj.source.features[fIdx].kind, objId, fIdx)
      } else if (obj.stack?.[fIdx]) {
        const kind = obj.stack[fIdx].kind
        if (kind === 'extrude' || kind === 'revolve') {
          handleOpenFeatureDialog(kind, objId, fIdx)
        }
      }
    }
  }

  const handleApplyFeature = (
    feature: Feature,
    targetObjectId?: string,
    featureIndex?: number,
  ) => {
    const op = featureToOp(feature)

    if (targetObjectId) {
      const targetObj = doc.objects.find((o) => o.id === targetObjectId)
      if (!targetObj) return

      dispatch(`Update ${feature.kind}`, (prev) => ({
        ...prev,
        objects: prev.objects.map((o) => {
          if (o.id !== targetObjectId) return o

          let currentStack = o.stack ?? []
          if (o.source.kind === 'feature') {
            currentStack = [...o.source.features.map(featureToOp), ...currentStack]
          }

          let nextStack: Op[] = []
          if (featureIndex !== undefined && featureIndex >= 0 && featureIndex < currentStack.length) {
            nextStack = currentStack.map((item, idx) => (idx === featureIndex ? { ...op, id: item.id } : item))
          } else {
            nextStack = addOp(currentStack, op)
          }

          return {
            ...o,
            source: o.source.kind === 'feature' ? { kind: 'empty' } : o.source,
            stack: nextStack,
          }
        }),
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
          kind: 'empty',
        },
        stack: [op],
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
    if (!targetObj) return

    if (targetObj.source.kind === 'feature') {
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
    } else if (targetObj.stack) {
      const nextStack = targetObj.stack.filter((_, idx) => idx !== featureIndex)
      if (nextStack.length === 0 && targetObj.source.kind === 'empty') {
        handleDelete([objectId])
      } else {
        dispatch('Delete Feature', (prev) => ({
          ...prev,
          objects: prev.objects.map((o) =>
            o.id === objectId ? { ...o, stack: nextStack } : o,
          ),
        }))
      }
    }
  }

  const handleAddOp = (objectId: string, op: Op) => {
    dispatch(t('editor.history.addOp'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) => {
        if (o.id !== objectId) return o
        let currentStack = o.stack ?? []
        if (o.source.kind === 'feature') {
          currentStack = [...o.source.features.map(featureToOp), ...currentStack]
        }
        return {
          ...o,
          source: o.source.kind === 'feature' ? { kind: 'empty' } : o.source,
          stack: addOp(currentStack, op),
        }
      }),
    }))
  }

  const handleUpdateOp = (objectId: string, opId: string, patch: Partial<Op>, mergeKey?: string) => {
    dispatch(
      t('editor.history.editOp'),
      (prev) => ({
        ...prev,
        objects: prev.objects.map((o) =>
          o.id === objectId ? { ...o, stack: updateOp(o.stack ?? [], opId, patch) } : o
        ),
      }),
      mergeKey
    )
  }

  const handleRemoveOp = (objectId: string, opId: string) => {
    dispatch(t('editor.history.deleteOp'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === objectId ? { ...o, stack: removeOp(o.stack ?? [], opId) } : o
      ),
    }))
  }

  const handleToggleOp = (objectId: string, opId: string, enabled?: boolean) => {
    dispatch(t('editor.history.toggleOp'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === objectId ? { ...o, stack: toggleOp(o.stack ?? [], opId, enabled) } : o
      ),
    }))
  }

  const handleMoveOp = (objectId: string, fromIndex: number, toIndex: number) => {
    dispatch(t('editor.history.reorderOp'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === objectId ? { ...o, stack: moveOp(o.stack ?? [], fromIndex, toIndex) } : o
      ),
    }))
  }

  const handleSetRollback = (objectId: string, index: number | null) => {
    dispatch(t('editor.history.rollback'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === objectId ? { ...o, rollback: index } : o
      ),
    }))
  }

  const handleFlatten = async (objectId: string) => {
    const meshData = meshesMap[objectId]
    if (!meshData) return
    const newMeshId = crypto.randomUUID
      ? crypto.randomUUID()
      : `mesh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const indexed: IndexedMesh = {
      vertProperties: meshData.vertProperties,
      triVerts: meshData.triVerts,
    }
    const store = await openMeshStore()
    await store.save(newMeshId, indexed)
    getModelClient().registerMesh(newMeshId, indexed)
    meshRegistry.set(newMeshId, indexed)

    dispatch(t('editor.history.flatten', 'Flatten stack'), (prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === objectId
          ? {
              ...o,
              source: { kind: 'mesh', meshId: newMeshId, unit: 'mm' },
              stack: [],
              rollback: null,
            }
          : o
      ),
    }))
  }

  const handleCombine = (
    targetId: string,
    toolIds: string[],
    mode: 'union' | 'subtract' | 'intersect'
  ) => {
    dispatch(t('editor.history.combine', 'Combine'), (prev) =>
      combineObjects(prev, targetId, toolIds, mode)
    )
  }

  const handleReleaseTool = (toolId: string) => {
    let foundTargetId: string | undefined
    let foundOpId: string | undefined

    for (const o of doc.objects) {
      for (const op of o.stack ?? []) {
        if (op.enabled && op.kind === 'boolean') {
          const tools = (op as any).params?.tools
          if (Array.isArray(tools) && tools.includes(toolId)) {
            foundTargetId = o.id
            foundOpId = op.id
            break
          }
        }
      }
      if (foundTargetId) break
    }

    if (foundTargetId && foundOpId) {
      dispatch(t('editor.history.releaseTool', 'Release tool'), (prev) =>
        releaseTool(prev, foundTargetId!, foundOpId!, toolId)
      )
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
        action: () => {
          setSelection([])
          if (selectionMode !== 'object') setSelectionMode('object')
        },
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
        id: 'cut',
        key: 'c',
        labelKey: 'cut.title',
        action: () => handleToolChange('cut'),
      },
      {
        id: 'text',
        key: 't',
        labelKey: 'text.title',
        action: () => handleToolChange('text'),
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
        id: 'mode-object',
        key: '1',
        labelKey: 'editor.mode.object',
        action: () => handleSelectionModeChange('object'),
      },
      {
        id: 'mode-face',
        key: '2',
        labelKey: 'editor.mode.face',
        action: () => handleSelectionModeChange('face'),
      },
      {
        id: 'mode-edge',
        key: '3',
        labelKey: 'editor.mode.edge',
        action: () => handleSelectionModeChange('edge'),
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
          if (selection.length > 0) {
            for (const id of selection) handleUpdateObject(id, { visible: false })
          } else {
            handleToolChange('hole')
          }
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
    [selection, doc.objects, undo, redo, canUndo, canRedo, projection, selectionMode]
  )

  // Viewport scene descriptor
  const viewportScene = useMemo((): ViewportSceneConfig => {
    const matrices: Record<string, Matrix4Tuple> = {}
    for (const obj of doc.objects) {
      let t = obj.transform
      if (obj.source.kind === 'cutPart') {
        const cutSource = obj.source as CutPartSource
        const group = doc.cuts?.find((c) => c.id === cutSource.groupId)
        if (group && (group.explodeGap ?? 0) > 0) {
          const gap = group.explodeGap!
          if (group.type === 'plane') {
            const planeDef = group.plane?.plane ?? { kind: 'axis', axis: 'z', position: 0 }
            let normal: [number, number, number] = [0, 0, 1]
            if (planeDef.kind === 'axis') {
              normal = planeDef.axis === 'x' ? [1, 0, 0] : planeDef.axis === 'y' ? [0, 1, 0] : [0, 0, 1]
            } else if (planeDef.kind === 'face') {
              normal = planeDef.normal
            }
            const dir = cutSource.partIndex === 0 ? -1 : 1
            const offset: [number, number, number] = [
              normal[0] * (gap / 2) * dir,
              normal[1] * (gap / 2) * dir,
              normal[2] * (gap / 2) * dir,
            ]
            t = {
              ...t,
              position: [
                t.position[0] + offset[0],
                t.position[1] + offset[1],
                t.position[2] + offset[2],
              ],
            }
          } else if (group.type === 'grid') {
            const cols = (group.grid?.x.length ?? 0) + 1
            const rows = (group.grid?.y.length ?? 0) + 1
            const label = cutSource.partLabel ?? 'A1'
            const col = label.charCodeAt(0) - 65
            const row = (parseInt(label.slice(1), 10) || 1) - 1
            const offsetX = (col - (cols - 1) / 2) * gap
            const offsetY = (row - (rows - 1) / 2) * gap
            t = {
              ...t,
              position: [
                t.position[0] + offsetX,
                t.position[1] + offsetY,
                t.position[2],
              ],
            }
          }
        }
      }
      matrices[obj.id] = matrixOf(t)
    }

    return {
      matrices,
      selection,
      locked: doc.objects.filter((o) => o.locked).map((o) => o.id),
      hidden: doc.objects.filter((o) => !o.visible).map((o) => o.id),
      gizmo:
        tool === 'translate' || tool === 'rotate' || tool === 'scale'
          ? {
              mode: tool,
              space: 'local' as const,
              snap: snap ? { grid: snapStepMm, angle: snapStepDeg } : undefined,
            }
          : undefined,
      projection,
    }
  }, [doc.objects, doc.cuts, selection, tool, snap, snapStepMm, snapStepDeg, projection])

  // Hovered constraint for highlight
  const [hoverConstraintId, setHoverConstraintId] = useState<string | null>(null)
  const [sketchCursorPos, setSketchCursorPos] = useState<{ x: number; y: number } | null>(null)
  const constraintHighlight = useMemo(() => {
    if (!activeSketch || !hoverConstraintId) return null
    const c = activeSketch.constraints.find((con) => con.id === hoverConstraintId)
    if (!c) return null
    return constraintEntities(activeSketch, c)
  }, [activeSketch, hoverConstraintId])

  // Наложки режимов граней и рёбер во вьюпорте
  const viewportTopology = useMemo((): ViewportTopologyConfig | null => {
    if (selectionMode === 'object' || !topology || !topologyObjectId) return null
    return {
      label: topologyObjectId,
      topology,
      mode: selectionMode,
      faceSelection,
      edgeSelection,
      hoverFace,
      hoverEdge,
    }
  }, [selectionMode, topology, topologyObjectId, faceSelection, edgeSelection, hoverFace, hoverEdge])

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
      highlight: constraintHighlight,
      preview: sketchToolState.preview,
      tool: sketchToolState.tool,
      toolStage: sketchToolState.stage,
      toolStartPt: sketchToolState.startPt,
      cursorPlanePos: sketchCursorPos,
      dofStatus: {
        points: dofInfo.entityStatus,
        curves: dofInfo.entityStatus,
      },
      conflicts: {
        constraints: dofInfo.conflicts,
      },
    }
  }, [activeSketch, sketchToolState, dofInfo, constraintHighlight, sketchCursorPos])

  const handleDraftInputSubmit = (val1: number, val2: number) => {
    if (!activeSketch) return
    const tool = sketchToolState.tool

    if (tool === 'rect-2pt' || tool === 'rect-center') {
      if (sketchToolState.stage === 0) {
        setSketchToolState((prev) => ({
          ...prev,
          stage: 1,
          startPt: { x: val1, y: val2 },
        }))
      } else if (sketchToolState.stage === 1 && sketchToolState.startPt) {
        const p1 = sketchToolState.startPt
        const cursor = sketchCursorPos ?? p1
        const sx = cursor.x >= p1.x ? 1 : -1
        const sy = cursor.y >= p1.y ? 1 : -1
        const p2 = {
          x: p1.x + sx * Math.abs(val1),
          y: p1.y + sy * Math.abs(val2),
        }
        const res = rectangleMacro(activeSketch, {
          p1,
          p2,
          isCenter: tool === 'rect-center',
          widthDim: Math.abs(val1),
          heightDim: Math.abs(val2),
        })
        dispatch('Add Rectangle', (prev) => updateSketchInDoc(prev, activeSketch.id, () => res.sketch))
        setSketchToolState((prev) => ({
          ...prev,
          tool: 'select',
          stage: 0,
          startPt: undefined,
          secondPt: undefined,
          preview: undefined,
        }))
      }
    } else if (tool === 'line') {
      if (sketchToolState.stage === 0) {
        setSketchToolState((prev) => ({
          ...prev,
          stage: 1,
          startPt: { x: val1, y: val2 },
        }))
      } else if (sketchToolState.stage === 1 && sketchToolState.startPt) {
        const p1 = sketchToolState.startPt
        const resPt = addPoint(activeSketch, val1, val2)
        let s = resPt.sketch
        const p1Id = p1.pointId ?? addPoint(s, p1.x, p1.y).pointId
        const lineRes = addLine(s, p1Id, resPt.pointId, sketchToolState.construction)
        s = lineRes.sketch
        const len = Math.hypot(val1 - p1.x, val2 - p1.y)
        if (len > 1e-4) {
          s.constraints.push({ id: newId('con'), kind: 'distance', refs: [lineRes.curveId], value: len })
        }
        dispatch('Add Line', (prev) => updateSketchInDoc(prev, activeSketch.id, () => s))
        setSketchToolState((prev) => ({
          ...prev,
          tool: 'select',
          stage: 0,
          startPt: undefined,
          preview: undefined,
        }))
      }
    }
  }

  const handleCancelSketchStage = () => {
    if (sketchToolState.stage > 0) {
      setSketchToolState((prev) => ({
        ...prev,
        stage: 0,
        startPt: undefined,
        secondPt: undefined,
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
  }

  const handleSketchBoxSelect = (box: { points: string[]; curves: string[] }, additive: boolean) => {
    setSketchToolState((prev) => ({
      ...prev,
      selectedPointIds: additive
        ? Array.from(new Set([...prev.selectedPointIds, ...box.points]))
        : box.points,
      selectedCurveIds: additive
        ? Array.from(new Set([...prev.selectedCurveIds, ...box.curves]))
        : box.curves,
    }))
  }

  const handlePinDimension = (curveId: string) => {
    if (!activeSketch) return
    const dim = dimensionFor(activeSketch, curveId)
    if (dim) {
      dispatch('Add Dimension', (prev) =>
        updateSketchInDoc(prev, activeSketch.id, (s) => ({
          ...s,
          constraints: [...s.constraints, dim],
        })),
      )
    }
  }

  // Sketch add handler
  const handleAddSketch = (plane: SketchPlaneDefinition) => {
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

  // --- Режимы граней и рёбер -------------------------------------------------

  // Топология считается в воркере и кэшируется по хэшу сетки.
  useEffect(() => {
    if (!topologyObjectId || !topologyMesh) {
      setTopology(null)
      setTopologyError(null)
      return
    }
    let cancelled = false
    const client = getMeshClient()
    client
      .topologyOf(
        {
          vertProperties: topologyMesh.vertProperties,
          triVerts: topologyMesh.triVerts,
        },
        { edgeAngleDeg: sharpness }
      )
      .then((topo) => {
        if (cancelled) return
        setTopology(topo)
        setTopologyError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setTopology(null)
        setTopologyError(
          e instanceof TopologyLimitError ? 'topology.error.tooManyTriangles' : 'topology.status.failed'
        )
      })
    return () => {
      cancelled = true
    }
  }, [topologyObjectId, topologyMesh, sharpness])

  // Смена режима сбрасывает выбор граней и рёбер.
  useEffect(() => {
    setFaceSelection([])
    setEdgeSelection([])
    setHoverFace(null)
    setHoverEdge(null)
    setFaceOpError(null)
  }, [selectionMode, topologyObjectId])

  /** Перевыбор ссылок операции: возвращаемся в нужный режим граней или рёбер. */
  const handleRePickOp = (opId: string) => {
    const objectId = topologyObjectId
    if (!objectId) return
    const obj = doc.objects.find((o) => o.id === objectId)
    const op = obj?.stack?.find((o) => o.id === opId)
    const kind = op?.kind === 'edgeBreak' ? 'edge' : 'face'
    handleSelectionModeChange(kind)
    setFaceSelection([])
    setEdgeSelection([])
    setFaceOpError(null)
  }

  /** Переключение режима выбора: объект, грань или ребро. */
  const handleSelectionModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode)
    if (mode !== 'object') {
      // В режимах граней и рёбер работаем с одним объектом.
      if (selection.length > 1) setSelection([selection[0]])
      setActiveSketchId(null)
      setTool('select')
    }
  }

  const handlePickFace = (faceId: number | null, additive: boolean) => {
    if (faceId === null) {
      if (!additive) setFaceSelection([])
      return
    }
    setFaceOpError(null)
    setFaceSelection((prev) =>
      additive
        ? prev.includes(faceId)
          ? prev.filter((id) => id !== faceId)
          : [...prev, faceId]
        : [faceId]
    )
  }

  const handlePickEdge = (edgeId: number | null, additive: boolean) => {
    if (edgeId === null) {
      if (!additive) setEdgeSelection([])
      return
    }
    setFaceOpError(null)
    setEdgeSelection((prev) =>
      additive
        ? prev.includes(edgeId)
          ? prev.filter((id) => id !== edgeId)
          : [...prev, edgeId]
        : [edgeId]
    )
  }

  const handleApplyPushPull = () => {
    const objectId = topologyObjectId
    if (!objectId || !topology) return
    const faces = topology.faces.filter((f) => faceSelection.includes(f.id))
    if (faces.length === 0) return
    handleAddOp(objectId, {
      id: newId('op'),
      kind: 'pushPull',
      enabled: true,
      params: { faces: faces.map(faceRef), distance: pushDistance },
    })
  }

  const handleApplyEdgeBreak = () => {
    const objectId = topologyObjectId
    if (!objectId || !topology) return
    const edges = topology.edges.filter((e) => edgeSelection.includes(e.id))
    if (edges.length === 0) return
    handleAddOp(objectId, {
      id: newId('op'),
      kind: 'edgeBreak',
      enabled: true,
      params: { edges: edges.map(edgeRef), kind: breakKind, size: breakSize },
    })
  }

  /** Эскиз на грани: плоскости грани и, по запросу, проекция рёбер. */
  const handleSketchOnFace = (withProjection: boolean) => {
    const objectId = topologyObjectId
    if (!objectId || !topology) return
    const face = topology.faces.find((f) => f.id === faceSelection[0])
    if (!face) return
    const frame = frameForFace(face, topology, face.centroid)
    if (!frame) {
      setFaceOpError({ key: 'face.error.notPlanar' })
      return
    }
    const plane: FacePlaneDefinition = { face: faceRef(face), frame }
    const boundary = withProjection
      ? topology.edges.filter((e) => e.faces[0] === face.id || e.faces[1] === face.id)
      : []
    const projected = withProjection
      ? projectChains(boundary, facePlaneFrame(frame))
      : null

    const existingNames = (doc.sketches ?? []).map((s) => s.name)
    const name = newName(t('sketch.defaultName', 'Sketch'), existingNames)
    let newSketchId = ''
    dispatch('Add Sketch', (prev) => {
      const res = addSketchCommand(prev, name, plane)
      newSketchId = res.sketchId
      if (!projected) return res.doc
      return updateSketchInDoc(res.doc, res.sketchId, (s) =>
        addProjectedGeometry(s, projected, true)
      )
    })
    setActiveSketchId(newSketchId)
    setSketchToolState(initialToolState('select'))
  }

  // Ошибка операции из стека (ссылка не нашлась и т.п.).
  const lastFaceOpStatus = useMemo(() => {
    const objectId = topologyObjectId
    if (!objectId) return null
    const statuses = model?.editor?.statuses?.[objectId]
    if (!statuses) return null
    const failed = statuses.ops.find((o) => o.status === 'failed')
    return failed ?? null
  }, [model, topologyObjectId])

  useEffect(() => {
    if (!lastFaceOpStatus || lastFaceOpStatus.status !== 'failed') return
    if (!lastFaceOpStatus.reason) return
    if (!lastFaceOpStatus.reason.startsWith('face.') && !lastFaceOpStatus.reason.startsWith('edge.')) {
      return
    }
    setFaceOpError({ key: lastFaceOpStatus.reason, params: lastFaceOpStatus.params })
  }, [lastFaceOpStatus])

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
    if (kind === 'move') {
      setSketchCursorPos(pos)
    }
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
        action: handleCancelSketchStage,
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
          onOpenSplitDialog={() => setSplitDialogOpen(true)}
          analysisOpen={analysisOpen}
          onToggleAnalysis={() => setAnalysisOpen(!analysisOpen)}
          selectionMode={selectionMode}
          onSelectionModeChange={handleSelectionModeChange}
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
              onEditFeature={handleEditFeature}
              onDeleteFeature={handleDeleteFeature}
              onCombine={handleCombine}
              onReleaseTool={handleReleaseTool}
              healthMap={healthMap}
              cuts={doc.cuts}
              onDeleteCutGroup={(gId) => dispatch('Delete Cut Group', (prev) => deleteCutGroup(prev, gId))}
              onUpdateCutGroup={(gId, patch) => dispatch('Update Cut Group', (prev) => updateCutGroup(prev, gId, patch))}
              oversizePartIds={oversizePartIds}
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
              topology={viewportTopology}
              onPickFace={handlePickFace}
              onPickEdge={handlePickEdge}
              onHoverFace={setHoverFace}
              onHoverEdge={setHoverEdge}
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
              onSketchSelectBox={handleSketchBoxSelect}
              onSubmitDraftInput={handleDraftInputSubmit}
              onCancelSketchStage={handleCancelSketchStage}
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
              onHoverConstraint={setHoverConstraintId}
              onPinDimension={handlePinDimension}
              clippingPlane={clippingPlane}
              highlight={activeHighlight}
              measurePickActive={tool === 'measure' || tool === 'hole' || tool === 'text' || tool === 'cut'}
              onMeasurePick={handleMeasurePick}
            />
          </EditorDropZone>

          {/* Measurements and status */}
          <MeasurementsBar model={model} />
          <ActivityLogPanel />

          {/* Floating Measure Panel */}
          {tool === 'measure' && (
            <div className="absolute top-3 left-14 z-20">
              <MeasurePanel
                measurements={measurements}
                onClear={() => {
                  setMeasurements([])
                  setPickedMeasurePoints([])
                }}
                onRemoveItem={(id) => setMeasurements((prev) => prev.filter((m) => m.id !== id))}
                onClose={() => setTool('select')}
              />
            </div>
          )}

          {/* Floating Analysis Panel */}
          {analysisOpen && (
            <div className="absolute top-3 right-14 z-20">
              <AnalysisPanel
                settings={analysisSettings}
                onChange={(patch) => setAnalysisSettings((prev) => ({ ...prev, ...patch }))}
                onClose={() => setAnalysisOpen(false)}
              />
            </div>
          )}
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
                  : tool === 'cut'
                    ? t('cut.title')
                    : tool === 'hole'
                      ? t('hole.title')
                      : tool === 'text'
                        ? t('text.title')
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
                initialFeature={getInitialFeature(
                  activeFeatureDialog.targetObjectId
                    ? doc.objects.find((o) => o.id === activeFeatureDialog.targetObjectId)
                    : undefined,
                  activeFeatureDialog.featureIndex,
                )}
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
                dof={dofInfo.dof}
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
                onAddConstraint={handleAddConstraint}
                onHoverConstraint={setHoverConstraintId}
              />
            ) : tool === 'cut' ? (
              <CutPanel
                onApply={handleApplyCut}
                onCancel={() => setTool('select')}
                pickedFace={pickedFace}
                targetMesh={selection[0] ? meshesMap[selection[0]] : doc.objects.find((o) => o.visible)?.id ? meshesMap[doc.objects.find((o) => o.visible)!.id] : undefined}
              />
            ) : tool === 'hole' ? (
              <HoleToolPanel
                initialPoint={pickedPoint ?? [0, 0, 0]}
                initialNormal={pickedNormal ?? [0, 0, 1]}
                onApply={handleApplyHole}
                onCancel={() => setTool('select')}
              />
            ) : tool === 'text' ? (
              <TextToolPanel
                initialPoint={pickedPoint ?? [0, 0, 0]}
                initialNormal={pickedNormal ?? [0, 0, 1]}
                onApply={handleApplyText}
                onCancel={() => setTool('select')}
              />
            ) : selectionMode !== 'object' ? (
              <FaceToolsPanel
                mode={selectionMode}
                topology={topology}
                faceSelection={faceSelection}
                edgeSelection={edgeSelection}
                sharpness={sharpness}
                onSharpnessChange={setSharpness}
                distance={pushDistance}
                onDistanceChange={setPushDistance}
                onApplyPushPull={handleApplyPushPull}
                breakKind={breakKind}
                onBreakKindChange={setBreakKind}
                size={breakSize}
                onSizeChange={setBreakSize}
                onApplyEdgeBreak={handleApplyEdgeBreak}
                onSketchOnFace={() => handleSketchOnFace(false)}
                onProjectEdges={() => handleSketchOnFace(true)}
                error={faceOpError?.key ?? null}
                errorParams={faceOpError?.params ?? null}
                limitError={topologyError}
                busy={pending}
              />
            ) : (
              <Properties
                objects={doc.objects}
                selection={selection}
                onUpdateObject={handleUpdateObject}
                onUpdateTransform={handleUpdateTransform}
                onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
                onEditFeature={handleEditFeature}
                onDeleteFeature={handleDeleteFeature}
                onAddFeature={(objId, kind) => handleOpenFeatureDialog(kind, objId)}
                objectStatuses={model?.editor?.statuses}
                onAddOp={handleAddOp}
                onUpdateOp={handleUpdateOp}
                onRemoveOp={handleRemoveOp}
                onToggleOp={handleToggleOp}
                onMoveOp={handleMoveOp}
                onSetRollback={handleSetRollback}
                onFlatten={handleFlatten}
                healthMap={healthMap}
                meshes={meshesMap}
                onHighlight={setActiveHighlight}
                meshSectionOpen={meshSectionOpen}
                onMeshSectionOpenChange={setMeshSectionOpen}
                onRepairMesh={handleRepairMesh}
                onRePickOp={handleRePickOp}
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
                      : tool === 'cut'
                        ? t('cut.title')
                        : tool === 'hole'
                          ? t('hole.title')
                          : tool === 'text'
                            ? t('text.title')
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
                  onEditFeature={handleEditFeature}
                  onDeleteFeature={handleDeleteFeature}
                  onCombine={handleCombine}
                  onReleaseTool={handleReleaseTool}
                  healthMap={healthMap}
                  cuts={doc.cuts}
                  onDeleteCutGroup={(gId) => dispatch('Delete Cut Group', (prev) => deleteCutGroup(prev, gId))}
                  onUpdateCutGroup={(gId, patch) => dispatch('Update Cut Group', (prev) => updateCutGroup(prev, gId, patch))}
                  oversizePartIds={oversizePartIds}
                />
              ) : activeFeatureDialog ? (
                <FeatureDialog
                  kind={activeFeatureDialog.kind}
                  sketches={doc.sketches ?? []}
                  objects={doc.objects}
                  targetObjectId={activeFeatureDialog.targetObjectId}
                  featureIndex={activeFeatureDialog.featureIndex}
                  initialFeature={getInitialFeature(
                    activeFeatureDialog.targetObjectId
                      ? doc.objects.find((o) => o.id === activeFeatureDialog.targetObjectId)
                      : undefined,
                    activeFeatureDialog.featureIndex,
                  )}
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
                  dof={dofInfo.dof}
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
                  onAddConstraint={handleAddConstraint}
                  onHoverConstraint={setHoverConstraintId}
                />
              ) : tool === 'cut' ? (
                <CutPanel
                  onApply={handleApplyCut}
                  onCancel={() => setTool('select')}
                  pickedFace={pickedFace}
                  targetMesh={selection[0] ? meshesMap[selection[0]] : doc.objects.find((o) => o.visible)?.id ? meshesMap[doc.objects.find((o) => o.visible)!.id] : undefined}
                />
              ) : tool === 'hole' ? (
                <HoleToolPanel
                  initialPoint={pickedPoint ?? [0, 0, 0]}
                  initialNormal={pickedNormal ?? [0, 0, 1]}
                  onApply={handleApplyHole}
                  onCancel={() => setTool('select')}
                />
              ) : tool === 'text' ? (
                <TextToolPanel
                  initialPoint={pickedPoint ?? [0, 0, 0]}
                  initialNormal={pickedNormal ?? [0, 0, 1]}
                  onApply={handleApplyText}
                  onCancel={() => setTool('select')}
                />
              ) : selectionMode !== 'object' ? (
                <FaceToolsPanel
                  mode={selectionMode}
                  topology={topology}
                  faceSelection={faceSelection}
                  edgeSelection={edgeSelection}
                  sharpness={sharpness}
                  onSharpnessChange={setSharpness}
                  distance={pushDistance}
                  onDistanceChange={setPushDistance}
                  onApplyPushPull={handleApplyPushPull}
                  breakKind={breakKind}
                  onBreakKindChange={setBreakKind}
                  size={breakSize}
                  onSizeChange={setBreakSize}
                  onApplyEdgeBreak={handleApplyEdgeBreak}
                  onSketchOnFace={() => handleSketchOnFace(false)}
                  onProjectEdges={() => handleSketchOnFace(true)}
                  error={faceOpError?.key ?? null}
                  errorParams={faceOpError?.params ?? null}
                  limitError={topologyError}
                  busy={pending}
                />
              ) : (
                <>
                  <Properties
                    objects={doc.objects}
                    selection={selection}
                    onUpdateObject={handleUpdateObject}
                    onUpdateTransform={handleUpdateTransform}
                    onUpdatePrimitiveParams={handleUpdatePrimitiveParams}
                    onEditFeature={handleEditFeature}
                    onDeleteFeature={handleDeleteFeature}
                    onAddFeature={(objId, kind) => handleOpenFeatureDialog(kind, objId)}
                    objectStatuses={model?.editor?.statuses}
                    onAddOp={handleAddOp}
                    onUpdateOp={handleUpdateOp}
                    onRemoveOp={handleRemoveOp}
                    onToggleOp={handleToggleOp}
                    onMoveOp={handleMoveOp}
                    onSetRollback={handleSetRollback}
                    onFlatten={handleFlatten}
                    healthMap={healthMap}
                    meshes={meshesMap}
                    onHighlight={setActiveHighlight}
                    meshSectionOpen={meshSectionOpen}
                    onMeshSectionOpenChange={setMeshSectionOpen}
                    onRepairMesh={handleRepairMesh}
                onRePickOp={handleRePickOp}
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

      {splitDialogOpen && (
        <SplitDialog
          objectBounds={selectedObjectBounds}
          targetMesh={selection[0] ? meshesMap[selection[0]] : doc.objects.find((o) => o.visible)?.id ? meshesMap[doc.objects.find((o) => o.visible)!.id] : undefined}
          onApply={handleApplySplit}
          onCancel={() => setSplitDialogOpen(false)}
        />
      )}
    </div>
  )
}
