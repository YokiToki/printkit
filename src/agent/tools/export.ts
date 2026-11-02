import {
  CUSTOM_PRINTER,
  FILAMENTS,
  NOZZLES,
  PRINTERS,
  PROCESSES,
  printerById,
} from '../../data/printers'
import { buildExport } from '../../export/build'
import {
  bedOf,
  getExportSettings,
  updateExportSettings,
  usableBed,
  type ExportFormat,
  type ExportSettings,
} from '../../export/settings'
import type { PartMesh } from '../../geometry/model'
import { translateEn } from '../i18nEn'
import type { NormalisedDiff } from '../patch'
import { errResult, okResult, type AgentTool } from '../registry'
import { validateSchema, type JsonSchemaObject } from '../schema'
import { DialogCoordinator, type ExportFilePreview } from './confirm'
import { summarizePatch } from './params'
import { noActiveModeError, type AgentToolEnvironment } from './types'

export const VALID_PRINTER_IDS: readonly string[] = [
  ...PRINTERS.map((p) => p.id),
  CUSTOM_PRINTER,
]

/** Нормализует имя файла экспорта по тем же правилам, что `buildExport`: пробелы и разделители путей/разметки заменяются на `_`. */
export function normaliseExportFileName(raw: string): string {
  return raw.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')
}

const emptySchema: JsonSchemaObject = {
  type: 'object',
  description: 'No arguments',
  properties: {},
  additionalProperties: false,
}

const exportSettingsPatchSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Export and printer settings patch (all lengths in mm)',
  properties: {
    format: {
      type: 'string',
      enum: ['stl', '3mf'] as const,
      description: 'Export file format (stl or 3mf)',
    },
    printerId: {
      type: 'string',
      description: `Printer preset identifier (${VALID_PRINTER_IDS.join(', ')})`,
    },
    printer: {
      type: 'string',
      description: 'Alias for printerId',
    },
    customX: {
      type: 'number',
      minimum: 50,
      maximum: 1000,
      description: 'Custom printer bed width X in mm',
    },
    customY: {
      type: 'number',
      minimum: 50,
      maximum: 1000,
      description: 'Custom printer bed depth Y in mm',
    },
    customZ: {
      type: 'number',
      minimum: 50,
      maximum: 1000,
      description: 'Custom printer build height Z in mm',
    },
    margin: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Bed edge margin in mm',
    },
    gap: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Gap between parts on the print plate in mm',
    },
    nozzle: {
      type: 'number',
      minimum: 0.2,
      maximum: 0.8,
      description: 'Nozzle diameter in mm (0.2, 0.4, 0.6, or 0.8)',
    },
    process: {
      type: 'string',
      enum: PROCESSES.map((p) => p.id),
      description: 'Layer height process preset identifier',
    },
    filament: {
      type: 'string',
      enum: FILAMENTS.map((f) => f.id),
      description: 'Filament material preset identifier',
    },
    multi: {
      type: 'string',
      enum: ['one', 'separate'] as const,
      description: 'Multi-part export mode: one combined file or separate files',
    },
    orientation: {
      type: 'string',
      enum: ['auto', 'asis', 'flipped'] as const,
      description: 'Part print orientation on the bed',
    },
    fileName: {
      type: 'string',
      maxLength: 120,
      description: 'Custom base file name (normalised before use; empty string uses automatic mode name)',
    },
  },
  additionalProperties: false,
}

const requestExportSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Request user confirmation to export the current 3D model',
  properties: {
    format: {
      type: 'string',
      enum: ['stl', '3mf'] as const,
      description: 'Optional export format override (stl or 3mf)',
    },
    name: {
      type: 'string',
      maxLength: 120,
      description: 'Optional base file name override (normalised before use)',
    },
  },
  additionalProperties: false,
}

const defaultDialogs = new DialogCoordinator()

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function formatExportSettingsOutput(s: ExportSettings) {
  const preset = s.printerId === CUSTOM_PRINTER ? undefined : printerById(s.printerId)
  return {
    unit: 'mm' as const,
    settings: {
      format: s.format,
      printerId: s.printerId,
      printerName: preset ? preset.name : 'Custom',
      customX: s.customX,
      customY: s.customY,
      customZ: s.customZ,
      margin: s.margin,
      gap: s.gap,
      nozzle: s.nozzle,
      process: s.process,
      filament: s.filament,
      multi: s.multi,
      orientation: s.orientation,
      fileName: s.fileName,
    },
    bed: bedOf(s),
    usableBed: usableBed(s),
    availablePrinters: [
      ...PRINTERS.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z })),
      { id: CUSTOM_PRINTER, name: 'Custom', x: s.customX, y: s.customY, z: s.customZ },
    ],
  }
}

