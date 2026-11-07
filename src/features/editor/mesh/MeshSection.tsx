import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconCheck,
  IconAlertTriangle,
  IconWand,
  IconTool,
  IconRotate2,
  IconLayersIntersect,
  IconArrowBackUp,
  IconChevronDown,
  IconChevronRight,
  IconEye,
} from '@tabler/icons-react'
import type { EditorObject, MeshSource } from '../../../editor/scene'
import type { Bounds3 } from '../../../editor/transform'
import type { MeshHealth } from '../../../editor/health'
import type { MeshData } from '../../../geometry/mesh'
import type { IndexedMesh } from '../../../geometry/stl-import'
import { Section } from '../../../ui/Section'
import { Button } from '../../../ui/Button'
import { ConfirmDialog } from '../../../ui/ConfirmDialog'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { useUnit, formatLength } from '../../../ui/units'
import { getWasm } from '../../../geometry/wasm'
import { getMeshClient, MeshClient, MeshSupersededError } from '../../../geometry/mesh/meshClient'
import { analyze, type MeshAnalysis } from '../../../geometry/mesh/analyze'
import { weld } from '../../../geometry/mesh/weld'
import { removeDegenerate } from '../../../geometry/mesh/removeDegenerate'
import { fixOrientation } from '../../../geometry/mesh/orient'
import { fillHoles } from '../../../geometry/mesh/fillHoles'
import { removeShells } from '../../../geometry/mesh/shells'
import { makeSolid, MakeSolidBudgetError } from '../../../geometry/mesh/makeSolid'
import { decimate, DecimateNonManifoldError } from '../../../geometry/mesh/decimate'
import { smooth } from '../../../geometry/mesh/smooth'
import { layOnFace, bestOrientations, type OrientationSuggestion } from '../../../geometry/mesh/orientation'
import { hashMesh } from '../importFiles'
import { openMeshStore, type MeshStore } from '../../cutout/meshStore'
import { meshRegistry } from '../../../geometry/model'
import { getModelClient } from '../../../app/useModel'

export interface MeshHighlight {
  points?: [number, number, number][]
  lines?: [number, number, number][][]
  triangles?: number[]
  bounds?: Bounds3
}

