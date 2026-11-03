import { Outlet } from 'react-router'
import { Header } from './Header'
import { AnalyticsHost } from './AnalyticsHost'
import { ConsentBanner } from './ConsentBanner'
import { ModelManager } from '../features/ml/ModelManager'
import { useModelManagerOpen } from '../features/ml/managerState'
import { AgentHost } from '../agent/AgentHost'

export function AppShell() {
  const managerOpen = useModelManagerOpen()
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-text">
      <AgentHost />
      <Header />
      <Outlet />
      {managerOpen && <ModelManager />}
      <ConsentBanner />
      <AnalyticsHost />
    </div>
  )
}
