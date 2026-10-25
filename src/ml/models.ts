/**
 * Реестр нейросетей (change 32). Веса не лежат в репозитории и не в сборке: скачиваются по явному согласию с закреплённой
 * ревизии (commit hash, не `main`) и проверяются по SHA-256. Размеры и суммы взяты у Hugging Face (LFS-метаданные файла), а для
 * ISNet general int8 сверены с файлом, скачанным скриптом оценки. Только разрешающие лицензии (MIT, Apache-2.0, BSD, CC0).
 */
export type MlKind = 'matte'
export type Backend = 'wasm' | 'webgpu'
export type Purpose = 'default' | 'fast' | 'light' | 'accurate'

export const ALLOWED_SPDX = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0'] as const

export interface ModelSpec {
  id: string
  kind: MlKind
  /** Имя собственное модели, не переводится. */
  name: string
  purpose: Purpose
  /** Полный URL файла с закреплённой ревизией. */
  url: string
  /** Репозиторий-источник (ссылка для страницы «Источники»). */
  source: string
  revision: string
  bytes: number
  sha256: string
  spdx: string
  /** Сторона квадратного входа. */
  size: number
  mean: [number, number, number]
  std: [number, number, number]
  /** Применять ли sigmoid к выходу (логиты). */
  sigmoid: boolean
  /** Бэкенды, на которых модель работает (замеры PoC и Node); первый — предпочтительный. */
  backends: Backend[]
  /** Веса fp16: нужен `shader-f16` у WebGPU. */
  fp16: boolean
  /** Порог и сглаживание маски по умолчанию (подобраны на фикстурах; уточняются в браузере). */
  maskDefaults: { threshold: number; smooth: number }
}

const hf = (repo: string, revision: string, file: string) => ({ url: `https://huggingface.co/${repo}/resolve/${revision}/${file}`, source: `https://huggingface.co/${repo}`, revision })
const IMNET = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] }
const MASK = { threshold: 0.5, smooth: 0.3 }

export const MODELS: ModelSpec[] = [
  {
    id: 'birefnet-lite-512-fp16', kind: 'matte', name: 'BiRefNet-lite 512 (fp16)', purpose: 'default',
    ...hf('studioludens/birefnet-lite-512', '962e67969ec6acec9c19fab76acee4f5e22e990c', 'onnx/model_fp16.onnx'),
    bytes: 98484532, sha256: 'eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516', spdx: 'MIT',
    size: 512, ...IMNET, sigmoid: true, backends: ['wasm'], fp16: true, maskDefaults: MASK,
  },
  {
    id: 'isnet-imgly-fp16', kind: 'matte', name: 'ISNet general (fp16)', purpose: 'fast',
    ...hf('imgly/isnet-general-onnx', '440dea96dd4a3b06bbbf5abec3e26569dd7ec49f', 'onnx/model_fp16.onnx'),
    bytes: 88152708, sha256: '2eb4b5dda7ec41c617e59706e5aafa1f978c9a5f983d2518d9f0ae4d6eb04f20', spdx: 'MIT',
    size: 1024, mean: [0.502, 0.502, 0.502], std: [1.004, 1.004, 1.004], sigmoid: false, backends: ['webgpu'], fp16: true, maskDefaults: MASK,
  },
  {
    id: 'isnet-general-int8', kind: 'matte', name: 'ISNet general (int8)', purpose: 'light',
    ...hf('Ko033/isnet-general-use-onnx', '5349b617911fd60c619b52f32e2b593517b78df3', 'onnx/model_quantized.onnx'),
    bytes: 45902969, sha256: '5039225b9a4ac3df55f185d24b7a92d640c86cc4747002d7f23351e394de03a6', spdx: 'Apache-2.0',
    size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], sigmoid: false, backends: ['wasm', 'webgpu'], fp16: false, maskDefaults: MASK,
  },
  {
    id: 'inspyrenet-fp16', kind: 'matte', name: 'InSPyReNet SwinB (fp16)', purpose: 'accurate',
    ...hf('OS-Software/InSPyReNet-SwinB-Plus-Ultra-ONNX', 'fe628d2d1465f775c707368a80248a2d5b5ad71f', 'onnx/model_fp16.onnx'),
    bytes: 199133027, sha256: '467c47c71739e2e4b37364476045caa74246f968e2e7ff2dc4c9720c80717f4c', spdx: 'MIT',
    size: 1024, ...IMNET, sigmoid: false, backends: ['webgpu'], fp16: true, maskDefaults: MASK,
  },
]

export const modelById = (id: string) => MODELS.find((m) => m.id === id)
export const modelHost = (m: ModelSpec) => new URL(m.url).host

/** Нарушения правил реестра: неразрешённая лицензия, непривязанная ревизия, нет суммы. Пустой список — реестр годен. */
export function registryIssues(models: readonly ModelSpec[] = MODELS): string[] {
  const issues: string[] = [], seen = new Set<string>()
  for (const m of models) {
    if (seen.has(m.id)) issues.push(`${m.id}: повторный id`)
    seen.add(m.id)
    if (!(ALLOWED_SPDX as readonly string[]).includes(m.spdx)) issues.push(`${m.id}: лицензия ${m.spdx} не разрешена`)
    if (!/^[0-9a-f]{40}$/.test(m.revision) || !m.url.includes(`/resolve/${m.revision}/`)) issues.push(`${m.id}: ревизия не закреплена хешем коммита`)
    if (!/^[0-9a-f]{64}$/.test(m.sha256)) issues.push(`${m.id}: нет SHA-256`)
    if (!(m.bytes > 0)) issues.push(`${m.id}: нет размера`)
    if (!m.backends.length) issues.push(`${m.id}: нет бэкендов`)
  }
  return issues
}
