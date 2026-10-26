import { useEffect, useMemo, type DragEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import type { KeychainInfo, KeychainParams } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { ExportPanel } from '../export/ExportPanel'
import { formatLength, useUnit } from '../../ui/units'
import { useKeychainModel } from './useKeychainModel'
import { TextRasterContext, useTextRaster } from './useTextRaster'

/**
 * Общая раскладка обоих режимов Keychain: модель (воркер), 3D-вид, панель, блок экспорта и запись последнего сеанса.
 * Режим даёт параметры, изображение (только Изображение) и содержимое панели; `info` приходит из ответа воркера.
 */
export function KeychainWorkspace({ mode, params, image, panel, overlay, onDrop, onStartOver, hold }: {
  mode: 'image' | 'shape'
  params: KeychainParams
  image: GrayImage | null
  panel: (info: KeychainInfo | null) => ReactNode
  overlay?: (info: KeychainInfo | null) => ReactNode
  onDrop?: DragEventHandler
  /** Вернуть параметры режима к умолчаниям (кнопка «Начать заново»). */
  onStartOver: () => void
  /** Построение ждёт восстановления сохранённых данных (альфа ИИ). */
  hold?: boolean
}) {
  const { t } = useTranslation()
  // надпись растрируется здесь (шрифты и canvas только в главном потоке), воркеру уходит готовая маска; в параметры модели идёт её ключ
  const textState = useTextRaster(params.text)
  const modelParams = useMemo(() => ({ ...params, text: { ...params.text, maskId: textState.maskId } }), [params, textState.maskId])
  const { model, info, pending } = useKeychainModel(modelParams, image, { hold })
  const size = info?.size

  useEffect(() => { if (size) recordSession(mode, `${size[0].toFixed(0)} × ${size[1].toFixed(0)} ${t('units.mm')}`, 'keychain') }, [mode, size, t])

  const name = size ? `keychain_${Math.round(size[0])}x${Math.round(size[1])}` : 'keychain'
  return (
    <TextRasterContext.Provider value={textState}>
    <div className="flex min-h-0 flex-1" onDragOver={onDrop ? (e) => e.preventDefault() : undefined} onDrop={onDrop}>
      <Workspace
        model={model} onStartOver={onStartOver} modeName={t(`keychain.modes.${mode}`)}
        overlay={overlay?.(info) ?? null}
        panel={panel(info)}
        footer={<><ExportPanel model={model} busy={pending} name={name} /><SheetSize sheet={info?.mountInfo?.sheet} /></>}
      />
    </div>
    </TextRasterContext.Provider>
  )
}

/** Размер листа печати (две половины и штифты) под кнопками экспорта. */
function SheetSize({ sheet }: { sheet?: { w: number; h: number } }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  if (!sheet) return null
  return <span className="mt-2 block text-xs text-text-muted" data-testid="sheet-size">{t('keychain.split.sheet', { w: formatLength(sheet.w, unit), h: formatLength(sheet.h, unit), u: t(`units.${unit}`) })}</span>
}
