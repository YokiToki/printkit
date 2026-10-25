import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultBox, validateBox, type BoxParams } from '../../geometry/box'
import { axisMm } from '../../geometry/baseplate'
import { usePersistedState } from '../../app/usePersistedState'
import { useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { ExportPanel } from '../export/ExportPanel'
import { migrateBox } from './migrate'
import { BoxPanel } from './BoxPanel'

const PARAMS_KEY = 'gridfinity.box'

export function BoxMode() {
  const { t } = useTranslation()
  const [p, setP] = usePersistedState<BoxParams>(PARAMS_KEY, defaultBox, migrateBox)
  // не пересоздаём объект параметров, пока значения те же
  const key = JSON.stringify(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => p, [key])
  const check = validateBox(params)
  const valid = check.ok
  const { model, pending } = useModel('box', params, { enabled: valid, invalid: check.errors.map((e) => e.key) })

  useEffect(() => {
    const h = p.height.mode === 'units' ? p.height.value : Number((p.height.value / 7).toFixed(1))
    recordSession('box', `${p.x.mode === 'units' ? p.x.value : axisMm(p.x, p.pitch)} × ${p.y.mode === 'units' ? p.y.value : axisMm(p.y, p.pitch)} × ${h}`)
  }, [p.x, p.y, p.height, p.pitch])

  return (
    <Workspace
      model={model}
      onStartOver={() => setP(defaultBox)} modeName={t('modes.box')}
      panel={<BoxPanel params={p} onChange={setP} />}
      footer={<ExportPanel model={model} busy={pending} name={`box_${Math.round(axisMm(p.x, p.pitch))}x${Math.round(axisMm(p.y, p.pitch))}`} />}
    />
  )
}
