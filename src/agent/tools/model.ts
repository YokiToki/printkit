import { CUSTOM_PRINTER, printerById } from '../../data/printers'
import { arrange } from '../../export/arrange'
import { layout } from '../../export/build'
import { bedOf, defaultExportSettings, usableBed, type ExportSettings } from '../../export/settings'
import { modelBounds, type PartMesh } from '../../geometry/model'
import { translateEn, translateRackSettingEn, type ValidationIssue } from '../i18nEn'
import { errResult, okResult, type AgentTool } from '../registry'
import { validateSchema, type JsonSchemaObject } from '../schema'
import {
  noActiveModeError,
  type AgentModeHandle,
  type AgentModelSnapshot,
  type AgentToolEnvironment,
} from './types'

export const MODEL_WAIT_TIMEOUT_MS = 20_000
export const MODEL_POLL_INTERVAL_MS = 25

const emptySchema: JsonSchemaObject = {
  type: 'object',
  description: 'No arguments',
  properties: {},
  additionalProperties: false,
}

export interface PartSummary {
  label: string
  bbox: {
    min: [number, number, number]
    max: [number, number, number]
    size: [number, number, number]
  }
  volumeMm3: number
  triangles: number
  oversize: boolean
}

export interface PlateItemSummary {
  label: string
  x: number
  y: number
  size: [number, number, number]
  rotated: boolean
}

export interface PlateSummary {
  plate: number
  overflow: boolean
  items: PlateItemSummary[]
}

export interface OverflowPartSummary {
  label: string
  size: [number, number, number]
  usableBed: { x: number; y: number; z: number }
}

