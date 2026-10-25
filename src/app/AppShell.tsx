import { Outlet } from 'react-router'
import { Header } from './Header'
import { AnalyticsHost } from './AnalyticsHost'
import { ConsentBanner } from './ConsentBanner'
import { ActivityLogPanel } from './ActivityLogPanel'

export function AppShell() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-text">
      <Header />
      <Outlet />
      <ActivityLogPanel />
      <ConsentBanner />
      <AnalyticsHost />
    </div>
  )
}
