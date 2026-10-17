import type { ArtId } from './ModeArt'
import { IconBox, IconCircleDashed, IconLayoutBottombar, IconLayoutGrid, IconPackage, IconPhoto, IconRectangle, IconShape2, type Icon } from '@tabler/icons-react'

/** Режим продукта на сайте: маршрут, значок и ключи i18n (подпись в переключателе, тексты карточки выбора). */
export interface ProductMode {
  id: string
  path: string
  Icon: Icon
  labelKey: string
  /** Префикс ключей карточки на странице выбора: <startKey>.desc, .tag1, .tag2. */
  startKey: string
  /** Иллюстрация карточки режима (ключ в `ART`): настоящий рендер детали, а не значок. */
  artId: ArtId
}

/** Режимы продукта Gridfinity Master. Не путать с `ModeId` геометрии (ключи ModeParams): тот не зависит от маршрутов. */
export type ModeId = 'box' | 'baseplate' | 'cutout'
export const GRIDFINITY_PATH = '/gridfinity'
export const KEYCHAIN_PATH = '/keychain'
export const RACK_PATH = '/rack'
export const MODES: (ProductMode & { id: ModeId })[] = [
  { id: 'box', path: `${GRIDFINITY_PATH}/box`, Icon: IconBox, labelKey: 'modes.box', startKey: 'start.box', artId: 'box' },
  { id: 'baseplate', path: `${GRIDFINITY_PATH}/baseplate`, Icon: IconLayoutGrid, labelKey: 'modes.baseplate', startKey: 'start.baseplate', artId: 'baseplate' },
  { id: 'cutout', path: `${GRIDFINITY_PATH}/cutout`, Icon: IconCircleDashed, labelKey: 'modes.cutout', startKey: 'start.cutout', artId: 'cutout' },
]

/** Режимы Keychain Master: Изображение (рельеф по картинке) и Форма (готовая фигура). */
export type KeychainModeId = 'image' | 'shape'
export const KEYCHAIN_MODES: (ProductMode & { id: KeychainModeId })[] = [
  { id: 'image', path: `${KEYCHAIN_PATH}/image`, Icon: IconPhoto, labelKey: 'keychain.modes.image', startKey: 'start.keychainImage', artId: 'keychainImage' },
  { id: 'shape', path: `${KEYCHAIN_PATH}/shape`, Icon: IconShape2, labelKey: 'keychain.modes.shape', startKey: 'start.keychainShape', artId: 'keychainShape' },
]

/** Режимы Rack Master: Панель, Корпус и Полка. */
export type RackModeId = 'panel' | 'case' | 'shelf'
export const RACK_MODES: (ProductMode & { id: RackModeId })[] = [
  { id: 'panel', path: `${RACK_PATH}/panel`, Icon: IconRectangle, labelKey: 'rack.modes.panel', startKey: 'start.rackPanel', artId: 'rackPanel' },
  { id: 'case', path: `${RACK_PATH}/case`, Icon: IconPackage, labelKey: 'rack.modes.case', startKey: 'start.rackCase', artId: 'rackCase' },
  { id: 'shelf', path: `${RACK_PATH}/shelf`, Icon: IconLayoutBottombar, labelKey: 'rack.modes.shelf', startKey: 'start.rackShelf', artId: 'rackShelf' },
]
