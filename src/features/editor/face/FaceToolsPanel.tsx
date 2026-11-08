import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconVector, IconLine, IconSettings } from '@tabler/icons-react'
import { Section } from '../../../ui/Section'
import { Button } from '../../../ui/Button'
import { Banner } from '../../../ui/Banner'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import type { MeshTopology } from '../../../geometry/topology'

/** Режим выбора в редакторе. */
export type SelectionMode = 'object' | 'face' | 'edge'

export interface FaceToolsPanelProps {
  mode: 'face' | 'edge'
  topology: MeshTopology | null
  faceSelection: number[]
  edgeSelection: number[]
  /** Порог резкости ребра, градусы. */
  sharpness: number
  onSharpnessChange: (deg: number) => void
  /** Расстояние выдавливания, мм (отрицательное — вдавливание). */
  distance: number
  onDistanceChange: (value: number) => void
  onApplyPushPull: () => void
  breakKind: 'chamfer' | 'fillet'
  onBreakKindChange: (kind: 'chamfer' | 'fillet') => void
  /** Размер фаски или радиус скругления, мм. */
  size: number
  onSizeChange: (value: number) => void
  onApplyEdgeBreak: () => void
  onSketchOnFace: () => void
  onProjectEdges: () => void
  /** Ключ сообщения об ошибке и параметры. */
  error?: string | null
  errorParams?: Record<string, string | number> | null
  /** Сообщение о превышении лимита треугольников. */
  limitError?: string | null
  busy?: boolean
}

/** Человекочитаемое название вида грани. */
function faceKindKey(kind: string): string {
  switch (kind) {
    case 'planar':
      return 'face.kind.planar'
    case 'cylinder':
      return 'face.kind.cylinder'
    case 'cone':
      return 'face.kind.cone'
    case 'sphere':
      return 'face.kind.sphere'
    default:
      return 'face.kind.smooth'
  }
}

/** Человекочитаемое название вида ребра. */
function edgeKindKey(kind: string): string {
  switch (kind) {
    case 'line':
      return 'edge.kind.line'
    case 'circle':
      return 'edge.kind.circle'
    default:
      return 'edge.kind.free'
  }
}

/** Строка состояния: что выбрано и какие у выбранного свойства. */
export function TopologyStatus({
  mode,
  topology,
  faceSelection,
  edgeSelection,
}: {
  mode: 'face' | 'edge'
  topology: MeshTopology | null
  faceSelection: number[]
  edgeSelection: number[]
}) {
  const { t } = useTranslation()
  if (!topology) return null

  if (mode === 'face') {
    const faces = topology.faces.filter((f) => faceSelection.includes(f.id))
    if (faces.length === 0) {
      return (
        <div data-testid="topology-status" className="text-[11px] text-text-muted">
          {t('topology.status.faces', { count: topology.faces.length })}
        </div>
      )
    }
    const area = faces.reduce((sum, f) => sum + f.area, 0)
    const kind = faces.length === 1 ? t(faceKindKey(faces[0].kind)) : t('face.kind.mixed')
    return (
      <div data-testid="topology-status" className="text-[11px] text-text-muted">
        {t('face.status.selected', { count: faces.length })} · {kind} ·{' '}
        {t('face.status.area', { area: area.toFixed(1) })}
      </div>
    )
  }

  const edges = topology.edges.filter((e) => edgeSelection.includes(e.id))
  if (edges.length === 0) {
    return (
      <div data-testid="topology-status" className="text-[11px] text-text-muted">
        {t('topology.status.edges', { count: topology.edges.length })}
      </div>
    )
  }
  const length = edges.reduce((sum, e) => sum + e.length, 0)
  const kind = edges.length === 1 ? t(edgeKindKey(edges[0].kind)) : t('edge.kind.mixed')
  return (
    <div data-testid="topology-status" className="text-[11px] text-text-muted">
      {t('edge.status.selected', { count: edges.length })} · {kind} ·{' '}
      {t('edge.status.length', { length: length.toFixed(1) })}
    </div>
  )
}

/**
 * Панель режимов граней и рёбер: выдавливание, фаска и скругление,
 * эскиз на грани и проекция рёбер.
 */
