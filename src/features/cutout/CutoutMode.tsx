import { log } from '../../app/activityLog'
import { fmtSize } from '../../app/logText'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addCutout, cutoutLayout, defaultCutout, newCutoutId, type Cutout, type CutoutParams, type MeshSource } from '../../geometry/cutout'
import { axisMm } from '../../geometry/baseplate'
import { StlError, defaultOrientation, type IndexedMesh } from '../../geometry/stl-import'
import { validateCutout } from '../../geometry/cutout'
import { usePersistedState } from '../../app/usePersistedState'
import { getModelClient, useModel } from '../../app/useModel'
import { recordSession } from '../../app/lastSession'
import { Workspace } from '../../app/Workspace'
import { ExportPanel } from '../export/ExportPanel'
import { openMeshStore, type MeshStore } from './meshStore'
import { importStl, LARGE_STL_BYTES } from './importStl'
import { migrateCutout } from './migrate'
import { CutoutPanel } from './CutoutPanel'

const PARAMS_KEY = 'gridfinity.cutout'

export function CutoutMode() {
  const { t } = useTranslation()
  const [p, setP] = usePersistedState<CutoutParams>(PARAMS_KEY, defaultCutout, migrateCutout)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const [snap, setSnap] = useState(true)
  const [meshes, setMeshes] = useState<Map<string, IndexedMesh>>(new Map())
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'warn' | 'info'; text: string } | null>(null)
  const store = useRef<MeshStore | null>(null)

  // сетки из хранилища → память и воркер; генерация начинается, когда все доступные сетки зарегистрированы
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      store.current = await openMeshStore()
      const loaded = new Map<string, IndexedMesh>()
      for (const c of p.cutouts) {
        if (c.source.kind !== 'mesh' || loaded.has(c.source.meshId)) continue
        const m = await store.current.load(c.source.meshId)
        if (m) { loaded.set(c.source.meshId, m); getModelClient().registerMesh(c.source.meshId, m) }
      }
      if (cancelled) return
      setMeshes(loaded)
      setReady(true)
    })()
    return () => { cancelled = true }
    // только при открытии режима
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // удалённые вырезы освобождают хранилище
  useEffect(() => {
    if (!ready || !store.current) return
    const used = new Set(p.cutouts.flatMap((c) => (c.source.kind === 'mesh' ? [c.source.meshId] : [])))
    for (const id of meshes.keys()) if (!used.has(id)) { void store.current.remove(id); setMeshes((m) => { const n = new Map(m); n.delete(id); return n }) }
  }, [p.cutouts, ready, meshes])

  const key = JSON.stringify(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => p, [key])
  const check = validateCutout(params)
  const valid = check.ok
  const { model, pending, error } = useModel('cutout', params, { enabled: valid && ready, invalid: check.errors.map((e) => e.key) })

  useEffect(() => { recordSession('cutout', `${p.cutouts.length}`) }, [p.cutouts.length])

  const onImport = useCallback(async (file: File) => {
    setMessage({ kind: 'info', text: t('cutout.import.importing', { name: file.name }) })
    try {
      const imported = importStl(await file.arrayBuffer())
      log.info('image', 'log.image.meshImported', { name: file.name, size: fmtSize(imported.sizeBytes), triangles: Math.floor(imported.mesh.triVerts.length / 3) })
      const meshId = newCutoutId()
      await store.current?.save(meshId, imported.mesh)
      getModelClient().registerMesh(meshId, imported.mesh)
      setMeshes((m) => new Map(m).set(meshId, imported.mesh))
      const source: MeshSource = { kind: 'mesh', meshId, filename: file.name, unit: 'mm', orientation: defaultOrientation, mode: 'projected', size: imported.info.size, hull: imported.info.hull }
      const l = cutoutLayout(p)
      const c: Cutout = { id: newCutoutId(), name: file.name.replace(/\.stl$/i, ''), source, x: 0, y: 0, rotation: 0, depth: Math.min(Math.max(imported.info.size[2] + 1, 5), l.maxDepth), clearance: 0.5, visible: true }
      setP((o) => ({ ...o, cutouts: addCutout(o.cutouts, c) }))
      setSelectedId(c.id)
      const warns: string[] = []
      if (imported.open) warns.push(t('cutout.import.open'))
      if (imported.sizeBytes > LARGE_STL_BYTES) warns.push(t('cutout.import.large', { mb: (imported.sizeBytes / 1048576).toFixed(1) }))
      if (store.current && !store.current.persistent) warns.push(t('cutout.import.notPersisted'))
      setMessage(warns.length ? { kind: 'warn', text: warns.join(' ') } : null)
    } catch (e) {
      const code = e instanceof StlError ? e.code : 'invalid'
      log.error('image', 'log.image.meshFailed', { name: file.name }, `${code}${e instanceof Error && e.message ? `: ${e.message}` : ''}`)
      setMessage({ kind: 'error', text: t(`cutout.import.${code}`) })
    }
  }, [p, setP, t])

  const nameBase = `cutout_${Math.round(axisMm(p.x, p.pitch))}x${Math.round(axisMm(p.y, p.pitch))}`
  return (
    <Workspace
      model={model}
      onStartOver={() => { setP(defaultCutout); setSelectedId(null); setDraft(null); setMessage(null) }} modeName={t('modes.cutout')}
      panel={<CutoutPanel params={p} onChange={setP} selectedId={selectedId} onSelect={setSelectedId} meshes={meshes} onImport={(f) => void onImport(f)} importMessage={message}
        draft={draft} onDraft={setDraft} snap={snap} onSnap={setSnap} generationError={error} />}
      footer={<ExportPanel model={model} busy={pending} name={nameBase} />}
    />
  )
}
