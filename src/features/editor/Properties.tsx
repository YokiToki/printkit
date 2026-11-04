import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconLock,
  IconLockOpen,
  IconArrowDownBar,
  IconFocusCentered,
  IconFlipHorizontal,
  IconFlipVertical,
  IconRotate2,
  IconBoxModel,
  IconRotate,
  IconPencil,
  IconTrash,
  IconPlus,
} from '@tabler/icons-react'
import type { EditorObject } from '../../editor/scene'
import {
  boundsOf,
  centerOnBed,
  defaultPrimitiveBounds,
  dropToBed,
  mirror,
  scaleToSize,
  selectionBounds,
  type Bounds3,
} from '../../editor/transform'
import type { MeshData } from '../../geometry/mesh'
import { PRIMITIVE_DESCRIPTORS } from '../../editor/primitives'
import type { MeshHealth } from '../../editor/health'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Section } from '../../ui/Section'
import { formatLength, useUnit } from '../../ui/units'
import { cutoutColorVar } from '../cutout/palette'
import { CUTOUT_COLORS } from '../../geometry/cutout'

export interface PropertiesProps {
  objects: EditorObject[]
  selection: string[]
  onUpdateObject: (id: string, patch: Partial<EditorObject>, mergeKey?: string) => void
  onUpdateTransform: (id: string, newTransform: EditorObject['transform'], mergeKey?: string) => void
  onUpdatePrimitiveParams: (id: string, params: Record<string, number>, mergeKey?: string) => void
  healthMap?: Map<string, MeshHealth>
  meshes?: Record<string, MeshData>
  onEditFeature?: (objectId: string, featureIndex: number) => void
  onDeleteFeature?: (objectId: string, featureIndex: number) => void
  onAddFeature?: (objectId: string, kind: 'extrude' | 'revolve') => void
}