async function waitForModelReady(
  handle: AgentModeHandle,
  timeoutMs: number,
  pollMs: number,
  signal?: AbortSignal,
): Promise<{ ready: boolean; snapshot: AgentModelSnapshot }> {
  const initial = handle.getModel()
  if (!initial.pending && !initial.busy) {
    return { ready: true, snapshot: initial }
  }
  if (signal?.aborted || timeoutMs <= 0) {
    return { ready: false, snapshot: initial }
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearInterval(pollTimer)
      unsubscribe?.()
      signal?.removeEventListener('abort', onAbort)
      const latest = handle.getModel()
      resolve({ ready: !latest.pending && !latest.busy, snapshot: latest })
    }
    const check = () => {
      const cur = handle.getModel()
      if (!cur.pending && !cur.busy) {
        finish()
      }
    }
    const onAbort = () => finish()

    const unsubscribe = handle.subscribeModel?.(check)
    const pollTimer = setInterval(check, Math.max(5, pollMs))
    const timeoutTimer = setTimeout(finish, timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function collectIssues(
  handle: AgentModeHandle,
  snapshot: AgentModelSnapshot,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const base = handle.descriptor.validate(handle.getState())
  const errors = [...base.errors]
  const warnings = [...base.warnings]

  const rack = snapshot.model?.rack
  if (rack?.error && !errors.some((e) => e.key === rack.error)) {
    errors.push({
      key: rack.error,
      message:
        rack.excess !== undefined
          ? translateEn(rack.error, { excess: `${rack.excess.toFixed(2)} mm` })
          : translateEn(rack.error),
    })
  }
  if (rack?.warnings) {
    for (const w of rack.warnings) {
      if (!warnings.some((x) => x.key === w.key && x.field === w.setting)) {
        warnings.push({
          field: w.setting,
          key: w.key,
          message: translateEn(w.key, {
            setting: translateRackSettingEn(w.setting),
          }),
        })
      }
    }
  }
  const kcError = snapshot.model?.keychain?.error
  if (kcError && !errors.some((e) => e.key === kcError)) {
    errors.push({ key: kcError, message: translateEn(kcError) })
  }
  if (
    snapshot.error &&
    !errors.some((e) => e.key === snapshot.error || e.message === snapshot.error)
  ) {
    errors.push({ key: snapshot.error, message: translateEn(snapshot.error) })
  }

  return { errors, warnings }
}

function buildPlateArrangement(
  rawParts: PartMesh[],
  sheetLayout: boolean,
  settings: ExportSettings,
) {
  const preset =
    settings.printerId === CUSTOM_PRINTER ? undefined : printerById(settings.printerId)
  const bed = bedOf(settings)
  const area = usableBed(settings)
  const printer = {
    id: settings.printerId,
    name: preset ? preset.name : 'Custom',
    bed,
  }

  if (rawParts.length === 0) {
    return {
      printer,
      usableBed: area,
      plates: [] as PlateSummary[],
      overflow: [] as OverflowPartSummary[],
    }
  }

  const hasVertices = rawParts.every(
    (p) => p.mesh.numProp >= 3 && p.mesh.vertProperties.length >= p.mesh.numProp,
  )

  const baseSizes: [number, number, number][] = rawParts.map((p) => [
    p.mesh.max[0] - p.mesh.min[0],
    p.mesh.max[1] - p.mesh.min[1],
    p.mesh.max[2] - p.mesh.min[2],
  ])

  const arrangedPlates = hasVertices
    ? layout(rawParts, settings, sheetLayout).plates
    : arrange(
        baseSizes.map((s) => ({ w: s[0], h: s[1] })),
        { x: area.x, y: area.y },
        settings.gap,
      )

  const overflowSet = new Set<number>()
  const plates: PlateSummary[] = arrangedPlates.map((pl, k) => {
    let plateOverflows = pl.overflow
    const items: PlateItemSummary[] = pl.items.map((it) => {
      const sz = baseSizes[it.index]
      const w = it.rotated ? sz[1] : sz[0]
      const d = it.rotated ? sz[0] : sz[1]
      const h = sz[2]
      const tooTall = h > area.z + 1e-9
      if (pl.overflow || tooTall || rawParts[it.index].oversize) {
        overflowSet.add(it.index)
        plateOverflows = true
      }
      return {
        label: rawParts[it.index].label,
        x: it.x,
        y: it.y,
        size: [w, d, h],
        rotated: it.rotated,
      }
    })
    return {
      plate: k + 1,
      overflow: plateOverflows,
      items,
    }
  })

  for (let i = 0; i < rawParts.length; i++) {
    const [w, d, h] = baseSizes[i]
    const fitsXY =
      (w <= area.x + 1e-9 && d <= area.y + 1e-9) ||
      (d <= area.x + 1e-9 && w <= area.y + 1e-9)
    const fitsZ = h <= area.z + 1e-9
    if (!fitsXY || !fitsZ || rawParts[i].oversize) {
      overflowSet.add(i)
    }
  }

  const overflow: OverflowPartSummary[] = Array.from(overflowSet)
    .sort((a, b) => a - b)
    .map((idx) => ({
      label: rawParts[idx].label,
      size: baseSizes[idx],
      usableBed: area,
    }))

  return {
    printer,
    usableBed: area,
    plates,
    overflow,
  }
}

export function createGetModelInfoTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'get_model_info',
    description:
      'Wait for the current 3D model build to finish (up to 20 s) and return part bounding boxes, volumes (mm^3), triangle counts, validation errors/warnings, and print plate arrangement without raw mesh data.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    async run(input = {}, ctx) {
      const finishJob = env.onToolStart?.('get_model_info', 'get_model_info')
      try {
        const handle = env.getModeHandle()
        if (!handle) {
          env.onToolFinish?.({ tool: 'get_model_info', summary: 'no_active_mode', ok: false })
          return noActiveModeError()
        }
        const issues = validateSchema(input ?? {}, emptySchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'get_model_info', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }

        const timeoutMs = env.modelTimeoutMs ?? MODEL_WAIT_TIMEOUT_MS
        const pollMs = env.modelPollMs ?? MODEL_POLL_INTERVAL_MS
        const { ready, snapshot } = await waitForModelReady(handle, timeoutMs, pollMs, ctx.signal)
        const { errors, warnings } = collectIssues(handle, snapshot)
        const exportSettings = env.getExportSettings?.() ?? defaultExportSettings

        const rawParts = ready && snapshot.model ? snapshot.model.parts : []
        const parts: PartSummary[] = rawParts.map((p) => {
          const min: [number, number, number] = [p.mesh.min[0], p.mesh.min[1], p.mesh.min[2]]
          const max: [number, number, number] = [p.mesh.max[0], p.mesh.max[1], p.mesh.max[2]]
          const size: [number, number, number] = [
            max[0] - min[0],
            max[1] - min[1],
            max[2] - min[2],
          ]
          return {
            label: p.label,
            bbox: { min, max, size },
            volumeMm3: p.mesh.volume,
            triangles: Math.floor(p.mesh.triVerts.length / 3),
            oversize: Boolean(p.oversize),
          }
        })

        const bounds =
          rawParts.length > 0
            ? modelBounds({ parts: rawParts })
            : {
                min: [0, 0, 0] as [number, number, number],
                max: [0, 0, 0] as [number, number, number],
              }
        const totalSize: [number, number, number] = [
          bounds.max[0] - bounds.min[0],
          bounds.max[1] - bounds.min[1],
          bounds.max[2] - bounds.min[2],
        ]
        const total = {
          partCount: parts.length,
          bbox: { min: bounds.min, max: bounds.max, size: totalSize },
          volumeMm3: parts.reduce((sum, p) => sum + p.volumeMm3, 0),
          triangles: parts.reduce((sum, p) => sum + p.triangles, 0),
        }

        const plate = buildPlateArrangement(
          rawParts,
          Boolean(snapshot.model?.sheetLayout),
          exportSettings,
        )

        env.onToolFinish?.({
          tool: 'get_model_info',
          summary: ready
            ? `${handle.descriptor.mode}: ${parts.length} part(s)`
            : `${handle.descriptor.mode}: pending`,
          ok: true,
        })

        return okResult({
          ready,
          unit: 'mm' as const,
          parts,
          total,
          errors,
          warnings,
          plate,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}
