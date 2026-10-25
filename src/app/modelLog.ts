import type { ModelResult } from '../geometry/model'
import { log, type Job } from './activityLog'

/** Строки журнала о результате генерации: ошибки и замечания самой модели (ключи перевода уже в результате). */
export function resultLines(m: ModelResult): { level: 'warn' | 'error'; key: string; params?: Record<string, string | number>; detail?: string }[] {
  const out: ReturnType<typeof resultLines> = []
  if (m.rack?.error) out.push({ level: 'error', key: m.rack.error })
  for (const w of m.rack?.warnings ?? []) out.push({ level: 'warn', key: w.key, ...(w.setting ? { params: { setting: w.setting } } : {}) })
  const k = m.keychain
  if (k?.error) out.push({ level: 'error', key: k.error })
  for (const i of k?.mountInfo?.issues ?? []) {
    out.push({ level: 'warn', key: 'log.model.fitIssue', params: { feature: i.feature }, detail: `${i.kind}: ${i.actual} / ${i.required}` })
  }
  return out
}

const triangles = (m: ModelResult) => m.parts.reduce((n, p) => n + Math.floor((p.mesh.triVerts?.length ?? 0) / 3), 0)

/** Закрывает задачу генерации и пишет замечания, если набор изменился с прошлого раза (`seen` хранит подпись). */
export function reportResult(job: Job, m: ModelResult, ms: number, seen: { current: string }) {
  const lines = resultLines(m)
  const hasError = lines.some((l) => l.level === 'error')
  if (hasError) job.fail(lines.find((l) => l.level === 'error')!.key)
  else job.done('log.model.done', { ms: Math.round(ms), triangles: triangles(m) })
  const sig = JSON.stringify(lines)
  if (sig === seen.current) return
  seen.current = sig
  for (const l of lines) {
    if (l.level === 'error') continue // ошибку уже записала задача
    log.warn('model', l.key, l.params, l.detail)
  }
}
