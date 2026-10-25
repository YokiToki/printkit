import { log } from '../../app/activityLog'
import { fmtSize } from '../../app/logText'
import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultText, MAX_TEXT_CHARS, type TextAlign, type TextMode, type TextParams } from '../../geometry/text'
import { textResolution } from '../../geometry/keychain'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Toggle } from '../../ui/Toggle'
import { formatLength, useUnit } from '../../ui/units'
import { FONT_GROUPS, FONT_LIST, fontById, GENERIC_FONTS, isGeneric, isUserFont } from './fontList'
import { addUserFontFile, FontError } from './fonts'
import { openFontStore } from './fontStore'
import { useTextRasterState } from './useTextRaster'

const ALIGNS: TextAlign[] = ['left', 'center', 'right']
const MODES: TextMode[] = ['emboss', 'engrave']

/**
 * Надпись: включение, текст в несколько строк, шрифт (по группам, системные, свой файл), начертание, размер (высота заглавных),
 * интервалы, выравнивание, поворот, рельеф или гравировка. Положение задаётся в редакторе. Макета нет: собрана из компонентов ui/.
 */
export function TextSection({ value: t, error, splitOn, cell = null, minCell = null, clipped = false, editor = null, onChange, onRaise }: {
  value: TextParams
  error: (field: string) => string | undefined
  /** Включён режим двух половин: надпись только на верхней. */
  splitOn: boolean
  cell?: number | null
  minCell?: number | null
  /** Часть надписи вне материала (ответ воркера). */
  clipped?: boolean
  /** Редактор положения надписи (вид сверху); его даёт SharedSections, когда есть силуэт и растр. */
  editor?: ReactNode
  onChange: (p: Partial<TextParams>) => void
  onRaise?: (cell: number) => void
}) {
  const { t: tr } = useTranslation()
  const { unit } = useUnit()
  const { fontLost } = useTextRasterState()
  const [fontError, setFontError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const contentId = useId(), fontId = useId()
  const u = tr(`units.${unit}`)

  const lines = t.content.split('\n')
  const summary = t.enabled ? (t.content.trim() ? `${lines[0].slice(0, 18)}${lines[0].length > 18 || lines.length > 1 ? '…' : ''}` : tr('keychain.text.off')) : tr('keychain.text.off')
  const entry = fontById(t.font.id)
  const canBold = entry ? entry.bold : true, canItalic = entry ? entry.italic : true
  const own = isUserFont(t.font.id)
  const res = cell && minCell !== null && t.enabled ? textResolution(t.size, cell, minCell) : null

  const pickFont = (id: string) => {
    setFontError(null)
    const e = fontById(id)
    // начертание, которого у семейства нет, сбрасывается
    onChange({ font: { id, bold: e && !e.bold ? false : t.font.bold, italic: e && !e.italic ? false : t.font.italic, ...(isUserFont(id) && t.font.name ? { name: t.font.name } : {}) } })
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const f = await addUserFontFile(file, await openFontStore(), own ? t.font.id : undefined)
      setFontError(null)
      log.info('image', 'log.image.fontImported', { name: file.name, size: fmtSize(file.size) })
      onChange({ font: { ...f, bold: false, italic: false } })
    } catch (e) {
      log.error('image', 'log.image.fontFailed', { name: file.name }, e instanceof FontError ? e.code : String(e))
      setFontError(tr(`keychain.text.fontErrors.${e instanceof FontError ? e.code : 'decode'}`))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Section title={tr('keychain.text.title')} summary={summary} modified={isChanged(t, defaultText)} onReset={() => { setFontError(null); onChange({ ...defaultText, font: { ...defaultText.font } }) }}>
      <Toggle label={tr('keychain.text.enabled')} checked={t.enabled} onChange={(v) => onChange({ enabled: v })} />
      {t.enabled && (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={contentId} className="text-xs text-text-muted">{tr('keychain.text.content')}</label>
            <textarea id={contentId} rows={3} value={t.content} maxLength={MAX_TEXT_CHARS} placeholder={tr('keychain.text.placeholder')} onChange={(e) => onChange({ content: e.target.value })}
              aria-invalid={error('text.content') ? true : undefined}
              className="w-full resize-y rounded-control border border-border-strong bg-bg px-2 py-1.5 text-[13px] text-text outline-0 focus:border-accent" />
            {error('text.content') && <span role="alert" className="text-xs text-error-text">{error('text.content')}</span>}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={fontId} className="text-xs text-text-muted">{tr('keychain.text.font')}</label>
            <select id={fontId} value={t.font.id} onChange={(e) => pickFont(e.target.value)} className="h-8 w-full rounded-control border border-border-strong bg-bg px-2 text-text">
              {FONT_GROUPS.map((g) => (
                <optgroup key={g} label={tr(`keychain.text.groups.${g}`)}>
                  {FONT_LIST.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </optgroup>
              ))}
              <optgroup label={tr('keychain.text.groups.system')}>{GENERIC_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>
              {own && <optgroup label={tr('keychain.text.groups.own')}><option value={t.font.id}>{t.font.name ?? t.font.id}</option></optgroup>}
              {!entry && !isGeneric(t.font.id) && !own && <option value={t.font.id}>{t.font.id}</option>}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label={tr('keychain.text.bold')} checked={t.font.bold} disabled={!canBold} onChange={(v) => onChange({ font: { ...t.font, bold: v } })} />
            <Toggle label={tr('keychain.text.italic')} checked={t.font.italic} disabled={!canItalic} onChange={(v) => onChange({ font: { ...t.font, italic: v } })} />
          </div>
          <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden data-testid="font-input" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()}>{tr('keychain.text.loadFont')}</Button>
          <span className="-mt-1 text-xs text-text-subtle">{tr('keychain.text.fontNote')}</span>
          {fontError && <Banner kind="error">{fontError}</Banner>}
          {fontLost && own && <Banner kind="warn">{tr('keychain.text.fontLost')}</Banner>}

          <LengthField label={tr('keychain.text.size')} value={t.size} min={1} max={80} step={0.5} error={error('text.size')} onChange={(v) => onChange({ size: v })} />
          <div className="grid grid-cols-2 gap-2">
            <LengthField label={tr('keychain.text.letterSpacing')} value={t.letterSpacing} min={-3} max={10} step={0.1} error={error('text.letterSpacing')} onChange={(v) => onChange({ letterSpacing: v })} />
            <NumberField label={tr('keychain.text.lineSpacing')} value={t.lineSpacing} min={0.5} max={3} step={0.1} digits={2} error={error('text.lineSpacing')} onChange={(v) => onChange({ lineSpacing: v })} />
          </div>
          <SegmentedControl fill ariaLabel={tr('keychain.text.align')} value={t.align} onChange={(v: TextAlign) => onChange({ align: v })} options={ALIGNS.map((a) => ({ value: a, label: tr(`keychain.text.aligns.${a}`) }))} />
          <NumberField label={tr('keychain.text.rotation')} value={t.rotation} min={-180} max={180} step={5} digits={1} error={error('text.rotation')} onChange={(v) => onChange({ rotation: v })} />
          <SegmentedControl fill ariaLabel={tr('keychain.text.mode')} value={t.mode} onChange={(v: TextMode) => onChange({ mode: v })} options={MODES.map((m) => ({ value: m, label: tr(`keychain.text.modes.${m}`) }))} />
          {t.mode === 'emboss'
            ? <LengthField label={tr('keychain.text.height')} value={t.height} min={0.1} max={10} step={0.1} error={error('text.height')} onChange={(v) => onChange({ height: v })} />
            : <LengthField label={tr('keychain.text.depth')} value={t.depth} min={0.1} max={10} step={0.1} error={error('text.depth')} onChange={(v) => onChange({ depth: v })} />}
          {editor}
          {splitOn && <span className="text-xs text-text-subtle">{tr('keychain.text.halves')}</span>}
          {clipped && <Banner kind="warn">{tr('keychain.text.clipped')}</Banner>}
          {res?.tooFine && (
            <>
              <Banner kind="warn">{tr('keychain.text.tooFine', { stroke: formatLength(res.stroke, unit), cell: formatLength(cell!, unit), u })}</Banner>
              {res.canRaise && onRaise && <Button onClick={() => onRaise(res.raiseTo)}>{tr('keychain.text.raise', { cell: formatLength(res.raiseTo, unit), u })}</Button>}
            </>
          )}
        </>
      )}
    </Section>
  )
}

