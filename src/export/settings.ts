import { useSyncExternalStore } from 'react'
import { loadPersisted } from '../app/usePersistedState'
import { CUSTOM_PRINTER, FILAMENTS, printerById } from '../data/printers'

export type ExportFormat = 'stl' | '3mf'
export type Orientation = 'auto' | 'asis' | 'flipped'

/** Настройки экспорта и принтера: общие для всех режимов, хранятся под одним ключом. */
export interface ExportSettings {
  format: ExportFormat
  /** id пресета из data/printers или 'custom'. */
  printerId: string
  customX: number
  customY: number
  customZ: number
  /** Поле по краю стола, мм: вычитается с каждой стороны для разрезания и раскладки. */
  margin: number
  /** Зазор между деталями на плите, мм. */
  gap: number
  nozzle: number
  process: string
  /** id пластика из data/printers: Studio без профиля пластика показывает проект как изменённый, поэтому он всегда задан. */
  filament: string
  /** Несколько деталей: один файл 3MF/STL или отдельные файлы. */
  multi: 'one' | 'separate'
  orientation: Orientation
  /** Пустое — имя по режиму и размеру. */
  fileName: string
}

export const defaultExportSettings: ExportSettings = {
  format: 'stl', printerId: 'x1c', customX: 220, customY: 220, customZ: 250, margin: 5, gap: 6,
  nozzle: 0.4, process: '0.20-standard', filament: 'pla', multi: 'one', orientation: 'auto', fileName: '',
}

export interface Bed { x: number; y: number; z: number }

export function bedOf(s: ExportSettings): Bed {
  const p = s.printerId === CUSTOM_PRINTER ? undefined : printerById(s.printerId)
  return p ? { x: p.x, y: p.y, z: p.z } : { x: s.customX, y: s.customY, z: s.customZ }
}

/** Рабочая область: стол без полей. */
export function usableBed(s: ExportSettings): Bed {
  const b = bedOf(s)
  return { x: Math.max(0, b.x - 2 * s.margin), y: Math.max(0, b.y - 2 * s.margin), z: b.z }
}

/** Приводит сохранённое к текущему виду: неизвестный принтер → по умолчанию, числа — конечные положительные. */
export function normalizeExportSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw }
  if (out.printerId !== CUSTOM_PRINTER && typeof out.printerId === 'string' && !printerById(out.printerId)) out.printerId = defaultExportSettings.printerId
  for (const k of ['customX', 'customY', 'customZ', 'gap', 'nozzle'] as const) if (!(typeof out[k] === 'number' && Number.isFinite(out[k]) && (out[k] as number) > 0)) delete out[k]
  if (!(typeof out.margin === 'number' && Number.isFinite(out.margin) && out.margin >= 0)) delete out.margin
  if (typeof out.filament !== 'string' || !FILAMENTS.some((f) => f.id === out.filament)) delete out.filament // в том числе прежнее 'none'
  if (out.format !== 'stl' && out.format !== '3mf') delete out.format
  if (out.multi !== 'one' && out.multi !== 'separate') delete out.multi
  if (out.orientation !== 'auto' && out.orientation !== 'asis' && out.orientation !== 'flipped') delete out.orientation
  return out
}

const KEY = 'gridfinity.export'
let state: ExportSettings | null = null
const listeners = new Set<() => void>()
const current = () => (state ??= loadPersisted(KEY, defaultExportSettings, normalizeExportSettings))
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function getExportSettings(): ExportSettings {
  return current()
}

export function updateExportSettings(patch: Partial<ExportSettings>) {
  state = { ...current(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* хранилище недоступно */ }
  listeners.forEach((l) => l())
}

/** Для тестов: забыть кэш и перечитать хранилище. */
export function resetExportSettings() { state = null; listeners.forEach((l) => l()) }

export function useExportSettings() {
  const s = useSyncExternalStore(subscribe, current, () => defaultExportSettings)
  return [s, updateExportSettings] as const
}
