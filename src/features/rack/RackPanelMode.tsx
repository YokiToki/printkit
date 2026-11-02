import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultRackPanel, validateRackPanel, type RackPanelParams } from '../../geometry/rack/panel'
import { HEIGHT_TOLERANCE, RACK_UNIT } from '../../geometry/rack/spec'
import { usePersistedState } from '../../app/usePersistedState'
import { useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { ExportPanel } from '../export/ExportPanel'
import { migrateRackPanel } from './migrate'
import { RackPanel } from './RackPanel'
import { rackPanelDescriptor } from '../../agent/modes'
import { useAgentMode } from '../../agent/useAgentMode'

const PARAMS_KEY = 'rack.panel'

export function RackPanelMode() {
  const { t } = useTranslation()
  const [p, setP] = usePersistedState<RackPanelParams>(PARAMS_KEY, defaultRackPanel, migrateRackPanel)
  // не пересоздаём объект параметров, пока значения те же
  const key = JSON.stringify(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => p, [key])
  const check = validateRackPanel(params)
  const valid = check.errors.length === 0
  const { model, pending, error } = useModel('rackPanel', params, { enabled: valid, invalid: check.errors })

  useEffect(() => { recordSession('panel', `${p.units} U`, 'rack') }, [p.units])

  const height = Math.round((p.units * RACK_UNIT - (p.tolerance ? HEIGHT_TOLERANCE : 0)) * 10) / 10
  const exportName = `rack_panel_${p.units}u_${height}`

  useAgentMode(rackPanelDescriptor, {
    state: p,
    setState: setP,
    defaults: defaultRackPanel,
    onReset: () => setP(defaultRackPanel),
    model,
    pending,
    error,
    exportName,
  })
  return (
    <Workspace
      model={model}
      onStartOver={() => setP(defaultRackPanel)} modeName={t('rack.modes.panel')}
      panel={<RackPanel params={p} onChange={setP} buildError={error} />}
      footer={<ExportPanel model={model} busy={pending} name={exportName} />}
    />
  )
}
