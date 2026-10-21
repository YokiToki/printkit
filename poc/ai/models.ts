/** Кандидаты PoC. Ревизии закреплены (commit hash); размеры из API Hugging Face. */
export interface Candidate {
  id: string
  label: string
  url: string
  bytes: number
  license: string
  size: number
  mean: [number, number, number]
  std: [number, number, number]
  /** Нужно ли применять sigmoid к выходу (логиты). */
  sigmoid: boolean
  /** Имя входа/выхода (null — первый). */
  input?: string
  /** Только для сравнения качества: лицензия не позволяет включить в проект. */
  referenceOnly?: boolean
  /** matte — маска объекта (по умолчанию), depth — относительная глубина (рельеф лица, а не силуэт). */
  kind?: 'matte' | 'depth'
  /** Бэкенды, на которых модель реально работает (по замерам PoC); первый — предпочтительный. */
  backends?: ('wasm' | 'webgpu')[]
  /** Внешние веса (.onnx_data) рядом с моделью. */
  data?: { path: string; url: string; bytes: number }
}
const hf = (repo: string, rev: string, file: string) => `https://huggingface.co/${repo}/resolve/${rev}/${file}`
const IMNET = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] }
const ZERO = { mean: [0, 0, 0] as [number, number, number], std: [1, 1, 1] as [number, number, number] }
const HALF = { mean: [0.5, 0.5, 0.5] as [number, number, number], std: [1, 1, 1] as [number, number, number] }

/** Где модель работает по замерам владельца: остальные бэкенды дают ошибку, пустую маску или минуты. depth — не проверено, оба. */
export const BACKENDS: Record<string, ('wasm' | 'webgpu')[]> = {
  'birefnet-lite-512-fp16': ['wasm'], 'birefnet-lite-512-fp32': ['wasm'],
  'ormbg-int8': ['wasm'], 'ormbg-fp16': ['wasm'],
  'inspyrenet-fp16': ['webgpu'],
  'isnet-imgly-fp16': ['webgpu'], 'isnet-imgly-fp32': ['webgpu'],
  'isnet-general-q': ['wasm', 'webgpu'], 'isnet-pim-q': ['wasm'], 'isnet-bw-fp32': ['wasm'],
  'u2netp': ['wasm'], 'u2net-bw-fp32': ['wasm'],
  'rmbg14-q': ['wasm', 'webgpu'],
  'depth-v2-small-q4f16': ['wasm', 'webgpu'], 'depth-v2-small-fp16': ['webgpu', 'wasm'],
}
export const backendsOf = (id: string): ('wasm' | 'webgpu')[] => BACKENDS[id] ?? ['wasm', 'webgpu']

