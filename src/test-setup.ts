import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom без canvas возвращает null, но ещё и шумит при каждом getContext().
beforeEach(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  }
})

// без globals автоочистка RTL не подключается сама
afterEach(() => cleanup())
