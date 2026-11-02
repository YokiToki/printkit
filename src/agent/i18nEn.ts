import en from '../i18n/en.json'

export interface ValidationIssue {
  field?: string
  key: string
  message: string
}

function lookupKey(root: unknown, dotPath: string): string | undefined {
  const parts = dotPath.split('.')
  let cur: unknown = root
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof cur === 'string' ? cur : undefined
}

/** Переводит ключ валидации или предупреждения в английский текст из `en.json` независимо от выбранного в UI языка. */
export function translateEn(key: string, params?: Record<string, string | number>): string {
  // В rackCase часть ключей валидатора имеет вид rack.error.*, а в словаре лежит в rack.case.error.*
  let template = lookupKey(en, key)
  if (!template && key.startsWith('rack.error.')) {
    const sub = key.slice('rack.error.'.length)
    template = lookupKey(en, `rack.case.error.${sub}`)
  }
  if (!template) return key
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const val = params[k]
    return val === undefined ? `{{${k}}}` : String(val)
  })
}

/** Переводит имя поля настройки стойки (`slotWidth`, `group1`, ...) для предупреждений `rack.warning.*`. */
export function translateRackSettingEn(setting?: string): string {
  if (!setting) return 'Setting'
  const groupMatch = /^group(\d+)$/.exec(setting)
  if (groupMatch) {
    return translateEn('rack.case.front.group', { n: Number(groupMatch[1]) })
  }
  return lookupKey(en, `rack.field.${setting}`) ?? setting
}
