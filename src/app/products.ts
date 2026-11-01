import { IconGridDots, IconKey, IconServer, type Icon } from '@tabler/icons-react'
import type { ArtId } from './ModeArt'
import { GRIDFINITY_PATH, KEYCHAIN_MODES, KEYCHAIN_PATH, MODES, RACK_MODES, RACK_PATH, type ProductMode } from './modes'

export type ProductId = 'gridfinity' | 'keychain' | 'rack'
/** Оттенок иллюстраций и логотипа продукта (совпадает с id): Gridfinity — синий, Keychain — зелёный, Rack — жёлтый. */
export type ProductHue = ProductId

/** Раздел сайта: свои маршруты, название, описание (ключи i18n products.<id>.*) и состояние. Новый продукт — одна запись здесь плюс маршруты. */
export interface Product {
  id: ProductId
  path: string
  Icon: Icon
  /** Режимы продукта; у продуктов без режимов переключатель режимов скрыт. */
  modes?: ProductMode[]
  /** Иллюстрация карточки продукта на корневой странице (ключ в `ART`). */
  artId: ArtId
  /** Оттенок иллюстраций и логотипа в шапке; интерфейс (акцент, фокус, кнопки) от оттенка не зависит. */
  hue: ProductHue
}

export const PRODUCTS: Product[] = [
  { id: 'gridfinity', path: GRIDFINITY_PATH, Icon: IconGridDots, modes: MODES, artId: 'box', hue: 'gridfinity' },
  { id: 'keychain', path: KEYCHAIN_PATH, Icon: IconKey, modes: KEYCHAIN_MODES, artId: 'keychainImage', hue: 'keychain' },
  { id: 'rack', path: RACK_PATH, Icon: IconServer, modes: RACK_MODES, artId: 'rackPanel', hue: 'rack' },
]

/** Продукт по пути: совпадает сам путь или его подпуть (граница по «/»). */
export function productOf(pathname: string): Product | undefined {
  return PRODUCTS.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`))
}

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)
