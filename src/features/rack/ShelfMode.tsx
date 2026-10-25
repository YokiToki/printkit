import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultRackShelf, shelfLayout, validateRackShelf, type RackShelfParams } from '../../geometry/rack/shelf'
import { usePersistedState } from '../../app/usePersistedState'
import { useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { ExportPanel } from '../export/ExportPanel'
import { migrateRackShelf } from './migrateShelf'
import { ShelfPanel } from './ShelfPanel'

const PARAMS_KEY = 'rack.shelf'

export function ShelfMode() {
  const { t } = useTranslation()
  const [p, setP] = usePersistedState<RackShelfParams>(PARAMS_KEY, defaultRackShelf, migrateRackShelf)
  // не пересоздаём объект параметров, пока значения те же
  const key = JSON.stringify(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => p, [key])
  const check = validateRackShelf(params)
  const valid = check.errors.length === 0
  const { model, pending, error } = useModel('rackShelf', params, { enabled: valid, invalid: check.errors })
  const l = shelfLayout(params)

  useEffect(() => { recordSession('shelf', `${p.units} U · ${p.shelf.depth}`, 'rack') }, [p.units, p.shelf.depth])

  return (
    <Workspace
      model={model}
      onStartOver={() => setP(defaultRackShelf)} modeName={t('rack.modes.shelf')}
      panel={<ShelfPanel params={p} onChange={setP} buildError={error} />}
      footer={<ExportPanel model={model} busy={pending} name={`rack_shelf_${p.units}u_${Math.round(l.width)}x${Math.round(p.shelf.depth)}`} />}
    />
  )
}
