import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { caseLayout, defaultRackCase, validateRackCase, type RackCaseParams } from '../../geometry/rack/case'
import { usePersistedState } from '../../app/usePersistedState'
import { useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { ExportPanel } from '../export/ExportPanel'
import { migrateRackCase } from './migrateCase'
import { CasePanel } from './CasePanel'

const PARAMS_KEY = 'rack.case'

export function CaseMode() {
  const { t } = useTranslation()
  const [p, setP] = usePersistedState<RackCaseParams>(PARAMS_KEY, defaultRackCase, migrateRackCase)
  // не пересоздаём объект параметров, пока значения те же
  const key = JSON.stringify(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => p, [key])
  const check = validateRackCase(params)
  const valid = check.errors.length === 0
  const { model, pending } = useModel('rackCase', params, { enabled: valid, invalid: check.errors })
  const l = valid ? caseLayout(params) : null

  useEffect(() => { recordSession('case', `${p.device.width} × ${p.device.depth} × ${p.device.height}`, 'rack') }, [p.device])

  return (
    <Workspace
      model={model}
      onStartOver={() => setP(defaultRackCase)} modeName={t('rack.modes.case')}
      panel={<CasePanel params={p} onChange={setP} />}
      footer={<ExportPanel model={model} busy={pending} name={`rack_case_${l?.units ?? 0}u_${Math.round(p.device.width)}x${Math.round(p.device.depth)}x${Math.round(p.device.height)}`} />}
    />
  )
}
