import { useMemo, type ReactNode } from 'react'
import { usePersistedState } from '../app/usePersistedState'
import { UnitContext, type Unit } from './units'

export function UnitProvider({ children, initialUnit }: { children: ReactNode; initialUnit?: Unit }) {
  const [s, setS] = usePersistedState<{ unit: Unit }>('gridfinity.unit', { unit: initialUnit ?? 'mm' })
  const unit: Unit = initialUnit ?? (s.unit === 'in' ? 'in' : 'mm')
  const value = useMemo(() => ({ unit, setUnit: (u: Unit) => setS({ unit: u }) }), [unit, setS])
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>
}
