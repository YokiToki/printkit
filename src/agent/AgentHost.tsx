import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUnit } from '../ui/units'
import { agentBridge } from './bridge'

/**
 * Монтируется в AppShell: подключает маршрутизатор, единицы измерения и язык к AgentBridge,
 * а также регистрирует инструменты в WebMCP браузера при наличии поддержки.
 */
export function AgentHost() {
  const navigate = useNavigate()
  const { unit } = useUnit()
  const { i18n } = useTranslation()

  useEffect(() => {
    return agentBridge.attachHost({
      navigate: (path) => navigate(path),
      getUnit: () => unit,
      getLanguage: () => i18n.language,
    })
  }, [navigate, unit, i18n.language])

  useEffect(() => {
    agentBridge.install()
    return () => {
      agentBridge.dispose()
    }
  }, [])

  return null
}
