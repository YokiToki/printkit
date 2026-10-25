import { beforeEach, describe, expect, it } from 'vitest'
import { getLogSnapshot, resetActivityLog } from '../../app/activityLog'
import { openImageStore } from './imageStore'
import { openFontStore } from './fontStore'
import { openMeshStore } from '../cutout/meshStore'

beforeEach(() => resetActivityLog())

describe('журнал: хранилище без IndexedDB', () => {
  it('предупреждение о памяти пишется один раз за сеанс на вид данных', async () => {
    await openImageStore(null); await openImageStore(null)
    await openMeshStore(null)
    await openFontStore(null); await openFontStore(null)
    const e = getLogSnapshot().entries.filter((x) => x.source === 'storage')
    expect(e).toHaveLength(3)
    expect(e.every((x) => x.level === 'warn' && x.key === 'log.storage.memory')).toBe(true)
    expect(e.map((x) => x.params?.what).sort()).toEqual(['fonts', 'images', 'meshes'])
  })
})
