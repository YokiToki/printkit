import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useUnit } from '../ui/units'
import { agentBridge } from './bridge'
import { AgentExportDialog } from './AgentExportDialog'
import { useAgentSettings } from './settings'
import type { ActiveAgentDialog } from './tools/confirm'

/**
 * Монтируется в AppShell: подключает маршрутизатор, единицы измерения и язык к AgentBridge,
 * регистрирует инструменты в WebMCP браузера при наличии поддержки и включённой настройке,
 * а также отображает диалоги подтверждения экспорта и сброса параметров.
 */
export function AgentHost() {
  const navigate = useNavigate()
  const { unit } = useUnit()
  const { t, i18n } = useTranslation()
  const [settings] = useAgentSettings()
  const [activeDialog, setActiveDialog] = useState<ActiveAgentDialog | null>(() =>
    agentBridge.dialogs.getActive(),
  )

  useEffect(() => {
    return agentBridge.attachHost({
      navigate: (path) => navigate(path),
      getUnit: () => unit,
      getLanguage: () => i18n.language,
    })
  }, [navigate, unit, i18n.language])

  useEffect(() => {
    agentBridge.syncWebMcp()
  }, [settings.enabled])

  useEffect(() => {
    agentBridge.syncWebMcp()
    return () => {
      agentBridge.dispose()
    }
  }, [])

  useEffect(() => {
    return agentBridge.dialogs.subscribe(() => {
      setActiveDialog(agentBridge.dialogs.getActive())
    })
  }, [])

  return (
    <>
      {activeDialog?.kind === 'reset' && (
        <ConfirmDialog
          title={t('agent.resetTitle')}
          confirmLabel={t('agent.resetConfirm')}
          cancelLabel={t('log.cancel')}
          danger
          onConfirm={() => agentBridge.dialogs.confirm()}
          onCancel={() => agentBridge.dialogs.decline()}
        >
          {t('agent.resetPrompt')}
        </ConfirmDialog>
      )}

      {activeDialog?.kind === 'export' && (
        <AgentExportDialog
          prompt={activeDialog}
          onConfirm={() => agentBridge.dialogs.confirm()}
          onDecline={() => agentBridge.dialogs.decline()}
        />
      )}
    </>
  )
}
