import { PhotoClient, type PhotoWorkerLike } from '../../../geometry/photo/photoClient'

let client: PhotoClient | null = null
/** Общий клиент воркера окна «Из фото»; без поддержки Worker (тесты) считает в том же потоке. */
export function getPhotoClient(): PhotoClient {
  return (client ??= new PhotoClient(() => (typeof Worker === 'undefined' ? null : (new Worker(new URL('../../../geometry/photo/photo.worker.ts', import.meta.url), { type: 'module' }) as unknown as PhotoWorkerLike))))
}