function ensurePartVertices(parts: PartMesh[]): PartMesh[] {
  return parts.map((p) => {
    if (p.mesh.numProp >= 3 && p.mesh.vertProperties.length >= p.mesh.numProp) {
      return p
    }
    const [x0, y0, z0] = p.mesh.min
    const [x1, y1, z1] = p.mesh.max
    const vertProperties = new Float32Array([
      x0, y0, z0,
      x1, y0, z0,
      x1, y1, z0,
      x0, y1, z0,
      x0, y0, z1,
      x1, y0, z1,
      x1, y1, z1,
      x0, y1, z1,
    ])
    const triVerts = new Uint32Array([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
    ])
    return {
      ...p,
      mesh: {
        ...p.mesh,
        vertProperties,
        triVerts,
        numProp: 3,
      },
    }
  })
}

function triggerBrowserDownload(blob: Blob, name: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return
  }
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function createGetExportSettingsTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'get_export_settings',
    description:
      'Get current export and printer settings (format, printer preset, bed dimensions and margin in mm, gap, orientation, and file name).',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    run(input = {}) {
      const finishJob = env.onToolStart?.('get_export_settings', 'get_export_settings')
      try {
        const issues = validateSchema(input ?? {}, emptySchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'get_export_settings', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }
        const s = (env.getExportSettings ?? getExportSettings)()
        env.onToolFinish?.({
          tool: 'get_export_settings',
          summary: `${s.format.toUpperCase()} · ${s.printerId}`,
          ok: true,
        })
        return okResult(formatExportSettingsOutput(s))
      } finally {
        finishJob?.()
      }
    },
  }
}

