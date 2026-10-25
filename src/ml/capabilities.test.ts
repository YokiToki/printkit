import { describe, expect, it } from 'vitest'
import { availability, detectCapabilities } from './capabilities'
import { modelById } from './models'

const gpu = (features: string[]) => ({ gpu: { requestAdapter: async () => ({ features: new Set(features) }) } })

describe('capabilities', () => {
  it('определяет WebGPU и shader-f16 по адаптеру; ошибки и отсутствие navigator.gpu дают «нет»', async () => {
    expect(await detectCapabilities(gpu(['shader-f16']))).toEqual({ webgpu: true, f16: true })
    expect(await detectCapabilities(gpu([]))).toEqual({ webgpu: true, f16: false })
    expect(await detectCapabilities({})).toEqual({ webgpu: false, f16: false })
    expect(await detectCapabilities({ gpu: { requestAdapter: async () => null } })).toEqual({ webgpu: false, f16: false })
    expect(await detectCapabilities({ gpu: { requestAdapter: async () => { throw new Error('x') } } })).toEqual({ webgpu: false, f16: false })
  })

  it('без WebGPU скрыты модели только для WebGPU, остаются WASM-модели', () => {
    const none = { webgpu: false, f16: false }
    expect(availability(modelById('isnet-imgly-fp16')!, none)).toEqual({ ok: false, reason: 'noWebgpu' })
    expect(availability(modelById('inspyrenet-fp16')!, none)).toEqual({ ok: false, reason: 'noWebgpu' })
    expect(availability(modelById('birefnet-lite-512-fp16')!, none)).toEqual({ ok: true, backend: 'wasm' })
    expect(availability(modelById('isnet-general-int8')!, none)).toEqual({ ok: true, backend: 'wasm' })
  })

  it('без shader-f16 скрыты fp16-модели WebGPU; с ним доступны', () => {
    const noF16 = { webgpu: true, f16: false }, full = { webgpu: true, f16: true }
    expect(availability(modelById('isnet-imgly-fp16')!, noF16)).toEqual({ ok: false, reason: 'noF16' })
    expect(availability(modelById('inspyrenet-fp16')!, noF16)).toEqual({ ok: false, reason: 'noF16' })
    expect(availability(modelById('isnet-imgly-fp16')!, full)).toEqual({ ok: true, backend: 'webgpu' })
    expect(availability(modelById('isnet-general-int8')!, full)).toEqual({ ok: true, backend: 'wasm' }) // предпочтительный бэкенд — первый в списке
  })
})
