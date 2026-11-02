import { describe, expect, it } from 'vitest'
import { APP_VERSION, CLOUDTIPS_URL, DONATION_ADDRESS, GITHUB_URL, METRIKA_ID, SITE_NAME } from './site'
import { KEYCHAIN_MODES, MODES, RACK_MODES } from './modes'
import en from '../i18n/en.json'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))

/** Base58Check: 25 байт, первый 0x41 (TRON), последние четыре — двойной SHA-256 первых 21. */
async function validTronAddress(addr: string): Promise<boolean> {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false
  let n = 0n
  for (const c of addr) n = n * 58n + BigInt(ALPHABET.indexOf(c))
  const hex = n.toString(16).padStart(50, '0')
  if (hex.length !== 50) return false
  const bytes = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)))
  const sum = (await sha256(await sha256(bytes.slice(0, 21)))).slice(0, 4)
  return bytes[0] === 0x41 && sum.every((v, i) => v === bytes[21 + i])
}

describe('сведения о сайте (1.1)', () => {
  it('адрес для пожертвований проходит Base58Check (опечатка не попадёт на сайт)', async () => {
    expect(await validTronAddress(DONATION_ADDRESS)).toBe(true)
  })
  it('проверка действительно ловит ошибки: подмена символа и неверная длина', async () => {
    const bad = DONATION_ADDRESS.slice(0, -1) + (DONATION_ADDRESS.endsWith('h') ? 'g' : 'h')
    expect(await validTronAddress(bad)).toBe(false)
    expect(await validTronAddress(DONATION_ADDRESS.slice(1))).toBe(false)
    expect(await validTronAddress('')).toBe(false)
  })
  it('счётчик — положительное целое, ссылки — https на репозиторий и CloudTips, имя PrintKit', () => {
    expect(Number.isInteger(METRIKA_ID) && METRIKA_ID > 0).toBe(true)
    expect(GITHUB_URL).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/)
    expect(CLOUDTIPS_URL).toMatch(/^https:\/\/pay\.cloudtips\.ru\/p\/[\w-]+$/)
    expect(SITE_NAME).toBe('PrintKit')
  })
})

type NodeFs = { readFileSync(path: URL, encoding: 'utf8'): string; statSync(path: URL): { isDirectory(): boolean } }
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process.getBuiltinModule('node:fs')
const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('версия сайта (29)', () => {
  it('APP_VERSION равна версии из package.json и имеет вид MAJOR.MINOR.PATCH', () => {
    const pkg = JSON.parse(read('../../package.json')) as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('верхний заголовок CHANGELOG.md несёт текущую версию', () => {
    const first = read('../../CHANGELOG.md').split('\n').find((l) => l.startsWith('## '))
    expect(first).toMatch(new RegExp(`^## ${APP_VERSION.replace(/\./g, '\\.')} — `))
  })
})

describe('README (36-site-refresh)', () => {
  const readme = read('../../README.md')
  it('текст «Why this exists» совпадает с site.motivation на сайте', () => {
    expect(readme).toContain(en.site.motivation)
  })
  it('строка статуса называет бета-статус, версию и ссылку на changelog', () => {
    expect(readme).toContain('beta')
    expect(readme).toMatch(/v\d+\.\d+\.\d+/)
    expect(readme).toContain('CHANGELOG.md')
  })
  it('в схеме каталогов названы только существующие папки', () => {
    const layout = /## Project layout\n\n```\n([\s\S]*?)```/.exec(readme)?.[1]
    expect(layout).toBeTruthy()
    const folders = [...layout!.matchAll(/(?:^|\s)([\w.-]+\/)/g)].map((m) => m[1])
    expect(folders.length).toBeGreaterThan(0)
    const stat = (rel: string) => {
      try {
        return fs.statSync(new URL(rel, import.meta.url)).isDirectory()
      } catch {
        return false
      }
    }
    const exists = (rel: string) => stat(`../../${rel}`) || stat(`../../src/${rel}`)
    for (const f of folders) expect(exists(f), f).toBe(true)
  })
  it('README называет каждый режим из modes.tsx', () => {
    const t = (key: string): string => key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], en) as string
    for (const mode of [...MODES, ...KEYCHAIN_MODES, ...RACK_MODES]) {
      const label = t(mode.labelKey)
      expect(readme, `${mode.id} (${label})`).toContain(`**${label}**`)
    }
  })
})
