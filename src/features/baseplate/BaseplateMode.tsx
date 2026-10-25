import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { axisMm, baseplateLayout, defaultParams, toGeometry, validateBaseplate, type BaseplateParams } from '../../geometry/baseplate'
import { defaultSplit } from '../../geometry/split'
import { usePersistedState } from '../../app/usePersistedState'
import { useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { migrateBaseplate } from './migrate'
import { BaseplatePanel } from './BaseplatePanel'
import { bedOf, useExportSettings } from '../../export/settings'
import { ExportPanel } from '../export/ExportPanel'

const PARAMS_KEY = 'gridfinity.baseplate'

export function BaseplateMode() {
  const { t } = useTranslation()
  const [stored, setP] = usePersistedState<BaseplateParams>(PARAMS_KEY, defaultParams, migrateBaseplate)
  // стол и поле берутся из общих настроек принтера: сохранённые в режиме значения ими перекрываются
  const [ex] = useExportSettings()
  const bed = bedOf(ex)
  const p = useMemo<BaseplateParams>(() => ({ ...stored, preview: { ...stored.preview, plateX: bed.x, plateY: bed.y }, split: { ...stored.split, margin: ex.margin } }), [stored, bed.x, bed.y, ex.margin])
  // перестраиваем модель только при изменении геометрии: стол, разнесённый вид и зазор её не трогают
  const raw = toGeometry(p)
  const candidate = raw.split.enabled ? raw : { ...raw, split: defaultSplit }
  const key = JSON.stringify(candidate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => candidate, [key])
  const check = validateBaseplate(geometry)
  const valid = check.ok
  const { model, pending } = useModel('baseplate', geometry, { enabled: valid, invalid: check.errors.map((e) => e.key) })
  const { sizeX, sizeY } = baseplateLayout(geometry)

  useEffect(() => {
    const units = p.x.mode === 'units' && p.y.mode === 'units'
    recordSession('baseplate', units ? `${p.x.value} × ${p.y.value}` : `${axisMm(p.x, p.pitch)} × ${axisMm(p.y, p.pitch)} ${t('units.mm')}`)
  }, [p.x, p.y, p.pitch, t])

  return (
    <Workspace
      model={model}
      onStartOver={() => setP(defaultParams)} modeName={t('modes.baseplate')}
      gap={p.split.enabled && p.split.exploded ? p.split.gap : 0}
      plate={p.preview.showPlate ? { x: p.preview.plateX, y: p.preview.plateY, margin: ex.margin } : null}
      panel={<BaseplatePanel params={p} onChange={setP} />}
      footer={<ExportPanel model={model} busy={pending} name={`baseplate_${Math.round(sizeX)}x${Math.round(sizeY)}`} />}
    />
  )
}
