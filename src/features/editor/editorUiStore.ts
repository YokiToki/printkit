export interface EditorUiState {
  importUnit: 'mm' | 'in'
  rememberUnit: boolean
  tool: 'select' | 'translate' | 'rotate' | 'scale'
  snap: boolean
  snapStepMm: number
  snapStepDeg: number
  projection: 'persp' | 'ortho'
  outlinerOpen: boolean
  propertiesOpen: boolean
}

export const DEFAULT_EDITOR_UI: EditorUiState = {
  importUnit: 'mm',
  rememberUnit: false,
  tool: 'select',
  snap: true,
  snapStepMm: 5,
  snapStepDeg: 15,
  projection: 'persp',
  outlinerOpen: true,
  propertiesOpen: true,
}

const STORAGE_KEY = 'editor.ui'

export function loadEditorUi(): EditorUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDITOR_UI }
    const parsed = JSON.parse(raw)
    return {
      importUnit: parsed.importUnit === 'in' ? 'in' : 'mm',
      rememberUnit: Boolean(parsed.rememberUnit),
      tool: ['select', 'translate', 'rotate', 'scale'].includes(parsed.tool) ? parsed.tool : 'select',
      snap: parsed.snap !== undefined ? Boolean(parsed.snap) : true,
      snapStepMm: Number.isFinite(parsed.snapStepMm) && parsed.snapStepMm > 0 ? parsed.snapStepMm : 5,
      snapStepDeg: Number.isFinite(parsed.snapStepDeg) && parsed.snapStepDeg > 0 ? parsed.snapStepDeg : 15,
      projection: parsed.projection === 'ortho' ? 'ortho' : 'persp',
      outlinerOpen: parsed.outlinerOpen !== undefined ? Boolean(parsed.outlinerOpen) : true,
      propertiesOpen: parsed.propertiesOpen !== undefined ? Boolean(parsed.propertiesOpen) : true,
    }
  } catch {
    return { ...DEFAULT_EDITOR_UI }
  }
}

export function saveEditorUi(patch: Partial<EditorUiState>): EditorUiState {
  const current = loadEditorUi()
  const next = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage quota errors
  }
  return next
}
