// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { getLogSnapshot, resetActivityLog } from '../../app/activityLog'
import { resetExportSettings } from '../../export/settings'
import type { ModelResult, PartMesh } from '../../geometry/model'
import { ExportPanel } from './ExportPanel'
import { ExportOptionsSection } from './ExportOptionsSection'
import { UnitContext } from '../../ui/units'
import { expectAllNumericSteppers } from '../../ui/stepperAssert'

/** Тетраэдр: достаточно для проверки имён файлов и раскладки. */
const part = (label: string, col: number, size = 40, oversize = false): PartMesh => ({
  label, col, row: 0, oversize,
  mesh: { vertProperties: Float32Array.from([0, 0, 0, size, 0, 0, 0, size, 0, 0, 0, 10]), triVerts: Uint32Array.from([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]), numProp: 3, min: [0, 0, 0], max: [size, size, 10], volume: 1 },
})
const one: ModelResult = { parts: [part('A1', 0)] }
const two: ModelResult = { parts: [part('A1', 0), part('B1', 1, 40, true)] }
const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}><UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>{ui}</UnitContext.Provider></I18nextProvider>)

describe('ExportPanel', () => {
  const names: string[] = []
  beforeEach(async () => {
    localStorage.clear(); resetExportSettings(); names.length = 0
    await i18n.changeLanguage('en')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn()
  })

  it('журнал: экспорт пишет формат, принтер, плиты и непомещающиеся детали', async () => {
    resetActivityLog()
    wrap(<ExportPanel model={two} busy={false} name="plate" />)
    await userEvent.click(screen.getByRole('button', { name: 'Download STL' }))
    const e = getLogSnapshot().entries.filter((x) => x.source === 'export')
    expect(e.map((x) => x.key)).toContain('log.export.built')
    expect(e.find((x) => x.key === 'log.export.built')?.params).toMatchObject({ format: 'STL' })
    expect(e.some((x) => x.key === 'log.export.printer')).toBe(true)
  })
  it('одна деталь: кнопка «Download STL» скачивает один файл', async () => {
    wrap(<ExportPanel model={one} busy={false} name="cutout_84x84" />)
    await userEvent.click(screen.getByRole('button', { name: 'Download STL' }))
    expect(names).toEqual(['cutout_84x84.stl'])
  })
  it('формат 3MF меняет кнопку и расширение, выбор сохраняется', async () => {
    wrap(<ExportPanel model={one} busy={false} name="box_84x84" />)
    await userEvent.click(screen.getByRole('button', { name: '3MF' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download 3MF' }))
    expect(names).toEqual(['box_84x84.3mf'])
    expect(JSON.parse(localStorage.getItem('gridfinity.export')!).format).toBe('3mf')
  })
  it('несколько частей: общая кнопка и кнопка каждой части; слишком большая часть помечена', async () => {
    wrap(<ExportPanel model={two} busy={false} name="plate" />)
    await userEvent.click(screen.getByRole('button', { name: 'Download part B1' }))
    expect(names).toEqual(['plate_B1.stl'])
    expect(screen.getByRole('button', { name: 'Download part B1' })).toHaveTextContent('!')
    await userEvent.click(screen.getByRole('button', { name: 'Download STL' }))
    expect(names.slice(1)).toEqual(['plate.stl'])
  })
  it('пока модель устарела — кнопки отключены, показано «Building…»', () => {
    wrap(<ExportPanel model={two} busy name="x" />)
    expect(screen.getByRole('button', { name: 'Download STL' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Building…')
  })
  it('состояние на столе: помещается / детали больше стола', async () => {
    const { unmount } = wrap(<ExportPanel model={one} busy={false} name="x" />)
    expect(screen.getByRole('status')).toHaveTextContent('Fits the bed')
    unmount()
    const huge: ModelResult = { parts: [part('A1', 0, 400)] }
    wrap(<ExportPanel model={huge} busy={false} name="x" />)
    expect(screen.getByRole('status')).toHaveTextContent('1 part(s) too big for the bed')
  })
  it('выбор «Отдельные файлы» делает кнопку «Download 2 STL files»', async () => {
    localStorage.setItem('gridfinity.export', JSON.stringify({ multi: 'separate' }))
    resetExportSettings()
    wrap(<ExportPanel model={two} busy={false} name="plate" />)
    await userEvent.click(screen.getByRole('button', { name: 'Download 2 STL files' }))
    expect(names).toEqual(['plate_A1.stl', 'plate_B1.stl'])
  })
})

describe('ExportOptionsSection', () => {
  beforeEach(async () => { localStorage.clear(); resetExportSettings(); await i18n.changeLanguage('en') })
  const open = async () => { wrap(<ExportOptionsSection />); await userEvent.click(screen.getByRole('button', { name: /Expand: Export options/ })) }

  it('STL: профили Bambu скрыты', async () => {
    await open()
    expect(screen.queryByLabelText('Nozzle')).toBeNull()
    expect(screen.getByLabelText('Printer')).toBeInTheDocument()
  })
  it('3MF и принтер Bambu: сопло, процесс и пластик видны', async () => {
    localStorage.setItem('gridfinity.export', JSON.stringify({ format: '3mf', printerId: 'a1' }))
    resetExportSettings()
    await open()
    expect(screen.getByLabelText('Nozzle')).toBeInTheDocument()
    expect(screen.getByLabelText('Process preset')).toBeInTheDocument()
    expect(screen.getByLabelText('Filament')).toBeInTheDocument()
  })
  it('3MF и свой принтер: профили Bambu скрыты, поля размера стола видны', async () => {
    localStorage.setItem('gridfinity.export', JSON.stringify({ format: '3mf', printerId: 'custom' }))
    resetExportSettings()
    await open()
    expect(screen.queryByLabelText('Nozzle')).toBeNull()
    expect(screen.getByLabelText('Bed width')).toBeInTheDocument()
  })
  it('ориентация и имя файла сохраняются', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Flipped' }))
    await userEvent.type(screen.getByLabelText('File name'), 'tray')
    const saved = JSON.parse(localStorage.getItem('gridfinity.export')!)
    expect(saved).toMatchObject({ orientation: 'flipped', fileName: 'tray' })
  })
})

describe('кнопки +/− в параметрах экспорта', () => {
  it('у числовых полей есть обе кнопки', async () => {
    localStorage.clear(); resetExportSettings(); await i18n.changeLanguage('en')
    wrap(<ExportOptionsSection />)
    await userEvent.click(screen.getByRole('button', { name: /Expand: Export options/ }))
    await expectAllNumericSteppers()
  })
})