export function FaceToolsPanel({
  mode,
  topology,
  faceSelection,
  edgeSelection,
  sharpness,
  onSharpnessChange,
  distance,
  onDistanceChange,
  onApplyPushPull,
  breakKind,
  onBreakKindChange,
  size,
  onSizeChange,
  onApplyEdgeBreak,
  onSketchOnFace,
  onProjectEdges,
  error,
  errorParams,
  limitError,
  busy = false,
}: FaceToolsPanelProps) {
  const { t } = useTranslation()
  // Инструментальные секции открыты сразу: пользователь переключил режим
  // и ждёт доступных действий.
  const [faceOpen, setFaceOpen] = useState(true)
  const [edgeOpen, setEdgeOpen] = useState(true)

  return (
    <div data-testid="face-tools-panel" className="flex flex-col">
      {limitError && (
        <div data-testid="face-tools-limit" className="px-3 pt-2">
          <Banner kind="warn">{t(limitError)}</Banner>
        </div>
      )}

      <TopologyStatus
        mode={mode}
        topology={topology}
        faceSelection={faceSelection}
        edgeSelection={edgeSelection}
      />

      {error && (
        <div
          data-testid="face-tools-error"
          className="mt-1 rounded-control border border-error-border bg-error-bg px-2 py-1 text-[11px] text-error-text"
        >
          {t(error, errorParams ?? {})}
        </div>
      )}

      {mode === 'face' ? (
        <Section
          title={t('face.pushPull.title', 'Push / Pull')}
          open={faceOpen}
          onOpenChange={setFaceOpen}
        >
          <div className="flex flex-col gap-2 px-3 pb-3">
            <LengthField
              label={t('face.pushPull.distance', 'Distance')}
              value={distance}
              onChange={onDistanceChange}
              step={0.5}
              min={-1000}
              max={1000}
            />
            <Button
              onClick={onApplyPushPull}
              disabled={faceSelection.length === 0 || busy}
              data-testid="face-apply-pushpull"
              className="w-full"
            >
              {t('face.pushPull.apply', 'Apply')}
            </Button>
            <div className="flex flex-col gap-1">
              <Button
                onClick={onSketchOnFace}
                disabled={faceSelection.length !== 1}
                data-testid="face-sketch-on-face"
                className="w-full"
              >
                <IconVector size={14} />
                {t('face.sketchOnFace', 'Sketch on face')}
              </Button>
              <Button
                onClick={onProjectEdges}
                disabled={faceSelection.length !== 1}
                data-testid="face-project-edges"
                className="w-full"
              >
                <IconLine size={14} />
                {t('face.projectEdges', 'Project edges')}
              </Button>
            </div>
          </div>
        </Section>
      ) : (
        <Section
          title={t('edge.break.title', 'Chamfer / Fillet')}
          open={edgeOpen}
          onOpenChange={setEdgeOpen}
        >
          <div className="flex flex-col gap-2 px-3 pb-3">
            <SegmentedControl
              ariaLabel={t('edge.break.kind', 'Break kind')}
              value={breakKind}
              onChange={onBreakKindChange}
              options={[
                { value: 'chamfer', label: t('edge.break.chamfer', 'Chamfer') },
                { value: 'fillet', label: t('edge.break.fillet', 'Fillet') },
              ]}
            />
            <LengthField
              label={t('edge.break.size', 'Size')}
              value={size}
              onChange={onSizeChange}
              step={0.5}
              min={0.1}
              max={1000}
            />
            <Button
              onClick={onApplyEdgeBreak}
              disabled={edgeSelection.length === 0 || busy}
              data-testid="edge-apply-break"
              className="w-full"
            >
              {t('edge.break.apply', 'Apply')}
            </Button>
          </div>
        </Section>
      )}

      <Section title={t('topology.sharpness.title', 'Edge sharpness')}>
        <div className="px-3 pb-3">
          <NumberField
            label={t('topology.sharpness.angle', 'Angle')}
            value={sharpness}
            onChange={(v) => onSharpnessChange(v)}
            min={5}
            max={120}
            step={1}
            unit="°"
          />
          <p className="mt-1 text-[10px] text-text-subtle">
            {t('topology.sharpness.hint', 'Edges sharper than this angle are treated as feature edges.')}
          </p>
        </div>
      </Section>

      <div className="flex items-center gap-1 px-3 py-2 text-[10px] text-text-subtle">
        <IconSettings size={12} />
        {t('topology.hint', 'Face and edge tools work on the selected object.')}
      </div>
    </div>
  )
}
