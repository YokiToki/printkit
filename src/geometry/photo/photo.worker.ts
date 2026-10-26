/// <reference lib="webworker" />
import { createPhotoHandler, type PhotoRequest, type PhotoResponse } from './photoClient'

// Воркер окна «Из фото»: классические силуэты и силуэты ИИ считаются здесь, интерфейс не ждёт.
const handle = createPhotoHandler()
self.addEventListener('message', (e: MessageEvent<PhotoRequest>) => {
  const r = handle(e.data)
  if (r) self.postMessage(r satisfies PhotoResponse, 'seg' in r ? [r.seg.labels.buffer] : [])
})
