import { log } from '../../app/activityLog'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCheck, IconDownload } from '@tabler/icons-react'
import { CUSTOM_PRINTER, PRINTERS } from '../../data/printers'
import { buildExport, layout } from '../../export/build'
import { useExportSettings, type ExportFormat } from '../../export/settings'
import type { ModelResult } from '../../geometry/model'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Закреплённый блок экспорта внизу панели: формат, принтер, скачивание и состояние раскладки на столе. */
export function ExportPanel({ model, busy, name }: { model: ModelResult | null; busy: boolean; name: string }) {
  const { t } = useTranslation()
  const [s, update] = useExportSettings()
  const parts = model?.parts ?? []
  const plan = useMemo(() => (parts.length ? layout(parts, s, !!model?.sheetLayout) : null), [model, s.orientation, s.margin, s.gap, s.printerId, s.customX, s.customY]) // eslint-disable-line react-hooks/exhaustive-deps
  const overflow = plan?.plates.filter((p) => p.overflow).length ?? 0
  const plates = plan?.plates.length ?? 0
  const disabled = !model || busy || parts.length === 0
  const many = parts.length > 1 && s.multi === 'separate'
  const fmt = s.format.toUpperCase()
  const label = many ? t('export.downloadFiles', { n: parts.length, format: fmt }) : t('export.download', { format: fmt })
  const logBuilt = (count: number, plateCount: number, overflowing: number) => {
    log.info('export', 'log.export.built', { count, format: fmt, plates: plateCount })
    log.info('export', 'log.export.printer', { printer: PRINTERS.find((p) => p.id === s.printerId)?.name ?? t('export.printer.custom') })
    if (overflowing > 0) log.warn('export', 'log.export.overflow', { count: overflowing })
  }
  const go = () => {
    const built = buildExport(parts, s, name, !!model?.sheetLayout)
    logBuilt(built.files.length, plates, overflow)
    built.files.forEach((f) => download(f.blob, f.name))
  }
  const options = [...PRINTERS.map((p) => ({ value: p.id, label: p.name })), { value: CUSTOM_PRINTER, label: t('export.printer.custom') }]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SegmentedControl accent ariaLabel={t('export.format')} value={s.format} onChange={(v: ExportFormat) => update({ format: v })}
          options={[{ value: 'stl', label: 'STL' }, { value: '3mf', label: '3MF' }]} />
        <select aria-label={t('export.printer.label')} value={s.printerId} onChange={(e) => update({ printerId: e.target.value })}
          className="h-8 min-w-0 flex-1 rounded-control border border-border-strong bg-bg px-2 text-text">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button primary className="flex-[1.4]" disabled={disabled} onClick={go}><IconDownload size={16} stroke={1.75} />{label}</Button>
        <span className="flex flex-1 items-center justify-center gap-1.5 text-xs" role="status">
          {busy ? <span className="text-text-muted">{t('export.building')}</span>
            : overflow > 0 ? <span className="inline-flex items-center gap-1.5 text-warn-text"><IconAlertTriangle size={14} stroke={1.75} />{t('export.overflow', { n: overflow })}</span>
            : plates > 1 ? <span className="inline-flex items-center gap-1.5 text-text-muted">{t('export.plates', { n: plates })}</span>
            : plan ? <span className="inline-flex items-center gap-1.5 text-success-text"><IconCheck size={14} stroke={1.75} />{t('export.fits')}</span> : null}
        </span>
      </div>
      {parts.length > 1 && (
        <div className="grid grid-cols-4 gap-1.5">
          {parts.map((p) => {
            const label = t(`export.partName.${p.label}`, { defaultValue: p.label })
            return (
              <Button key={p.label} className="h-8 px-2 text-xs" disabled={disabled} aria-label={t('export.part', { label })}
                onClick={() => { const built = buildExport([p], s, `${name}_${p.label}`); logBuilt(built.files.length, 1, p.oversize ? 1 : 0); built.files.forEach((f) => download(f.blob, f.name)) }}>
                {p.oversize && <span aria-hidden className="text-error">!</span>}{label}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
