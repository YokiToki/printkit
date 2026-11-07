import { useState, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { Button } from '../../../ui/Button'
import type { CutConnectorConfig, CutConnectorKind, ConnectorReport } from '../../../geometry/cut/connectors'
import type { Vec2, Polygon } from '../../../geometry/cut/place'
import { placeConnectors, poleOfInaccessibility } from '../../../geometry/cut/place'
import { HOLE_PRESETS } from '../../../geometry/connectorSpec'
import { IconPlus, IconTrash, IconAlertCircle } from '@tabler/icons-react'

export interface ConnectorEditorProps {
  config: CutConnectorConfig
  onChange: (next: CutConnectorConfig) => void
  polygons?: Polygon[]
  reports?: ConnectorReport[]
}

export function ConnectorEditor({
  config,
  onChange,
  polygons = [],
  reports = [],
}: ConnectorEditorProps) {
  const { t } = useTranslation()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const svgId = useId()

  const kindOptions: { value: CutConnectorKind; label: string }[] = [
    { value: 'pegs', label: t('cut.connector.pegs') },
    { value: 'pins', label: t('cut.connector.pins') },
    { value: 'magnets', label: t('cut.connector.magnets') },
    { value: 'dovetail', label: t('cut.connector.dovetail') },
  ]

  const handleKindChange = (nextKind: CutConnectorKind) => {
    let d = config.diameter ?? 4
    let dep = config.depth ?? 6
    if (nextKind === 'pegs') {
      d = 4; dep = 8
    } else if (nextKind === 'pins') {
      d = 2; dep = 6
    } else if (nextKind === 'magnets') {
      d = 6; dep = 2
    } else if (nextKind === 'dovetail') {
      dep = 4
    }
    onChange({
      ...config,
      kind: nextKind,
      diameter: d,
      depth: dep,
    })
  }

  const handlePresetSelect = (presetId: string) => {
    const found = HOLE_PRESETS.find((p) => p.id === presetId)
    if (found) {
      onChange({
        ...config,
        diameter: found.diameter,
        depth: found.depth,
      })
    }
  }

  // Calculate 2D bounds of section polygons
  let minU = -20, maxU = 20, minV = -20, maxV = 20
  if (polygons.length > 0) {
    minU = Infinity; maxU = -Infinity; minV = Infinity; maxV = -Infinity
    for (const poly of polygons) {
      for (const [u, v] of poly) {
        if (u < minU) minU = u
        if (u > maxU) maxU = u
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
    }
  }
  const pad = 5
  const viewWidth = Math.max(10, maxU - minU + pad * 2)
  const viewHeight = Math.max(10, maxV - minV + pad * 2)
  const viewBox = `${minU - pad} ${-(maxV + pad)} ${viewWidth} ${viewHeight}`

  const handleAutoPlace = (count: number) => {
    if (polygons.length === 0) return
    const placed = placeConnectors(polygons, {
      count,
      margin: 4,
    })
    onChange({
      ...config,
      positions: placed.map((p) => p.point),
    })
  }

  const handleAddMarker = () => {
    let newPos: Vec2 = [0, 0]
    if (polygons.length > 0) {
      const pole = poleOfInaccessibility(polygons)
      newPos = [pole.point[0], pole.point[1]]
    }
    onChange({
      ...config,
      positions: [...config.positions, newPos],
    })
    setSelectedIndex(config.positions.length)
  }

  const handleRemoveMarker = (index: number) => {
    const next = config.positions.filter((_, i) => i !== index)
    onChange({
      ...config,
      positions: next,
    })
    setSelectedIndex(null)
  }

  const handleSvgPointerDown = (index: number, e: React.PointerEvent) => {
    e.stopPropagation()
    setSelectedIndex(index)
    setDraggingIndex(index)
    try {
      (e.target as any).setPointerCapture?.(e.pointerId)
    } catch {
      // jsdom or unsupported
    }
  }

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggingIndex === null) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    // Convert client coordinates to SVG coordinates
    const scaleX = viewWidth / rect.width
    const scaleY = viewHeight / rect.height
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const u = minU - pad + clientX * scaleX
    const v = -( -(maxV + pad) + clientY * scaleY )

    const updated = [...config.positions]
    updated[draggingIndex] = [u, v]
    onChange({
      ...config,
      positions: updated,
    })
  }

  const handleSvgPointerUp = (e: React.PointerEvent) => {
    if (draggingIndex !== null) {
      setDraggingIndex(null)
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {
        // pointer capture release
      }
    }
  }

  const issuesByIndex = new Map<number, string>()
  for (const rep of reports) {
    if (!rep.valid && rep.issue) {
      issuesByIndex.set(rep.index, `cut.connector.${rep.issue}`)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-surface-2 rounded-md border border-border" data-testid="connector-editor">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-text-primary">{t('cut.connector.title')}</label>
      </div>

      <SegmentedControl
        ariaLabel={t('cut.connector.title')}
        value={config.kind}
        options={kindOptions}
        onChange={(val) => handleKindChange(val as CutConnectorKind)}
      />

      {/* Preset options */}
      {config.kind !== 'dovetail' && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-text-muted">{t('cut.connector.preset')}:</span>
          {HOLE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="text-xs px-2 py-0.5 rounded bg-surface-1 hover:bg-surface-3 border border-border text-text-secondary"
              onClick={() => handlePresetSelect(p.id)}
            >
              {t(`connector.presets.${p.id}`, p.id)}
            </button>
          ))}
        </div>
      )}

      {/* Parameters */}
      <div className="grid grid-cols-2 gap-2">
        {config.kind !== 'dovetail' ? (
          <>
            <LengthField
              label={t('cut.connector.diameter')}
              value={config.diameter ?? 4}
              onChange={(d) => onChange({ ...config, diameter: d })}
              min={0.5}
              max={50}
              step={0.5}
            />
            <LengthField
              label={t('cut.connector.depth')}
              value={config.depth ?? 6}
              onChange={(depth) => onChange({ ...config, depth })}
              min={1}
              max={50}
              step={0.5}
            />
          </>
        ) : (
          <>
            <LengthField
              label={t('cut.connector.neck')}
              value={config.neck ?? 4}
              onChange={(neck) => onChange({ ...config, neck })}
              min={1}
              max={30}
              step={0.5}
            />
            <LengthField
              label={t('cut.connector.tip')}
              value={config.tip ?? 8}
              onChange={(tip) => onChange({ ...config, tip })}
              min={1}
              max={30}
              step={0.5}
            />
            <LengthField
              label={t('cut.connector.depth')}
              value={config.depth ?? 4}
              onChange={(depth) => onChange({ ...config, depth })}
              min={1}
              max={20}
              step={0.5}
            />
          </>
        )}
        <LengthField
          label={t('cut.connector.clearance')}
          value={config.clearance ?? 0.2}
          onChange={(clearance) => onChange({ ...config, clearance })}
          min={0.05}
          max={1.5}
          step={0.05}
        />
        <NumberField
          label={t('cut.connector.count')}
          value={config.positions.length}
          onChange={(count) => handleAutoPlace(Math.max(1, count))}
          min={1}
          max={20}
          step={1}
        />
      </div>

      {/* 2D Preview of Section and Draggable Markers */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{t('cut.connector.sectionPreview')}</span>
          <div className="flex items-center gap-1">
            <Button compact onClick={handleAddMarker} data-testid="btn-add-connector">
              <IconPlus size={14} className="mr-1" />
              {t('cut.connector.add')}
            </Button>
            {selectedIndex !== null && (
              <Button
                compact
                onClick={() => handleRemoveMarker(selectedIndex)}
                data-testid="btn-remove-connector"
              >
                <IconTrash size={14} className="text-danger" />
              </Button>
            )}
          </div>
        </div>

        <div className="relative border border-border bg-surface-base rounded overflow-hidden h-36 flex items-center justify-center">
          <svg
            id={svgId}
            viewBox={viewBox}
            className="w-full h-full cursor-crosshair select-none"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
          >
            {/* Cut section polygons */}
            {polygons.map((poly, pIdx) => {
              const pointsStr = poly.map(([u, v]) => `${u},${-v}`).join(' ')
              return (
                <polygon
                  key={pIdx}
                  points={pointsStr}
                  fill="var(--color-surface-2)"
                  stroke="var(--color-border-focus)"
                  strokeWidth={0.5}
                />
              )
            })}

            {/* Connector markers */}
            {config.positions.map(([u, v], idx) => {
              const hasIssue = issuesByIndex.has(idx)
              const isSelected = selectedIndex === idx
              const radius = Math.max(1, (config.diameter ?? 4) / 2)

              return (
                <g key={idx} className="cursor-move">
                  <circle
                    cx={u}
                    cy={-v}
                    r={radius}
                    fill={hasIssue ? 'rgba(239, 68, 68, 0.4)' : isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(34, 197, 94, 0.4)'}
                    stroke={hasIssue ? '#ef4444' : isSelected ? '#3b82f6' : '#22c55e'}
                    strokeWidth={isSelected ? 1.0 : 0.6}
                    onPointerDown={(e) => handleSvgPointerDown(idx, e)}
                    data-testid={`connector-marker-${idx}`}
                  />
                  <text
                    x={u}
                    y={-v}
                    fontSize={Math.max(2, radius)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={hasIssue ? '#ef4444' : '#ffffff'}
                    pointerEvents="none"
                  >
                    {idx + 1}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Reported issues list */}
      {reports.some((r) => !r.valid) && (
        <div className="flex flex-col gap-1 p-2 bg-danger-bg text-danger text-xs rounded border border-danger-border" data-testid="connector-issue-list">
          {reports.filter((r) => !r.valid).map((r) => (
            <div key={r.index} className="flex items-center gap-1.5">
              <IconAlertCircle size={14} className="shrink-0" />
              <span>
                #{r.index + 1}: {r.issue ? t(`cut.connector.${r.issue}`) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
