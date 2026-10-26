import { describe, expect, it } from 'vitest'
import { createPhotoHandler, PhotoClient, PhotoSupersededError, type PhotoRequest, type PhotoResponse, type PhotoWorkerLike } from './photoClient'
import { rectify } from './homography'
import { paperSize } from './paper'
import { segment } from './segment'
import { loadFixture } from './fixtures/load'
import { loadAlpha } from './fixtures/ai/load'

const f = loadFixture('flash')
const sheet = rectify(f.gray, f.corners, paperSize('a4', 'portrait'), f.color.rgb)!
const { alpha } = loadAlpha('birefnet-lite-512-fp32', 'flash')

class FakeWorker implements PhotoWorkerLike {
  sent: PhotoRequest[] = []; terminated = false
  private cb: (e: { data: PhotoResponse }) => void = () => {}
  postMessage(m: PhotoRequest) { this.sent.push(m) }
  addEventListener(t: 'message' | 'error', cb: ((e: { data: PhotoResponse }) => void) | ((e: { message?: string }) => void)) { if (t === 'message') this.cb = cb as (e: { data: PhotoResponse }) => void }
  terminate() { this.terminated = true }
  reply(r: PhotoResponse) { this.cb({ data: r }) }
}
const seg = (n: number) => ({ width: 1, height: 1, scale: 4, labels: new Int32Array(1), silhouettes: [], sensitivity: n, defaultSensitivity: n })

describe('PhotoClient (воркер окна «Из фото»)', () => {
  it('без воркера считает в том же потоке теми же функциями: результат классики равен прямому вызову', async () => {
    const c = new PhotoClient(() => null)
    const viaClient = await c.segment(sheet, {})
    const direct = segment(sheet)
    expect(viaClient.silhouettes).toEqual(direct.silhouettes)
    const ai = await c.ai(sheet, alpha, {})
    expect(ai.silhouettes).toHaveLength(3)
  })

  it('лист и альфа передаются воркеру один раз и дальше называются по номеру', () => {
    const w = new FakeWorker(), c = new PhotoClient(() => w)
    void c.segment(sheet, { margin: 3 }).catch(() => {}); void c.segment(sheet, { margin: 4 }).catch(() => {}); void c.ai(sheet, alpha, {}).catch(() => {})
    expect(w.sent.filter((m) => m.kind === 'sheet')).toHaveLength(1)
    expect(w.sent.filter((m) => m.kind === 'alpha')).toHaveLength(1)
    const segs = w.sent.filter((m) => m.kind === 'segment')
    expect(segs).toHaveLength(2); expect((segs[0] as { sheetId: number }).sheetId).toBe((segs[1] as { sheetId: number }).sheetId)
  })

  it('в каждой полосе побеждает последний запрос, полосы независимы (запрос «по умолчанию» не вытесняет основной)', async () => {
    const w = new FakeWorker(), c = new PhotoClient(() => w)
    const a1 = c.ai(sheet, alpha, { threshold: 0.5 }), a2 = c.ai(sheet, alpha, { threshold: 0.4 }), base = c.ai(sheet, alpha, {}, 'base'), cl = c.segment(sheet, {})
    const reqs = w.sent.filter((m): m is Extract<PhotoRequest, { id: number }> => 'id' in m)
    await expect(a1).rejects.toBeInstanceOf(PhotoSupersededError)
    w.reply({ id: reqs[1].id, seg: seg(2) }); w.reply({ id: reqs[2].id, seg: seg(3) }); w.reply({ id: reqs[3].id, seg: seg(4) })
    expect((await a2).sensitivity).toBe(2); expect((await base).sensitivity).toBe(3); expect((await cl).sensitivity).toBe(4)
  })

  it('опоздавший ответ на вытесненный запрос не заменяет новый; ошибка воркера отклоняет ждущих', async () => {
    const w = new FakeWorker(), c = new PhotoClient(() => w)
    const p1 = c.segment(sheet, {}), p2 = c.segment(sheet, {})
    const [r1, r2] = w.sent.filter((m): m is Extract<PhotoRequest, { kind: 'segment' }> => m.kind === 'segment')
    w.reply({ id: r2.id, seg: seg(2) }); w.reply({ id: r1.id, seg: seg(1) })
    await expect(p1).rejects.toBeInstanceOf(PhotoSupersededError); expect((await p2).sensitivity).toBe(2)
    const p3 = c.segment(sheet, {}); const r3 = w.sent.filter((m) => m.kind === 'segment').at(-1) as { id: number }
    w.reply({ id: r3.id, error: 'boom' })
    await expect(p3).rejects.toThrow('boom')
  })

  it('обработчик воркера помнит только последние листы и сообщает об незарегистрированном', () => {
    const h = createPhotoHandler()
    expect(h({ kind: 'segment', id: 1, sheetId: 99, params: {} })).toMatchObject({ error: 'sheet not registered' })
    h({ kind: 'sheet', sheetId: 1, sheet })
    expect(h({ kind: 'ai', id: 2, sheetId: 1, alphaId: 5, params: {} })).toMatchObject({ error: 'alpha not registered' })
  })
})