export interface MeshSectionProps {
  object: EditorObject
  meshData?: MeshData
  health?: MeshHealth
  onUpdateObject: (id: string, patch: Partial<EditorObject>, mergeKey?: string) => void
  onHighlight?: (highlight: MeshHighlight | null) => void
  onFrame?: (bounds: Bounds3) => void
  meshClient?: MeshClient
  meshStore?: MeshStore
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MeshSection({
  object,
  meshData,
  health,
  onUpdateObject,
  onHighlight,
  onFrame,
  meshClient = getMeshClient(),
  meshStore,
  isOpen,
  onOpenChange,
}: MeshSectionProps) {
  const { t } = useTranslation()
  const { unit } = useUnit()

  const source = object.source as MeshSource
  const meshId = source.meshId
  const originMeshId = source.originMeshId ?? meshId

  const [currentMesh, setCurrentMesh] = useState<IndexedMesh | null>(
    () => meshRegistry.get(meshId) ?? null
  )
  const [analysis, setAnalysis] = useState<MeshAnalysis | null>(() => {
    const m = meshRegistry.get(meshId)
    return m ? analyze(m) : null
  })
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<
    | null
    | 'autoRepair'
    | 'weld'
    | 'fillHoles'
    | 'shells'
    | 'makeSolid'
    | 'decimate'
    | 'smooth'
    | 'bestOrientation'
    | 'revert'
  >(null)

  // Auto repair report
  const [autoRepairReport, setAutoRepairReport] = useState<{
    welds: number
    degenerates: number
    flipped: number
    holesFilled: number
    shellsRemoved: number
    isSolid: boolean
  } | null>(null)

  // Repair options state
  const [weldTol, setWeldTol] = useState(0.001)
  const [fillMode, setFillMode] = useState<'flat' | 'smooth'>('flat')
  const [fillMaxPerimeter, setFillMaxPerimeter] = useState(20)
  const [shellsMode, setShellsMode] = useState<'keepLargest' | 'byVolume' | 'byTriangles'>('keepLargest')
  const [shellsThreshold, setShellsThreshold] = useState(0.1)

  // Make Solid state
  const defaultRes = useMemo(() => {
    if (!meshData) return 1.0
    const dx = meshData.max[0] - meshData.min[0]
    const dy = meshData.max[1] - meshData.min[1]
    const dz = meshData.max[2] - meshData.min[2]
    const diag = Math.hypot(dx, dy, dz)
    return Math.max(0.2, Math.round((diag / 150) * 10) / 10)
  }, [meshData])
  const [makeSolidRes, setMakeSolidRes] = useState(defaultRes)

  // Decimate state
  const [decimateRatio, setDecimateRatio] = useState(0.5)
  const [decimateError, setDecimateError] = useState<string | null>(null)

  // Smooth state
  const [smoothIters, setSmoothIters] = useState(5)

  // Best orientations state
  const [orientationCandidates, setOrientationCandidates] = useState<OrientationSuggestion[]>([])

  // Intersections state
  const [intersectionPairs, setIntersectionPairs] = useState<number | null>(null)
  const [checkingIntersections, setCheckingIntersections] = useState(false)
  const [intersectionProgress, setIntersectionProgress] = useState(0)

  // Loading indicator for async repairs
  const [busy, setBusy] = useState(false)

  // Load mesh from registry or store
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // 1. Check registry
      const fromReg = meshRegistry.get(meshId)
      if (fromReg) {
        if (!cancelled) {
          setCurrentMesh(fromReg)
          setAnalysis(analyze(fromReg))
        }
        return
      }

      // 2. Check store
      try {
        const store = meshStore ?? (await openMeshStore())
        const loaded = await store.load(meshId)
        if (loaded && !cancelled) {
          meshRegistry.set(meshId, loaded)
          setCurrentMesh(loaded)
          setAnalysis(analyze(loaded))
        }
      } catch {
        // ignore load errors
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [meshId, meshStore])

  // Save new mesh and commit undoable update to object
  const applyNewMesh = async (newMesh: IndexedMesh) => {
    setBusy(true)
    try {
      const newId = hashMesh(newMesh)
      meshRegistry.set(newId, newMesh)

      const store = meshStore ?? (await openMeshStore())
      await store.save(newId, newMesh)

      // Register with model worker
      try {
        getModelClient().registerMesh(newId, newMesh)
      } catch {
        // in test env without worker
      }

      // Commit object source swap
      onUpdateObject(object.id, {
        source: {
          ...source,
          meshId: newId,
          originMeshId,
        },
      })

      setCurrentMesh(newMesh)
      setAnalysis(analyze(newMesh))
    } finally {
      setBusy(false)
    }
  }

  // --- Handlers for Repairs ---

  const handleAutoRepair = async () => {
    if (!currentMesh) return
    setBusy(true)
    try {
      const result = await meshClient.autoRepair(currentMesh, { maxHolePerimeter: 20 })
      setAutoRepairReport({
        welds: result.steps.weldedVertices,
        degenerates: result.steps.removedDegenerate + result.steps.removedDuplicates,
        flipped: result.steps.flippedTriangles,
        holesFilled: result.steps.filledLoops,
        shellsRemoved: result.steps.removedTinyShells,
        isSolid: result.isSolid,
      })
      await applyNewMesh(result.mesh)
    } catch (e) {
      if (!(e instanceof MeshSupersededError)) {
        console.error('Auto repair error:', e)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleWeld = async () => {
    if (!currentMesh) return
    const welded = weld(currentMesh, weldTol)
    await applyNewMesh(welded.mesh)
    setActiveModal(null)
  }

  const handleRemoveDegenerate = async () => {
    if (!currentMesh) return
    const res = removeDegenerate(currentMesh)
    await applyNewMesh(res.mesh)
  }

  const handleFixOrientation = async () => {
    if (!currentMesh) return
    const res = fixOrientation(currentMesh)
    await applyNewMesh(res.mesh)
  }

  const handleFillHoles = async () => {
    if (!currentMesh) return
    const res = fillHoles(currentMesh, {
      mode: fillMode,
      maxPerimeter: fillMaxPerimeter,
    })
    await applyNewMesh(res.mesh)
    setActiveModal(null)
  }

  const handleRemoveShells = async () => {
    if (!currentMesh) return
    const res = removeShells(currentMesh, {
      keepLargest: shellsMode === 'keepLargest',
      maxVolume: shellsMode === 'byVolume' ? shellsThreshold : undefined,
      maxTriangles: shellsMode === 'byTriangles' ? Math.round(shellsThreshold) : undefined,
    })
    await applyNewMesh(res.mesh)
    setActiveModal(null)
  }

  const handleMakeSolid = async () => {
    if (!currentMesh) return
    setBusy(true)
    try {
      const w = await getWasm()
      const res = makeSolid(w, currentMesh, { resolution: makeSolidRes })
      await applyNewMesh(res.mesh)
      setActiveModal(null)
    } catch (e) {
      if (e instanceof MakeSolidBudgetError) {
        alert(e.message)
      } else {
        console.error('Make solid error:', e)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleDecimate = async () => {
    if (!currentMesh) return
    setDecimateError(null)
    try {
      const res = await meshClient.decimate(currentMesh, { targetRatio: decimateRatio })
      await applyNewMesh(res.mesh)
      setActiveModal(null)
    } catch (e) {
      if (e instanceof DecimateNonManifoldError) {
        setDecimateError(t('mesh.repairs.openMeshNotice'))
      } else {
        console.error('Decimate error:', e)
      }
    }
  }

  const handleSmooth = async () => {
    if (!currentMesh) return
    const res = smooth(currentMesh, { iterations: smoothIters })
    await applyNewMesh(res.mesh)
    setActiveModal(null)
  }

  const handleLayOnFace = () => {
    if (!currentMesh) return
    const res = layOnFace(currentMesh, 0)
    if (res) {
      onUpdateObject(object.id, {
        transform: {
          ...object.transform,
          rotation: [
            object.transform.rotation[0] + res.rotation[0],
            object.transform.rotation[1] + res.rotation[1],
            object.transform.rotation[2] + res.rotation[2],
          ],
        },
      })
    }
  }

  const handleOpenBestOrientations = () => {
    if (!currentMesh) return
    const candidates = bestOrientations(currentMesh)
    setOrientationCandidates(candidates)
    setActiveModal('bestOrientation')
  }

  const handleApplyOrientation = (c: OrientationSuggestion) => {
    onUpdateObject(object.id, {
      transform: {
        ...object.transform,
        rotation: [
          object.transform.rotation[0] + c.rotation[0],
          object.transform.rotation[1] + c.rotation[1],
          object.transform.rotation[2] + c.rotation[2],
        ],
      },
    })
    setActiveModal(null)
  }

  const handleRevert = async () => {
    if (originMeshId && originMeshId !== meshId) {
      onUpdateObject(object.id, {
        source: {
          ...source,
          meshId: originMeshId,
        },
      })
      setActiveModal(null)
    }
  }

  const handleCheckIntersections = async () => {
    if (!currentMesh) return
    setCheckingIntersections(true)
    setIntersectionProgress(0)
    try {
      const res = await meshClient.findIntersections(
        currentMesh,
        {
          pairCap: 5_000_000,
          onProgress: (f: number) => setIntersectionProgress(Math.round(f * 100)),
        }
      )
      setIntersectionPairs(res.count)
      if (res.pairs.length > 0 && onHighlight) {
        const triSet = new Set<number>()
        for (const [t1, t2] of res.pairs) {
          triSet.add(t1)
          triSet.add(t2)
        }
        onHighlight({ triangles: Array.from(triSet) })
      }
    } catch (e) {
      if (!(e instanceof MeshSupersededError)) {
        console.error('Intersections check error:', e)
      }
    } finally {
      setCheckingIntersections(false)
    }
  }

  const fallbackAnalysis = useMemo<MeshAnalysis | null>(() => {
    if (!health) return null
    return {
      triangles: health.triangles,
      vertices: 0,
      duplicateVertices: 0,
      openEdges: health.openEdges,
      boundaryLoops: [],
      nonManifoldEdges: health.nonManifoldEdges,
      nonManifoldVertices: 0,
      degenerateTriangles: health.degenerate,
      duplicateTriangles: 0,
      inconsistentTriangles: 0,
      isNegativeVolume: health.volume < 0,
      shells: [],
      surfaceArea: (health as unknown as { area?: number }).area ?? 0,
      volume: health.volume,
      isSolid: (health as unknown as { isSolid?: boolean }).isSolid ?? health.closed,
      openEdgeLines: new Float32Array(0),
      nonManifoldEdgeLines: new Float32Array(0),
      degenerateTriIndices: [],
      duplicateTriIndices: [],
      flippedTriIndices: [],
    }
  }, [health])
  const activeAnalysis = analysis ?? fallbackAnalysis
  const isSolid = activeAnalysis?.isSolid ?? false

  return (
    <Section
      title={t('mesh.section', 'Mesh')}
      open={isOpen}
      onOpenChange={onOpenChange}
    >
      {/* 1. Health Summary */}
      <div className="rounded-card border border-border bg-surface-2 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">{t('mesh.health.title', 'Mesh health')}</span>
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              isSolid ? 'text-success-text' : 'text-warn-text'
            }`}
          >
            {isSolid ? (
              <>
                <IconCheck size={14} />
                {t('mesh.health.solid', 'Closed solid')}
              </>
            ) : (
              <>
                <IconAlertTriangle size={14} />
                {t('mesh.health.open', 'Open mesh')}
              </>
            )}
          </span>
        </div>

        {activeAnalysis ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-text-muted">
            <div>
              {t('mesh.health.triangles')}:{' '}
              <span className="font-mono text-text">{activeAnalysis.triangles}</span>
            </div>
            <div>
              {t('mesh.health.vertices')}:{' '}
              <span className="font-mono text-text">{activeAnalysis.vertices}</span>
            </div>
            <div>
              {t('mesh.health.area')}:{' '}
              <span className="font-mono text-text">
                {Math.round(activeAnalysis.surfaceArea)}{' '}
                {unit === 'in' ? 'in²' : 'mm²'}
              </span>
            </div>
            <div>
              {t('mesh.health.volume')}:{' '}
              <span className="font-mono text-text">
                {Math.round(Math.abs(activeAnalysis.volume))}{' '}
                {unit === 'in' ? 'in³' : 'mm³'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted">{t('editor.health.missing')}</div>
        )}

        {/* Details accordion */}
        <div className="pt-1 border-t border-border/50">
          <button
            type="button"
            data-testid="mesh-details-toggle"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer"
          >
            {detailsOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>
              {detailsOpen
                ? t('mesh.health.hideDetails', 'Hide details')
                : t('mesh.health.details', 'Details')}
            </span>
          </button>

          {detailsOpen && activeAnalysis && (
            <div className="mt-2 space-y-1.5 text-xs">
              {/* Boundary loops */}
              <div className="space-y-1">
                <div className="flex justify-between text-text-muted">
                  <span>{t('mesh.health.boundaryLoops')}:</span>
                  <span className="font-mono">{activeAnalysis.boundaryLoops.length}</span>
                </div>
                {activeAnalysis.boundaryLoops.map((loop, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between pl-2 text-[11px] text-text-subtle"
                  >
                    <span>
                      {t('mesh.health.loopItem', {
                        id: idx + 1,
                        perimeter: loop.perimeter.toFixed(1),
                        count: loop.points.length,
                      })}
                    </span>
                    <button
                      type="button"
                      data-testid={`show-loop-${idx}`}
                      onClick={() => {
                        const lines: [number, number, number][][] = []
                        for (let i = 0; i < loop.points.length; i++) {
                          lines.push([loop.points[i], loop.points[(i + 1) % loop.points.length]])
                        }
                        onHighlight?.({ lines })
                      }}
                      className="inline-flex items-center gap-0.5 text-accent hover:underline cursor-pointer"
                    >
                      <IconEye size={12} />
                      {t('mesh.health.show')}
                    </button>
                  </div>
                ))}
              </div>

              {/* Non-manifold edges */}
              {activeAnalysis.nonManifoldEdges > 0 && (
                <div className="flex items-center justify-between text-warn-text">
                  <span>
                    {t('mesh.health.nonManifoldEdges')}: {activeAnalysis.nonManifoldEdges}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const lines: [number, number, number][][] = []
                      const arr = activeAnalysis.nonManifoldEdgeLines
                      for (let i = 0; i < arr.length; i += 6) {
                        lines.push([
                          [arr[i], arr[i + 1], arr[i + 2]],
                          [arr[i + 3], arr[i + 4], arr[i + 5]],
                        ])
                      }
                      onHighlight?.({ lines })
                    }}
                    className="inline-flex items-center gap-0.5 text-accent hover:underline cursor-pointer text-[11px]"
                  >
                    <IconEye size={12} />
                    {t('mesh.health.show')}
                  </button>
                </div>
              )}

              {/* Degenerate & duplicate */}
              {(activeAnalysis.degenerateTriangles > 0 || activeAnalysis.duplicateTriangles > 0) && (
                <div className="text-warn-text">
                  {t('mesh.health.degenerate')}: {activeAnalysis.degenerateTriangles},{' '}
                  {t('mesh.health.duplicates')}: {activeAnalysis.duplicateTriangles}
                </div>
              )}

              {/* Shells */}
              <div className="space-y-1">
                <div className="flex justify-between text-text-muted">
                  <span>{t('mesh.health.shells')}:</span>
                  <span className="font-mono">{activeAnalysis.shells.length}</span>
                </div>
                {activeAnalysis.shells.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between pl-2 text-[11px] text-text-subtle"
                  >
                    <span>
                      {t('mesh.health.shellItem', {
                        id: idx + 1,
                        count: s.triangleCount,
                        volume: Math.round(s.volume),
                      })}
                    </span>
                    <button
                      type="button"
                      data-testid={`show-shell-${idx}`}
                      onClick={() => onHighlight?.({ lines: [] })}
                      className="inline-flex items-center gap-0.5 text-accent hover:underline cursor-pointer"
                    >
                      <IconEye size={12} />
                      {t('mesh.health.show')}
                    </button>
                  </div>
                ))}
              </div>

              {/* Intersections */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-text-muted">{t('mesh.health.intersections')}:</span>
                {intersectionPairs === null ? (
                  <Button
                    compact
                    disabled={checkingIntersections}
                    onClick={handleCheckIntersections}
                  >
                    {checkingIntersections
                      ? `${t('mesh.health.checkingIntersections')} ${intersectionProgress}%`
                      : t('mesh.health.checkIntersections')}
                  </Button>
                ) : (
                  <span className="text-text font-mono text-[11px]">
                    {t('mesh.health.intersectionsFound', { count: intersectionPairs })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Auto Repair & Report */}
      <div className="space-y-1.5">
        <Button
          primary
          className="w-full justify-center"
          disabled={busy}
          onClick={handleAutoRepair}
          data-testid="mesh-auto-repair-btn"
        >
          <IconWand size={15} />
          <span>{busy ? t('mesh.repairs.autoRepairRunning') : t('mesh.repairs.autoRepair')}</span>
        </Button>

        {autoRepairReport && (
          <div
            data-testid="auto-repair-report"
            className="rounded-card border border-border bg-surface-2 p-2.5 text-xs space-y-1"
          >
            <div className="font-semibold text-text">
              {autoRepairReport.isSolid
                ? t('mesh.repairs.autoRepairSuccess', {
                    fixes: `${autoRepairReport.welds} welds, ${autoRepairReport.degenerates} degens, ${autoRepairReport.flipped} flipped, ${autoRepairReport.holesFilled} holes, ${autoRepairReport.shellsRemoved} shells`,
                  })
                : t('mesh.repairs.autoRepairLeftovers')}
            </div>
            {!autoRepairReport.isSolid && (
              <Button
                compact
                onClick={() => setActiveModal('makeSolid')}
                className="mt-1 w-full justify-center text-accent"
              >
                {t('mesh.repairs.makeSolid')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 3. Individual Repair Actions */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-text-subtle uppercase tracking-wider">
          {t('mesh.repairs.title', 'Repairs')}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            compact
            onClick={() => setActiveModal('weld')}
            data-testid="repair-weld-btn"
          >
            {t('mesh.repairs.weld')}
          </Button>

          <Button
            compact
            onClick={handleRemoveDegenerate}
            data-testid="repair-remove-degenerate-btn"
          >
            {t('mesh.repairs.removeDegenerate')}
          </Button>

          <Button
            compact
            onClick={handleFixOrientation}
            data-testid="repair-fix-orientation-btn"
          >
            {t('mesh.repairs.fixOrientation')}
          </Button>

          <Button
            compact
            onClick={() => setActiveModal('fillHoles')}
            data-testid="repair-fill-holes-btn"
          >
            {t('mesh.repairs.fillHoles')}
          </Button>

          <Button
            compact
            onClick={() => setActiveModal('shells')}
            data-testid="repair-remove-shells-btn"
          >
            {t('mesh.repairs.removeShells')}
          </Button>

          <Button
            compact
            onClick={() => setActiveModal('makeSolid')}
            data-testid="repair-make-solid-btn"
          >
            {t('mesh.repairs.makeSolid')}
          </Button>
        </div>

        {/* Decimate & Smooth */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button
            compact
            onClick={() => setActiveModal('decimate')}
            data-testid="repair-decimate-btn"
          >
            {t('mesh.repairs.decimate')}
          </Button>

          <Button
            compact
            onClick={() => setActiveModal('smooth')}
            data-testid="repair-smooth-btn"
          >
            {t('mesh.repairs.smooth')}
          </Button>
        </div>

        {/* Orientation Actions */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button
            compact
            onClick={handleLayOnFace}
            data-testid="mesh-lay-on-face-btn"
          >
            {t('mesh.repairs.layOnFace')}
          </Button>

          <Button
            compact
            onClick={handleOpenBestOrientations}
            data-testid="mesh-best-orientation-btn"
          >
            {t('mesh.repairs.bestOrientation')}
          </Button>
        </div>

        {/* Revert to imported */}
        {originMeshId && originMeshId !== meshId && (
          <div className="pt-2">
            <Button
              compact
              className="w-full text-error-text border-error-border hover:bg-error-bg"
              onClick={() => setActiveModal('revert')}
              data-testid="mesh-revert-btn"
            >
              <IconArrowBackUp size={14} />
              <span>{t('mesh.repairs.revert')}</span>
            </Button>
          </div>
        )}
      </div>

      {/* --- Modals and Dialogs --- */}

      {/* Weld Dialog */}
      {activeModal === 'weld' && (
        <ConfirmDialog
          title={t('mesh.repairs.weld')}
          confirmLabel={t('mesh.repairs.apply')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleWeld}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-3 py-2">
            <LengthField
              label={t('mesh.repairs.weldTolerance')}
              value={weldTol}
              min={0.00001}
              max={10}
              step={0.001}
              onChange={setWeldTol}
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Fill Holes Dialog */}
      {activeModal === 'fillHoles' && (
        <ConfirmDialog
          title={t('mesh.repairs.fillHoles')}
          confirmLabel={t('mesh.repairs.apply')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleFillHoles}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-3 py-2">
            <SegmentedControl
              ariaLabel={t('mesh.repairs.fillHolesMode')}
              options={[
                { value: 'flat', label: t('mesh.repairs.modeFlat') },
                { value: 'smooth', label: t('mesh.repairs.modeSmooth') },
              ]}
              value={fillMode}
              onChange={(v) => setFillMode(v as 'flat' | 'smooth')}
            />
            <LengthField
              label={t('mesh.repairs.maxPerimeter')}
              value={fillMaxPerimeter}
              min={0.1}
              max={1000}
              step={1}
              onChange={setFillMaxPerimeter}
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Remove Shells Dialog */}
      {activeModal === 'shells' && (
        <ConfirmDialog
          title={t('mesh.repairs.removeShells')}
          confirmLabel={t('mesh.repairs.apply')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleRemoveShells}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-3 py-2">
            <SegmentedControl
              ariaLabel={t('mesh.repairs.shellsMode')}
              options={[
                { value: 'keepLargest', label: t('mesh.repairs.keepLargest') },
                { value: 'byVolume', label: t('mesh.repairs.byVolume') },
                { value: 'byTriangles', label: t('mesh.repairs.byTriangles') },
              ]}
              value={shellsMode}
              onChange={(v) => setShellsMode(v as any)}
            />
            {shellsMode !== 'keepLargest' && (
              <NumberField
                label={
                  shellsMode === 'byVolume'
                    ? t('mesh.repairs.maxVolume')
                    : t('mesh.repairs.maxTriangles')
                }
                value={shellsThreshold}
                min={0}
                max={100_000}
                step={shellsMode === 'byVolume' ? 1 : 10}
                onChange={setShellsThreshold}
              />
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Make Solid Confirmation Dialog */}
      {activeModal === 'makeSolid' && (
        <ConfirmDialog
          title={t('mesh.repairs.makeSolid')}
          confirmLabel={t('mesh.repairs.confirmMakeSolid')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleMakeSolid}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-3 py-2 text-xs">
            <p className="text-text-muted">{t('mesh.repairs.makeSolidWarning')}</p>
            <LengthField
              label={t('mesh.repairs.resolution')}
              value={makeSolidRes}
              min={0.1}
              max={10}
              step={0.1}
              onChange={setMakeSolidRes}
            />
            {meshData && (
              <div className="text-[11px] text-text-subtle">
                {(() => {
                  const dx = meshData.max[0] - meshData.min[0] + 4 * makeSolidRes
                  const dy = meshData.max[1] - meshData.min[1] + 4 * makeSolidRes
                  const dz = meshData.max[2] - meshData.min[2] + 4 * makeSolidRes
                  const nx = Math.ceil(dx / makeSolidRes)
                  const ny = Math.ceil(dy / makeSolidRes)
                  const nz = Math.ceil(dz / makeSolidRes)
                  const cells = nx * ny * nz
                  const mb = ((cells * 4) / (1024 * 1024)).toFixed(1)
                  return t('mesh.repairs.estimatedGrid', { cells: cells.toLocaleString(), mb })
                })()}
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Decimate Dialog */}
      {activeModal === 'decimate' && (
        <ConfirmDialog
          title={t('mesh.repairs.decimate')}
          confirmLabel={t('mesh.repairs.apply')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleDecimate}
          onCancel={() => {
            setActiveModal(null)
            setDecimateError(null)
          }}
        >
          <div className="space-y-3 py-2 text-xs">
            <NumberField
              label={t('mesh.repairs.targetRatio')}
              value={decimateRatio}
              min={0.01}
              max={0.99}
              step={0.05}
              onChange={setDecimateRatio}
            />
            {analysis && (
              <div className="text-[11px] text-text-subtle">
                {t('mesh.repairs.targetTriangles')}:{' '}
                {Math.round(analysis.triangles * decimateRatio)}
              </div>
            )}
            {decimateError && (
              <div className="text-error-text text-xs">{decimateError}</div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Smooth Dialog */}
      {activeModal === 'smooth' && (
        <ConfirmDialog
          title={t('mesh.repairs.smooth')}
          confirmLabel={t('mesh.repairs.apply')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleSmooth}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-3 py-2">
            <NumberField
              label={t('mesh.repairs.iterations')}
              value={smoothIters}
              min={1}
              max={50}
              step={1}
              onChange={setSmoothIters}
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Best Orientations Dialog */}
      {activeModal === 'bestOrientation' && (
        <ConfirmDialog
          title={t('mesh.repairs.bestOrientation')}
          confirmLabel={t('common.close')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => setActiveModal(null)}
          onCancel={() => setActiveModal(null)}
        >
          <div className="space-y-2 py-2">
            {orientationCandidates.length === 0 ? (
              <div className="text-xs text-text-muted">{t('mesh.repairs.findBest')}</div>
            ) : (
              orientationCandidates.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded border border-border p-2 space-y-1 bg-surface-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text">#{idx + 1}</span>
                    <Button
                      compact
                      primary
                      onClick={() => handleApplyOrientation(c)}
                    >
                      {t('mesh.repairs.apply')}
                    </Button>
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {t('mesh.repairs.score', {
                      score: c.score.toFixed(1),
                      overhang: c.overhangArea.toFixed(1),
                      height: c.height.toFixed(1),
                      contact: c.contactArea.toFixed(1),
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Revert Confirmation */}
      {activeModal === 'revert' && (
        <ConfirmDialog
          title={t('mesh.repairs.revert')}
          confirmLabel={t('mesh.repairs.revert')}
          cancelLabel={t('common.cancel')}
          danger
          onConfirm={handleRevert}
          onCancel={() => setActiveModal(null)}
        >
          <p className="text-xs text-text-muted py-2">
            {t('mesh.repairs.revertConfirm')}
          </p>
        </ConfirmDialog>
      )}
    </Section>
  )
}
