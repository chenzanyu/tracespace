import { ComputeWorkerPool } from './workerPool'

const PRIORITY = Object.freeze({
  pipeline: 100,
  layerMesh: 80,
  pcb3d: 60,
  analysis: 40,
})

const hashString = (value) => {
  const str = String(value || '')
  let hash = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const normalizeType = (value) => (typeof value === 'string' ? value.toLowerCase() : '')

const normalizeSide = (value) => {
  if (!value) return undefined
  const side = String(value).toLowerCase()
  if (side === 'top' || side === 'bottom' || side === 'inner' || side === 'all') return side
  return undefined
}

const coerceGerberPayload = (value) => {
  if (typeof value === 'string') return { data: value, transfer: [] }
  if (value instanceof ArrayBuffer) return { data: value, transfer: [] }
  if (value instanceof Uint8Array) return { data: value, transfer: [] }
  return { data: String(value ?? ''), transfer: [] }
}

let sharedPool = null
let projectSeq = 0
let currentProject = null

const getPool = () => {
  if (!sharedPool) sharedPool = new ComputeWorkerPool()
  return sharedPool
}

const createProjectId = () => `p${Date.now().toString(36)}${++projectSeq}`

const buildLayerIdMap = (layersInput, existingMap = null, projectId = '') => {
  const map = existingMap || new Map()
  const counts = new Map()
  const entries = []
  for (const raw of layersInput || []) {
    const filename = raw?.filename || raw?.Filename || ''
    const keyBase = String(filename || '')
    const nextCount = (counts.get(keyBase) || 0) + 1
    counts.set(keyBase, nextCount)
    const key = nextCount === 1 ? keyBase : `${keyBase}#${nextCount}`
    let id = map.get(key)
    if (!id) {
      id = `${projectId}-${hashString(key).toString(36)}`
      map.set(key, id)
    }
    entries.push({ key, id, filename })
  }
  return { map, entries, counts }
}

const assignWorkerIndex = (poolSize, type, filename) => {
  const normalized = normalizeType(type)
  const name = String(filename || '').toLowerCase()
  const looksLikeDrill =
    normalized.includes('drill') || name.endsWith('.drl') || name.endsWith('.xln') || name.includes('drill')
  const looksLikeOutline = normalized.includes('outline')
  if (looksLikeOutline || looksLikeDrill) return 0
  if (poolSize <= 1) return 0
  return 1 + (hashString(filename) % (poolSize - 1))
}

export const disposeComputePool = () => {
  if (sharedPool) sharedPool.terminate()
  sharedPool = null
  currentProject = null
}

export const resetComputeProject = async () => {
  const pool = getPool()
  pool.cancelAll('compute project reset')
  currentProject = null
  await pool.broadcast({ action: 'reset', payload: {}, priority: PRIORITY.pipeline })
}

export const buildPipelineFromMemoryLayers = async (layersInput, options = {}) => {
  const pool = getPool()
  const projectId = currentProject?.id || createProjectId()
  const { map: layerIdMap, entries } = buildLayerIdMap(
    layersInput,
    currentProject?.layerIdMap || null,
    projectId
  )

  const layers = (layersInput || []).map((raw, index) => {
    const filename = raw?.filename || raw?.Filename || ''
    const type = normalizeType(raw?.type || raw?.Type)
    const side = normalizeSide(raw?.side || raw?.Side)
    const entry = entries[index]
    const id = entry?.id || `${projectId}-${hashString(filename).toString(36)}`
    return { id, filename, type: type || undefined, side }
  })

  currentProject = {
    id: projectId,
    layerIdMap,
    workerIndexByLayerId: new Map(),
  }

  await pool.broadcast({ action: 'reset', payload: { projectId }, priority: PRIORITY.pipeline })

  const workerCount = pool.instances.length || 1
  const parseHints = []
  const parseJobs = []

  layers.forEach((layer, index) => {
    const raw = layersInput[index]
    const filename = layer.filename
    const workerIndex = assignWorkerIndex(workerCount, layer.type, filename)
    currentProject.workerIndexByLayerId.set(layer.id, workerIndex)
    const { data, transfer } = coerceGerberPayload(raw?.gerber ?? raw?.Gerber)
    parseJobs.push(
      pool.enqueue({
        workerIndex,
        action: 'parse-layer',
        priority: PRIORITY.pipeline,
        transfer,
        payload: {
          projectId,
          layer: {
            id: layer.id,
            filename,
            type: layer.type,
            side: layer.side,
            gerber: data,
          },
        },
      })
    )
  })

  const parsed = await Promise.all(parseJobs)
  parsed.forEach((entry) => {
    if (entry?.hint) parseHints.push(entry.hint)
  })

  const pickFirst = (list, key) => {
    for (const entry of list) {
      const value = entry?.[key]
      if (value != null) return value
    }
    return undefined
  }
  const drillHints = parseHints.filter((hint) => hint.group === 'drill')
  const nonDrillHints = parseHints.filter((hint) => hint.group !== 'drill')
  const groupMeta = {
    drill: {
      units: pickFirst(drillHints, 'units'),
      format: pickFirst(drillHints, 'format'),
      zeroSuppression: pickFirst(drillHints, 'zeroSuppression'),
    },
    nonDrill: {
      units: pickFirst(nonDrillHints, 'units'),
      format: pickFirst(nonDrillHints, 'format'),
      zeroSuppression: pickFirst(nonDrillHints, 'zeroSuppression'),
    },
  }

  await pool.broadcast({
    action: 'apply-borrowed-meta',
    payload: { projectId, groupMeta },
    priority: PRIORITY.pipeline,
  })

  const plotSummaries = new Map()
  const plotJobs = layers.map((layer) =>
    pool.enqueue({
      workerIndex: currentProject.workerIndexByLayerId.get(layer.id) || 0,
      action: 'plot-layer',
      priority: PRIORITY.pipeline,
      payload: { projectId, layerId: layer.id },
    })
  )
  const plotted = await Promise.all(plotJobs)
  plotted.forEach((summary) => {
    if (!summary?.layerId) return
    plotSummaries.set(summary.layerId, summary)
  })

  const outlineLayer = layers.find((layer) => normalizeType(layer.type) === 'outline')
  const unitSourceId = outlineLayer?.id || layers[0]?.id
  const outlineUnits = unitSourceId ? plotSummaries.get(unitSourceId)?.units : undefined
  const fileUnits = outlineUnits === 'in' || outlineUnits === 'mm' ? outlineUnits : 'mm'

  const mmToUnits = (mm) => (fileUnits === 'mm' ? mm : mm / 25.4)
  const maxGapUnits = fileUnits === 'mm' ? mmToUnits(0.5) : 0.02

  const plotSizesById = {}
  layers.forEach((layer) => {
    const size = plotSummaries.get(layer.id)?.size
    if (Array.isArray(size)) plotSizesById[layer.id] = size
  })

  const drillLimit = Number(options.drillLimit)
  const drillLimitValue = Number.isFinite(drillLimit) && drillLimit > 0 ? drillLimit : Infinity

  const summary = await pool.enqueue({
    workerIndex: 0,
    action: 'compute-project-summary',
    priority: PRIORITY.pipeline,
    payload: {
      projectId,
      layers,
      plotSizesById,
      outlineLayerId: outlineLayer?.id || null,
      fileUnits,
      maxGapUnits,
      drillLimit: drillLimitValue,
    },
  })

  const plotTreesById = {}
  layers.forEach((layer) => {
    const summaryEntry = plotSummaries.get(layer.id)
    const size = summaryEntry?.size
    const rev = summaryEntry?.rev
    plotTreesById[layer.id] = {
      size: Array.isArray(size) ? size : null,
      rev: Number.isFinite(Number(rev)) ? Number(rev) : 0,
    }
  })

  const fm = {
    plotResult: {
      layers,
      plotTreesById,
      boardShape: summary?.boardShape ?? null,
    },
    parseTreesById: {},
    boardViewBox: summary?.boardViewBox ?? [0, 0, 0, 0],
    compositeViewBox: summary?.compositeViewBox ?? [0, 0, 0, 0],
    compositeWidthMm: summary?.compositeWidthMm ?? '0mm',
    compositeHeightMm: summary?.compositeHeightMm ?? '0mm',
    unitMeta: summary?.unitMeta ?? { units: fileUnits, mmPerUnit: fileUnits === 'mm' ? 1 : 25.4, unitsPerMm: fileUnits === 'mm' ? 1 : 1 / 25.4 },
    projectMeta: {
      projectId,
    },
    __compute: {
      projectId,
      drillShapes: summary?.drillShapes ?? null,
      drillStats: summary?.drillStats ?? null,
    },
  }

  return fm
}

export const enqueueComputeLayerMeshJob = ({ projectId, layerId, viewBox, unitsToPx }) => {
  const pool = getPool()
  if (!currentProject || currentProject.id !== projectId) {
    return Promise.reject(new Error('compute project not initialized'))
  }
  const workerIndex = currentProject.workerIndexByLayerId.get(layerId) || 0
  return pool.enqueue({
    workerIndex,
    action: 'build-layer-mesh',
    priority: PRIORITY.layerMesh,
    payload: { projectId, layerId, viewBox, unitsToPx },
  })
}

export const broadcastCompute3dGlobals = async ({ projectId, boardOutline, drillShapes }) => {
  const pool = getPool()
  if (!projectId) return
  await pool.broadcast({
    action: 'set-3d-globals',
    priority: PRIORITY.pcb3d,
    payload: { projectId, boardOutline, drillShapes },
  })
}

export const enqueueComputePcb3dJob = ({ projectId, payload }) => {
  const pool = getPool()
  if (!currentProject || currentProject.id !== projectId) {
    return Promise.reject(new Error('compute project not initialized'))
  }
  const routingLayerId = payload?.sourceLayerId ?? payload.layerId
  const workerIndex = currentProject.workerIndexByLayerId.get(routingLayerId) || 0
  return pool.enqueue({
    workerIndex,
    action: 'build-3d-layer',
    priority: PRIORITY.pcb3d,
    payload: { projectId, ...payload },
  })
}

export const enqueueComputeTraceDataJob = ({ projectId, layerIds }) => {
  const pool = getPool()
  if (!currentProject || currentProject.id !== projectId) {
    return Promise.reject(new Error('compute project not initialized'))
  }
  return pool.enqueue({
    workerIndex: 0,
    action: 'collect-trace-data',
    priority: PRIORITY.analysis,
    payload: { projectId, layerIds },
  })
}

export const enqueueComputeProjectSummaryJob = async ({
  projectId,
  layers,
  plotTreesById,
  fileUnits,
  maxGapUnits,
  drillLimit,
} = {}) => {
  const pool = getPool()
  if (!currentProject || currentProject.id !== projectId) {
    throw new Error('compute project not initialized')
  }
  const units = fileUnits === 'in' ? 'in' : 'mm'
  const plotSizesById = {}
  if (plotTreesById && typeof plotTreesById === 'object') {
    Object.entries(plotTreesById).forEach(([layerId, value]) => {
      const size = Array.isArray(value?.size) ? value.size : Array.isArray(value) ? value : null
      if (Array.isArray(size)) plotSizesById[layerId] = size
    })
  }
  const gapUnits =
    Number.isFinite(Number(maxGapUnits)) && Number(maxGapUnits) > 0
      ? Number(maxGapUnits)
      : units === 'mm'
        ? 0.5
        : 0.02
  const normalizedLayers = Array.isArray(layers) ? layers : []
  const outlineLayer = normalizedLayers.find((layer) => normalizeType(layer?.type) === 'outline')
  const outlineLayerId = outlineLayer?.id || null
  const limitValue = Number(drillLimit)
  const drillLimitValue =
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : Infinity
  return pool.enqueue({
    workerIndex: 0,
    action: 'compute-project-summary',
    priority: PRIORITY.pipeline,
    payload: {
      projectId,
      layers: normalizedLayers,
      plotSizesById,
      outlineLayerId,
      fileUnits: units,
      maxGapUnits: gapUnits,
      drillLimit: drillLimitValue,
    },
  })
}
