import { useTranslation } from 'react-i18next'

export interface RollbackDividerProps {
  index: number
  isActive: number | null | undefined
  onSetRollback: (index: number | null) => void
}

export function RollbackDivider({ index, isActive, onSetRollback }: RollbackDividerProps) {
  const { t } = useTranslation()
  const isHere = isActive === index

  return (
    <div
      data-testid={`rollback-divider-${index}`}
      onClick={() => onSetRollback(isHere ? null : index)}
      title={isHere ? t('editor.stack.rollbackEnd') : t('editor.stack.rollbackHere')}
      className={`group relative flex items-center justify-center h-2 cursor-pointer transition-all ${
        isHere ? 'h-3 my-0.5' : 'hover:h-3'
      }`}
    >
      <div
        className={`w-full h-0.5 transition-colors ${
          isHere
            ? 'bg-accent h-1 rounded-full'
            : 'bg-transparent group-hover:bg-accent/40 rounded'
        }`}
      />
      {isHere && (
        <span className="absolute right-1 px-1.5 py-0.2 bg-accent text-[9px] text-accent-on font-semibold rounded shadow-xs uppercase tracking-wider">
          {t('editor.stack.rollbackHere')}
        </span>
      )}
    </div>
  )
}
