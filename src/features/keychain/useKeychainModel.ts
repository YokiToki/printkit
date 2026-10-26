import { useEffect, useMemo, useRef, useState } from 'react'
import { getModelClient, useModel } from '../../app/useModel'
import { validateKeychain, type KeychainInfo, type KeychainParams } from '../../geometry/keychain'
import type { ModelClient } from '../../geometry/modelClient'
import type { ModelResult } from '../../geometry/model'
import type { GrayImage } from '../../geometry/raster/threshold'

type KeychainClient = Pick<ModelClient, 'generate' | 'registerImage'> & Partial<Pick<ModelClient, 'registerMatte'>>

/**
 * Модель Keychain: изображение один раз передаётся воркеру, параметры ссылаются на него по id. Как useModel
 * (debounce, pending), но пустая маска и ошибки построения не стирают прежнюю сетку: она остаётся в `model`,
 * а причина лежит в `info.error`.
 */
export function useKeychainModel(params: KeychainParams, image: GrayImage | null, opts: { client?: KeychainClient; debounce?: number } = {}) {
  const client = opts.client
  const registered = useRef<GrayImage | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!image) { registered.current = null; setReady(false); return }
    if (registered.current === image) return
    registered.current = image
    ;(client ?? getModelClient()).registerImage(params.imageId, image)
    setReady(true)
  }, [image, params.imageId, client])

  const validity = validateKeychain(params)
  const valid = validity.ok
  const key = JSON.stringify(params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => params, [key])
  const shaped = params.origin.kind === 'shape' // фигуре изображение не нужно
  const { model, pending, error } = useModel('keychain', stable, { enabled: valid && (ready || shaped), client, debounce: opts.debounce, invalid: validity.errors.map((e) => e.key) })

  const [good, setGood] = useState<ModelResult | null>(null)
  useEffect(() => { if (model && model.parts.length > 0) setGood(model) }, [model])
  const info: KeychainInfo | null = model?.keychain ?? null
  return {
    /** Последняя удачная сетка (для вьюпорта и экспорта). */
    model: good,
    /** Сведения о последнем ответе: силуэт, размеры, ошибка (пустая маска, подложка меньше силуэта). */
    info,
    /** Сетка устарела или последний ответ — ошибка: экспортировать нельзя. */
    pending: pending || !!info?.error || !valid,
    error,
    valid,
  }
}