export function createSetExportSettingsTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'set_export_settings',
    description:
      'Update export and printer settings (format, printerId, custom bed size, margin, gap, orientation, fileName; all lengths in mm).',
    inputSchema: exportSettingsPatchSchema,
    annotations: { consequentialHint: true },
    run(input) {
      const finishJob = env.onToolStart?.('set_export_settings', 'set_export_settings')
      try {
        let candidate: unknown = input
        if (isPlainObject(input) && 'patch' in input && Object.keys(input).length === 1) {
          candidate = input.patch
        }
        const issues = validateSchema(candidate, exportSettingsPatchSchema, { partial: true })
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'set_export_settings', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }

        const rawPatch = candidate as Record<string, unknown>
        const printerCandidate =
          typeof rawPatch.printerId === 'string'
            ? rawPatch.printerId
            : typeof rawPatch.printer === 'string'
              ? rawPatch.printer
              : undefined

        if (printerCandidate !== undefined && !VALID_PRINTER_IDS.includes(printerCandidate)) {
          env.onToolFinish?.({
            tool: 'set_export_settings',
            summary: `unknown_printer (${printerCandidate})`,
            ok: false,
          })
          return errResult('unknown_printer', `Unknown printer "${printerCandidate}".`, {
            validPrinters: VALID_PRINTER_IDS,
          })
        }

        if (
          rawPatch.nozzle !== undefined &&
          !(NOZZLES as readonly number[]).includes(rawPatch.nozzle as number)
        ) {
          const msg = `Invalid nozzle diameter ${String(rawPatch.nozzle)}; expected one of: ${NOZZLES.join(', ')}`
          env.onToolFinish?.({ tool: 'set_export_settings', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', msg, {
            issues: [{ path: '$.nozzle', reason: 'enum', message: msg }],
          })
        }

        const patch: Partial<ExportSettings> = {}
        const normalised: NormalisedDiff[] = []

        if (typeof rawPatch.format === 'string') patch.format = rawPatch.format as ExportFormat
        if (printerCandidate !== undefined) patch.printerId = printerCandidate
        if (typeof rawPatch.customX === 'number') patch.customX = rawPatch.customX
        if (typeof rawPatch.customY === 'number') patch.customY = rawPatch.customY
        if (typeof rawPatch.customZ === 'number') patch.customZ = rawPatch.customZ
        if (typeof rawPatch.margin === 'number') patch.margin = rawPatch.margin
        if (typeof rawPatch.gap === 'number') patch.gap = rawPatch.gap
        if (typeof rawPatch.nozzle === 'number') patch.nozzle = rawPatch.nozzle
        if (typeof rawPatch.process === 'string') patch.process = rawPatch.process
        if (typeof rawPatch.filament === 'string') patch.filament = rawPatch.filament
        if (typeof rawPatch.multi === 'string') patch.multi = rawPatch.multi as 'one' | 'separate'
        if (typeof rawPatch.orientation === 'string') {
          patch.orientation = rawPatch.orientation as ExportSettings['orientation']
        }
        if (typeof rawPatch.fileName === 'string') {
          const clean = normaliseExportFileName(rawPatch.fileName)
          patch.fileName = clean
          if (clean !== rawPatch.fileName) {
            normalised.push({ path: 'fileName', sent: rawPatch.fileName, used: clean })
          }
        }

        const setter = env.setExportSettings ?? updateExportSettings
        setter(patch)
        const updated = (env.getExportSettings ?? getExportSettings)()

        const summary = summarizePatch(patch as Record<string, unknown>, 'export')
        env.onToolFinish?.({
          tool: 'set_export_settings',
          summary,
          ok: true,
        })

        return okResult({
          applied: true,
          ...formatExportSettingsOutput(updated),
          normalised,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}

export function createRequestExportTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'request_export',
    description:
      'Open an export confirmation dialog in the page so the user can review and download the model files (STL or 3MF). Resolves with status "saved", "declined", or "timeout".',
    inputSchema: requestExportSchema,
    annotations: { consequentialHint: true },
    async run(input = {}, ctx) {
      const finishJob = env.onToolStart?.('request_export', 'request_export')
      try {
        const handle = env.getModeHandle()
        if (!handle) {
          env.onToolFinish?.({ tool: 'request_export', summary: 'no_active_mode', ok: false })
          return noActiveModeError()
        }
        const issues = validateSchema(input ?? {}, requestExportSchema, { partial: true })
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'request_export', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }

        const { descriptor } = handle
        const validation = descriptor.validate(handle.getState())
        const snapshot = handle.getModel()
        const allErrors = [...validation.errors]
        const rackErr = snapshot.model?.rack?.error
        if (rackErr && !allErrors.some((e) => e.key === rackErr)) {
          allErrors.push({ key: rackErr, message: translateEn(rackErr) })
        }
        const kcErr = snapshot.model?.keychain?.error
        if (kcErr && !allErrors.some((e) => e.key === kcErr)) {
          allErrors.push({ key: kcErr, message: translateEn(kcErr) })
        }
        if (snapshot.error && !allErrors.some((e) => e.key === snapshot.error)) {
          allErrors.push({ key: snapshot.error, message: translateEn(snapshot.error) })
        }

        if (allErrors.length > 0) {
          env.onToolFinish?.({ tool: 'request_export', summary: 'nothing_to_export (errors)', ok: false })
          return errResult('nothing_to_export', 'Cannot export while the model has errors.', {
            reason: 'model_errors',
            errors: allErrors,
          })
        }
        if (snapshot.pending || snapshot.busy) {
          env.onToolFinish?.({ tool: 'request_export', summary: 'nothing_to_export (pending)', ok: false })
          return errResult('nothing_to_export', 'Model build is still in progress.', {
            reason: 'model_pending',
          })
        }
        if (!snapshot.model || snapshot.model.parts.length === 0) {
          env.onToolFinish?.({ tool: 'request_export', summary: 'nothing_to_export (empty)', ok: false })
          return errResult('nothing_to_export', 'Model has no parts to export.', {
            reason: 'no_parts',
          })
        }

        const opts = (input ?? {}) as { format?: ExportFormat; name?: string }
        const currentSettings = (env.getExportSettings ?? getExportSettings)()
        const format: ExportFormat = opts.format ?? currentSettings.format
        const normalisedOverrideName =
          opts.name !== undefined ? normaliseExportFileName(opts.name) : undefined
        const fileName =
          normalisedOverrideName !== undefined ? normalisedOverrideName : currentSettings.fileName
        const effectiveSettings: ExportSettings = {
          ...currentSettings,
          format,
          fileName,
        }
        const fallbackBase =
          normaliseExportFileName(
            handle.getExportName?.() ?? `${descriptor.product}_${descriptor.mode}`,
          ) || descriptor.mode

        const safeParts = ensurePartVertices(snapshot.model.parts)
        const built = buildExport(
          safeParts,
          effectiveSettings,
          fallbackBase,
          Boolean(snapshot.model.sheetLayout),
        )
        const files: ExportFilePreview[] = built.files.map((f) => ({
          name: f.name,
          bytes: f.blob.size,
          blob: f.blob,
        }))

        const dialogs = env.dialogs ?? defaultDialogs
        const decision = await dialogs.request(
          {
            kind: 'export',
            modeName: `${descriptor.product}/${descriptor.mode}`,
            format,
            files,
            plates: built.plates,
            overflow: built.overflow,
          },
          ctx.signal,
        )

        const fileInfos = files.map((f) => ({ name: f.name, bytes: f.bytes }))

        if (decision === 'confirmed') {
          if (env.saveFiles) {
            env.saveFiles(files, {
              format,
              settings: effectiveSettings,
              plates: built.plates,
              overflow: built.overflow,
            })
          } else {
            files.forEach((f) => triggerBrowserDownload(f.blob, f.name))
          }
          env.onToolFinish?.({
            tool: 'request_export',
            summary: `saved (${files.map((f) => f.name).join(', ')})`,
            ok: true,
          })
          return okResult({
            status: 'saved' as const,
            format,
            files: fileInfos,
            plates: built.plates,
            overflow: built.overflow,
          })
        }

        env.onToolFinish?.({
          tool: 'request_export',
          summary: decision,
          ok: true,
        })
        return okResult({
          status: decision,
          format,
          files: fileInfos,
          plates: built.plates,
          overflow: built.overflow,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}