export const CANDIDATES: Candidate[] = [
  { id: 'isnet-general-q', label: 'ISNet general int8 (Apache-2.0, 46 МБ)', url: hf('Ko033/isnet-general-use-onnx', '5349b617911fd60c619b52f32e2b593517b78df3', 'onnx/model_quantized.onnx'), bytes: 45902969, license: 'Apache-2.0', size: 1024, ...HALF, sigmoid: false },
  { id: 'u2netp', label: 'U²-Net-P (Apache-2.0, 4.6 МБ)', url: hf('Heliosoph/u2net-onnx', '7fc34deee10329bc039c10a73b98090d0c6f5c59', 'u2netp.onnx'), bytes: 4574861, license: 'Apache-2.0', size: 320, ...IMNET, sigmoid: false },
  { id: 'rmbg14-q', label: 'RMBG-1.4 int8 (Bria, NON-COMMERCIAL, 44 МБ) — эталон качества', url: hf('briaai/RMBG-1.4', '2ceba5a5efaec153162aedea169f76caf9b46cf8', 'onnx/model_quantized.onnx'), bytes: 44403226, license: 'bria-rmbg-1.4 (non-commercial)', size: 1024, ...HALF, sigmoid: false, referenceOnly: true },
  // второй раунд поиска (permissive-лицензии, ревизии закреплены)
  { id: 'birefnet-lite-512-fp16', label: 'BiRefNet-lite 512 fp16 (MIT, 98 МБ)', url: hf('studioludens/birefnet-lite-512', '962e67969ec6acec9c19fab76acee4f5e22e990c', 'onnx/model_fp16.onnx'), bytes: 98484532, license: 'MIT', size: 512, ...IMNET, sigmoid: true },
  { id: 'birefnet-lite-512-fp32', label: 'BiRefNet-lite 512 fp32 (MIT, 192 МБ)', url: hf('studioludens/birefnet-lite-512', '962e67969ec6acec9c19fab76acee4f5e22e990c', 'onnx/model.onnx'), bytes: 191877254, license: 'MIT', size: 512, ...IMNET, sigmoid: true },
  { id: 'ormbg-int8', label: 'ormbg int8 (Apache-2.0, 44 МБ)', url: hf('onnx-community/ormbg-ONNX', '034e2d884afbab897e10e78fc5bb566b29533fd6', 'onnx/model_int8.onnx'), bytes: 44315136, license: 'Apache-2.0', size: 1024, ...ZERO, sigmoid: false },
  { id: 'ormbg-fp16', label: 'ormbg fp16 (Apache-2.0, 88 МБ)', url: hf('onnx-community/ormbg-ONNX', '034e2d884afbab897e10e78fc5bb566b29533fd6', 'onnx/model_fp16.onnx'), bytes: 88117930, license: 'Apache-2.0', size: 1024, ...ZERO, sigmoid: false },
  // третий раунд: убраны BiRefNet-lite 1024 (std::bad_alloc на обоих бэкендах у владельца)
  { id: 'isnet-imgly-fp16', label: 'ISNet general imgly fp16 (MIT, 88 МБ)', url: hf('imgly/isnet-general-onnx', '440dea96dd4a3b06bbbf5abec3e26569dd7ec49f', 'onnx/model_fp16.onnx'), bytes: 88152708, license: 'MIT', size: 1024, mean: [0.502, 0.502, 0.502], std: [1.004, 1.004, 1.004], sigmoid: false },
  { id: 'isnet-imgly-fp32', label: 'ISNet general imgly fp32 (MIT, 176 МБ)', url: hf('imgly/isnet-general-onnx', '440dea96dd4a3b06bbbf5abec3e26569dd7ec49f', 'onnx/model.onnx'), bytes: 176149806, license: 'MIT', size: 1024, mean: [0.502, 0.502, 0.502], std: [1.004, 1.004, 1.004], sigmoid: false },
  { id: 'isnet-pim-q', label: 'ISNet pim-rmbg int8 (Apache-2.0, 44 МБ)', url: hf('drodriguezgdu/pim-rmbg-isnet', 'b6422ea5d8a184f0340f7a8dbf5c3a64eee95239', 'onnx/model_quantized.onnx'), bytes: 44229662, license: 'Apache-2.0', size: 1024, mean: [0.502, 0.502, 0.502], std: [1.004, 1.004, 1.004], sigmoid: false },
  { id: 'isnet-bw-fp32', label: 'IS-Net BritishWerewolf fp32 (Apache-2.0, 179 МБ)', url: hf('BritishWerewolf/IS-Net', '9783722d9f964c0286a411e7e8e6fede947d5a53', 'onnx/model.onnx'), bytes: 178648008, license: 'Apache-2.0', size: 1024, mean: [0.485, 0.456, 0.406], std: [1, 1, 1], sigmoid: false },
  { id: 'u2net-bw-fp32', label: 'U²-Net полная (Apache-2.0, 176 МБ)', url: hf('BritishWerewolf/U-2-Net', 'c08042b462485d8597c89d3ce831d00be8582c5c', 'onnx/model.onnx'), bytes: 175997641, license: 'Apache-2.0', size: 320, ...IMNET, sigmoid: false },
  { id: 'inspyrenet-fp16', label: 'InSPyReNet SwinB Plus Ultra fp16 (MIT, 199 МБ)', url: hf('OS-Software/InSPyReNet-SwinB-Plus-Ultra-ONNX', 'fe628d2d1465f775c707368a80248a2d5b5ad71f', 'onnx/model_fp16.onnx'), bytes: 199133027, license: 'MIT', size: 1024, ...IMNET, sigmoid: false },
  // карта глубины для рельефа (change 34): выход — относительная глубина, а не маска
  { id: 'depth-v2-small-q4f16', kind: 'depth', label: 'Depth Anything V2 Small q4f16 (Apache-2.0, 20 МБ) — глубина', url: hf('onnx-community/depth-anything-v2-small-ONNX', 'c3b67641fd837b2368757101311e5d21e511441e', 'onnx/model_q4f16.onnx'), bytes: 212397, data: { path: 'model_q4f16.onnx_data', url: hf('onnx-community/depth-anything-v2-small-ONNX', 'c3b67641fd837b2368757101311e5d21e511441e', 'onnx/model_q4f16.onnx_data'), bytes: 20200448 }, license: 'Apache-2.0', size: 518, ...IMNET, sigmoid: false },
  { id: 'depth-v2-small-fp16', kind: 'depth', label: 'Depth Anything V2 Small fp16 (Apache-2.0, 50 МБ) — глубина', url: hf('onnx-community/depth-anything-v2-small-ONNX', 'c3b67641fd837b2368757101311e5d21e511441e', 'onnx/model_fp16.onnx'), bytes: 180471, data: { path: 'model_fp16.onnx_data', url: hf('onnx-community/depth-anything-v2-small-ONNX', 'c3b67641fd837b2368757101311e5d21e511441e', 'onnx/model_fp16.onnx_data'), bytes: 50392064 }, license: 'Apache-2.0', size: 518, ...IMNET, sigmoid: false },
]