export function Properties({
  objects,
  selection,
  onUpdateObject,
  onUpdateTransform,
  onUpdatePrimitiveParams,
  healthMap,
  meshes,
  onEditFeature,
  onDeleteFeature,
  onAddFeature,
}: PropertiesProps) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const [proportionsLocked, setProportionsLocked] = useState(true)

  const selectedObjects = objects.filter((o) => selection.includes(o.id))

  const getLocalBounds = (o: EditorObject): Bounds3 | undefined => {
    if (o.source.kind === 'primitive') {
      return defaultPrimitiveBounds(o)
    }
    const m = meshes?.[o.id]
    if (m) {
      return { min: m.min, max: m.max }
    }
    return undefined
  }

  // 1. Ничего не выбрано: сводка по всей сцене
  if (selectedObjects.length === 0) {
    const visibleObjects = objects.filter((o) => o.visible)
    const bounds = selectionBounds(visibleObjects, getLocalBounds)
    const dim = (idx: 0 | 1 | 2) =>
      bounds ? formatLength(bounds.max[idx] - bounds.min[idx], unit) : '–'

    return (
      <div data-testid="properties" className="p-4 space-y-4 text-xs text-text-muted select-none">
        <h3 className="font-semibold text-text text-sm">{t('editor.properties.sceneSummary')}</h3>
        <div className="space-y-2">
          <div className="flex justify-between py-1 border-b border-border">
            <span>{t('editor.properties.objectCount')}</span>
            <span className="font-mono text-text">{objects.length}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span>{t('editor.properties.visibleCount')}</span>
            <span className="font-mono text-text">{visibleObjects.length}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span>{t('editor.properties.overallSize')}</span>
            <span className="font-mono text-text">
              {dim(0)} × {dim(1)} × {dim(2)} {t(`units.${unit}`)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // 2. Выбрано несколько объектов: общая трансформация
  if (selectedObjects.length > 1) {
    const bounds = selectionBounds(selectedObjects, getLocalBounds)!
    const sizeX = bounds.max[0] - bounds.min[0]
    const sizeY = bounds.max[1] - bounds.min[1]
    const sizeZ = bounds.max[2] - bounds.min[2]
    const centerX = (bounds.min[0] + bounds.max[0]) / 2
    const centerY = (bounds.min[1] + bounds.max[1]) / 2
    const centerZ = (bounds.min[2] + bounds.max[2]) / 2

    const handleMoveCenter = (axis: 0 | 1 | 2, newVal: number) => {
      const current = axis === 0 ? centerX : axis === 1 ? centerY : centerZ
      const delta = newVal - current
      for (const obj of selectedObjects) {
        const nextPos: [number, number, number] = [...obj.transform.position]
        nextPos[axis] += delta
        onUpdateTransform(obj.id, { ...obj.transform, position: nextPos }, 'multi-pos')
      }
    }

    const handleScaleSize = (axis: 'x' | 'y' | 'z', newSize: number) => {
      for (const obj of selectedObjects) {
        const lb = getLocalBounds(obj)
        const scaled = scaleToSize(obj, axis, newSize, proportionsLocked, lb)
        onUpdateTransform(obj.id, scaled.transform, 'multi-size')
      }
    }

    return (
      <div data-testid="properties" className="p-4 space-y-4 text-xs select-none">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="font-semibold text-text text-sm">
            {t('editor.properties.multipleSelected', { count: selectedObjects.length })}
          </h3>
        </div>

        <Section title={t('editor.properties.transform')}>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <span className="text-text-muted font-medium">{t('editor.properties.position')}</span>
              <div className="grid grid-cols-3 gap-1">
                <LengthField label={t('editor.properties.posX')} value={centerX} min={-5000} max={5000} onChange={(v) => handleMoveCenter(0, v)} />
                <LengthField label={t('editor.properties.posY')} value={centerY} min={-5000} max={5000} onChange={(v) => handleMoveCenter(1, v)} />
                <LengthField label={t('editor.properties.posZ')} value={centerZ} min={-5000} max={5000} onChange={(v) => handleMoveCenter(2, v)} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted font-medium">{t('editor.properties.size')}</span>
                <button
                  type="button"
                  onClick={() => setProportionsLocked(!proportionsLocked)}
                  className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
                  title={proportionsLocked ? t('editor.properties.unlockProportions') : t('editor.properties.lockProportions')}
                >
                  {proportionsLocked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <LengthField label={t('editor.properties.sizeX')} min={0.1} max={5000} value={sizeX} onChange={(v) => handleScaleSize('x', v)} />
                <LengthField label={t('editor.properties.sizeY')} min={0.1} max={5000} value={sizeY} onChange={(v) => handleScaleSize('y', v)} />
                <LengthField label={t('editor.properties.sizeZ')} min={0.1} max={5000} value={sizeZ} onChange={(v) => handleScaleSize('z', v)} />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  for (const obj of selectedObjects) {
                    const dropped = dropToBed(obj, getLocalBounds(obj))
                    onUpdateTransform(obj.id, dropped.transform)
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
              >
                <IconArrowDownBar size={14} />
                <span>{t('editor.properties.dropToBed')}</span>
              </button>
            </div>
          </div>
        </Section>
      </div>
    )
  }

  // 3. Выбран ровно один объект
  const obj = selectedObjects[0]
  const lb = getLocalBounds(obj)
  const bounds: Bounds3 = boundsOf(obj, lb)
  const sizeX = bounds.max[0] - bounds.min[0]
  const sizeY = bounds.max[1] - bounds.min[1]
  const sizeZ = bounds.max[2] - bounds.min[2]
  const health = healthMap?.get(obj.id)

  const handleSizeChange = (axis: 'x' | 'y' | 'z', newSize: number) => {
    const scaled = scaleToSize(obj, axis, newSize, proportionsLocked, lb)
    onUpdateTransform(obj.id, scaled.transform, `scale-${axis}`)
  }

  return (
    <div data-testid="properties" className="p-3 space-y-4 text-xs select-none">
      {/* Name and color */}
      <div className="space-y-2">
        <label className="block text-text-muted font-medium">{t('editor.properties.name')}</label>
        <input
          type="text"
          data-testid="property-name-input"
          value={obj.name}
          onChange={(e) => onUpdateObject(obj.id, { name: e.target.value })}
          className="w-full px-2.5 py-1.5 bg-surface-2 border border-border rounded-md text-text text-xs outline-none focus:border-accent"
        />

        <div className="flex items-center gap-1.5 pt-1">
          {Array.from({ length: CUTOUT_COLORS }, (_, i) => (
            <button
              key={i}
              type="button"
              data-testid={`property-color-${i}`}
              onClick={() => onUpdateObject(obj.id, { color: i })}
              className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                obj.color === i ? 'ring-2 ring-accent scale-110 border-white' : 'border-border hover:scale-105'
              }`}
              style={{ backgroundColor: cutoutColorVar(i) }}
            />
          ))}
        </div>
      </div>

      {/* Transform Section */}
      <Section title={t('editor.properties.transform')}>
        <div className="space-y-3 pt-2">
          {/* Position */}
          <div className="space-y-1">
            <span className="text-text-muted font-medium">{t('editor.properties.position')}</span>
            <div className="grid grid-cols-3 gap-1">
              <LengthField
                label={t('editor.properties.posX')}
                value={obj.transform.position[0]}
                min={-5000}
                max={5000}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, position: [v, obj.transform.position[1], obj.transform.position[2]] },
                    'pos-x'
                  )
                }
              />
              <LengthField
                label={t('editor.properties.posY')}
                value={obj.transform.position[1]}
                min={-5000}
                max={5000}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, position: [obj.transform.position[0], v, obj.transform.position[2]] },
                    'pos-y'
                  )
                }
              />
              <LengthField
                label={t('editor.properties.posZ')}
                value={obj.transform.position[2]}
                min={-5000}
                max={5000}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, position: [obj.transform.position[0], obj.transform.position[1], v] },
                    'pos-z'
                  )
                }
              />
            </div>
          </div>

          {/* Rotation */}
          <div className="space-y-1">
            <span className="text-text-muted font-medium">{t('editor.properties.rotation')}</span>
            <div className="grid grid-cols-3 gap-1">
              <NumberField
                label={t('editor.properties.rotX')}
                value={obj.transform.rotation[0]}
                min={-360}
                max={360}
                step={15}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, rotation: [v, obj.transform.rotation[1], obj.transform.rotation[2]] },
                    'rot-x'
                  )
                }
              />
              <NumberField
                label={t('editor.properties.rotY')}
                value={obj.transform.rotation[1]}
                min={-360}
                max={360}
                step={15}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, rotation: [obj.transform.rotation[0], v, obj.transform.rotation[2]] },
                    'rot-y'
                  )
                }
              />
              <NumberField
                label={t('editor.properties.rotZ')}
                value={obj.transform.rotation[2]}
                min={-360}
                max={360}
                step={15}
                onChange={(v) =>
                  onUpdateTransform(
                    obj.id,
                    { ...obj.transform, rotation: [obj.transform.rotation[0], obj.transform.rotation[1], v] },
                    'rot-z'
                  )
                }
              />
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-text-muted font-medium">{t('editor.properties.size')}</span>
              <button
                type="button"
                data-testid="property-proportion-lock"
                onClick={() => setProportionsLocked(!proportionsLocked)}
                className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
                title={proportionsLocked ? t('editor.properties.unlockProportions') : t('editor.properties.lockProportions')}
              >
                {proportionsLocked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <LengthField label={t('editor.properties.sizeX')} min={0.1} max={5000} value={sizeX} onChange={(v) => handleSizeChange('x', v)} />
              <LengthField label={t('editor.properties.sizeY')} min={0.1} max={5000} value={sizeY} onChange={(v) => handleSizeChange('y', v)} />
              <LengthField label={t('editor.properties.sizeZ')} min={0.1} max={5000} value={sizeZ} onChange={(v) => handleSizeChange('z', v)} />
            </div>
          </div>

          {/* Transform actions: Drop, Center, Mirror, Reset */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              data-testid="property-drop-bed"
              onClick={() => onUpdateTransform(obj.id, dropToBed(obj, lb).transform)}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
            >
              <IconArrowDownBar size={14} />
              <span>{t('editor.properties.dropToBed')}</span>
            </button>
            <button
              type="button"
              data-testid="property-center-bed"
              onClick={() => onUpdateTransform(obj.id, centerOnBed(obj, lb).transform)}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
            >
              <IconFocusCentered size={14} />
              <span>{t('editor.properties.centerOnBed')}</span>
            </button>
            <button
              type="button"
              data-testid="property-mirror-x"
              onClick={() => onUpdateTransform(obj.id, mirror(obj, 'x', lb).object.transform)}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
            >
              <IconFlipHorizontal size={14} />
              <span>{t('editor.properties.mirrorX')}</span>
            </button>
            <button
              type="button"
              data-testid="property-mirror-y"
              onClick={() => onUpdateTransform(obj.id, mirror(obj, 'y', lb).object.transform)}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
            >
              <IconFlipVertical size={14} />
              <span>{t('editor.properties.mirrorY')}</span>
            </button>
            <button
              type="button"
              data-testid="property-reset-transform"
              onClick={() =>
                onUpdateTransform(obj.id, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })
              }
              className="col-span-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-text cursor-pointer border border-border"
            >
              <IconRotate2 size={14} />
              <span>{t('editor.properties.resetTransform')}</span>
            </button>
          </div>
        </div>
      </Section>

      {/* Primitive Source Parameters */}
      {obj.source.kind === 'primitive' && (
        <Section title={t('editor.properties.source')}>
          <div className="space-y-2 pt-2">
            {PRIMITIVE_DESCRIPTORS[obj.source.shape].params.map((p) => (
              <LengthField
                key={p.key}
                label={t(p.labelKey)}
                min={p.min}
                max={p.max ?? 5000}
                step={p.step}
                value={(obj.source as { params: Record<string, number> }).params[p.key] ?? p.default}
                onChange={(v) =>
                  onUpdatePrimitiveParams(
                    obj.id,
                    {
                      ...(obj.source as { params: Record<string, number> }).params,
                      [p.key]: v,
                    },
                    `param-${p.key}`
                  )
                }
              />
            ))}
          </div>
        </Section>
      )}

      {/* Feature List Section */}
      {obj.source.kind === 'feature' && (() => {
        const features = obj.source.features
        return (
          <Section title={t('sketch.properties.features', 'Features')}>
            <div className="space-y-2 pt-2">
              <div className="flex flex-col space-y-1">
                {features.map((feat, idx) => (
                  <div
                    key={feat.id ?? idx}
                    data-testid={`property-feature-row-${idx}`}
                    className="flex items-center justify-between p-2 rounded bg-surface-2 border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {feat.kind === 'extrude' ? (
                        <IconBoxModel size={16} className="text-accent shrink-0" />
                      ) : (
                        <IconRotate size={16} className="text-accent shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-text text-xs truncate">
                          {feat.kind === 'extrude'
                            ? t('sketch.feature.extrude', 'Extrude')
                            : t('sketch.feature.revolve', 'Revolve')}
                        </span>
                        <span className="text-[10px] text-text-muted truncate">
                          {feat.kind === 'extrude'
                            ? `${feat.d1} mm · ${feat.op}`
                            : `${feat.angle}° · ${feat.op}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`property-edit-feature-${idx}`}
                        onClick={() => onEditFeature?.(obj.id, idx)}
                        title={t('common.edit', 'Edit')}
                        className="p-1 hover:text-accent rounded cursor-pointer text-text-muted"
                      >
                        <IconPencil size={14} />
                      </button>
                      {features.length > 1 && (
                        <button
                          type="button"
                          data-testid={`property-delete-feature-${idx}`}
                          onClick={() => onDeleteFeature?.(obj.id, idx)}
                          title={t('common.delete', 'Delete')}
                          className="p-1 hover:text-error-text rounded cursor-pointer text-text-muted"
                        >
                          <IconTrash size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Feature buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  data-testid="property-add-extrude-btn"
                  onClick={() => onAddFeature?.(obj.id, 'extrude')}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-control border border-border bg-surface-2 hover:bg-surface-3 text-text cursor-pointer text-xs font-medium"
                >
                  <IconPlus size={13} />
                  <span>{t('sketch.feature.extrude', 'Extrude')}</span>
                </button>
                <button
                  type="button"
                  data-testid="property-add-revolve-btn"
                  onClick={() => onAddFeature?.(obj.id, 'revolve')}
                  className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-control border border-border bg-surface-2 hover:bg-surface-3 text-text cursor-pointer text-xs font-medium"
                >
                  <IconPlus size={13} />
                  <span>{t('sketch.feature.revolve', 'Revolve')}</span>
                </button>
              </div>
            </div>
          </Section>
        )
      })()}

      {/* Mesh Health block for mesh source */}
      {obj.source.kind === 'mesh' && (
        <Section title={t('editor.properties.meshHealth')}>
          <div className="space-y-1.5 pt-2 font-mono text-[11px]">
            {health ? (
              <>
                <div className="flex justify-between">
                  <span className="text-text-muted">{t('editor.health.status')}</span>
                  <span className={health.closed ? 'text-success-text' : 'text-warn-text font-bold'}>
                    {health.closed ? t('editor.health.closed') : t('editor.health.open')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">{t('editor.health.triangles')}</span>
                  <span className="text-text">{health.triangles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">{t('editor.health.volume')}</span>
                  <span className="text-text">
                    {Math.round(Math.abs(health.volume))} {unit === 'in' ? 'in³' : 'mm³'}
                  </span>
                </div>
                {health.openEdges > 0 && (
                  <div className="flex justify-between text-warn-text">
                    <span>{t('editor.health.openEdges')}</span>
                    <span>{health.openEdges}</span>
                  </div>
                )}
                {health.nonManifoldEdges > 0 && (
                  <div className="flex justify-between text-warn-text">
                    <span>{t('editor.health.nonManifoldEdges')}</span>
                    <span>{health.nonManifoldEdges}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-error-text">{t('editor.health.missing')}</div>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
