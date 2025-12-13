import * as parser from '@tracespace/parser'
import { UNITS as P_UNITS, COORDINATE_FORMAT as P_COORDFMT } from '@tracespace/parser'
import * as plotter from '@tracespace/plotter'
import { plotBoardShape } from '@tracespace/core'

let activeProjectId = null
const layerStateById = new Map()
let boardShapeCache = null
let layerMeshBuilder = null
let pcbModelBuilder = null
let traceCollector = null

const normalizeType = (value) => (typeof value === 'string' ? value.toLowerCase() : '')
const isDrillType = (value) => normalizeType(value).includes('drill')
const DRILL_SHAPE_FORMAT_IMAGE_TREES = 'drill-image-trees'

const safeDecodeGerber = (value) => {
  if (typeof value === 'string') return value
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value))
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  return String(value ?? '')
}

const extractMetaHint = (parseTree, type) => {
  const hint = {
    group: isDrillType(type) ? 'drill' : 'nonDrill',
    units: undefined,
    format: undefined,
    zeroSuppression: undefined,
  }
  const nodes = parseTree?.children
  if (!Array.isArray(nodes)) return hint
  for (const node of nodes) {
    if (!hint.units && node?.type === P_UNITS && node.units) {
      hint.units = node.units
    }
    if (!hint.format && node?.type === P_COORDFMT && node.format) {
      hint.format = node.format
    }
    if (!hint.zeroSuppression && node?.type === P_COORDFMT && node.zeroSuppression) {
      hint.zeroSuppression = node.zeroSuppression
    }
    if (hint.units && hint.format && hint.zeroSuppression) break
  }
  return hint
}

const applyBorrowedMetaToTree = (parseTree, meta) => {
  if (!parseTree?.children || !meta) return
  const nodes = parseTree.children
  const hasUnits = nodes.some((n) => n?.type === P_UNITS)
  const hasFormat = nodes.some((n) => n?.type === P_COORDFMT)
  if (hasUnits && hasFormat) return
  const inserts = []
  if (!hasUnits && meta.units) inserts.push({ type: P_UNITS, units: meta.units })
  if (!hasFormat && (meta.format || meta.zeroSuppression)) {
    inserts.push({
      type: P_COORDFMT,
      format: meta.format,
      zeroSuppression: meta.zeroSuppression,
    })
  }
  if (inserts.length) parseTree.children = [...inserts, ...nodes]
}

const sizeToViewBox = (box) => {
  if (!Array.isArray(box) || box.length < 4 || plotter.BoundingBox.isEmpty(box)) return [0, 0, 0, 0]
  const [minX, minY, maxX, maxY] = box
  return [minX, -maxY, maxX - minX, maxY - minY]
}

const getWorkerPerfNow = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now())

const ensureLayerMeshBuilder = async () => {
  if (!layerMeshBuilder) {
    layerMeshBuilder = await import('./layerMesh.builder.js')
  }
  return layerMeshBuilder
}

const ensurePcbModelBuilder = async () => {
  if (!pcbModelBuilder) {
    pcbModelBuilder = await import('./pcbModel.builder.js')
  }
  return pcbModelBuilder
}

const ensureTraceCollector = async () => {
  if (!traceCollector) {
    traceCollector = await import('../libs/analyze/traceCollector.js')
  }
  return traceCollector
}

const buildDrillShapesPayload = ({ layers, drillLimit }) => {
  if (!Array.isArray(layers) || layers.length === 0) return null
  const drillLayers = layers.filter((layer) => isDrillType(layer?.type))
  if (!drillLayers.length) return null
  const imageEntries = []
  for (const layer of drillLayers) {
    const state = layerStateById.get(layer.id)
    const tree = state?.plotTree
    if (tree && Array.isArray(tree.children) && tree.children.length) {
      imageEntries.push({ layerId: layer.id, tree })
    }
  }
  if (imageEntries.length === 0) return null

  const totalElements = imageEntries.reduce((sum, entry) => sum + (entry.tree?.children?.length || 0), 0)
  if (totalElements === 0) return null

  const limit = Number.isFinite(drillLimit) ? drillLimit : Infinity
  if (!Number.isFinite(limit) || limit <= 0 || totalElements <= limit) {
    return {
      drillShapes: {
        format: DRILL_SHAPE_FORMAT_IMAGE_TREES,
        version: 1,
        layerIds: imageEntries.map((entry) => entry.layerId),
        imageTrees: imageEntries.map((entry) => entry.tree),
      },
      stats: null,
    }
  }

  const keep = []
  const keepLayerIds = []
  let kept = 0
  for (const entry of imageEntries) {
    if (!Array.isArray(entry.tree.children)) continue
    const remaining = Math.max(0, limit - kept)
    if (remaining <= 0) break
    if (entry.tree.children.length <= remaining) {
      keep.push(entry.tree)
      keepLayerIds.push(entry.layerId)
      kept += entry.tree.children.length
      continue
    }
    const sliced = { ...entry.tree, children: entry.tree.children.slice(0, remaining) }
    keep.push(sliced)
    keepLayerIds.push(entry.layerId)
    kept += remaining
    break
  }

  return {
    drillShapes: {
      format: DRILL_SHAPE_FORMAT_IMAGE_TREES,
      version: 1,
      layerIds: keepLayerIds,
      imageTrees: keep,
    },
    stats: {
      applied: true,
      total: totalElements,
      kept,
      dropped: Math.max(0, totalElements - kept),
      limit,
    },
  }
}

const handleReset = (payload) => {
  activeProjectId = payload?.projectId ?? null
  layerStateById.clear()
  boardShapeCache = null
}

const handleParseLayer = (payload) => {
  const layer = payload?.layer
  if (!layer?.id) throw new Error('Missing layer id')
  const contents = safeDecodeGerber(layer.gerber)
  const parseTree = parser.parse(contents)
  const hint = extractMetaHint(parseTree, layer.type)
  layerStateById.set(layer.id, {
    id: layer.id,
    filename: layer.filename || '',
    type: layer.type,
    side: layer.side,
    parseTree,
    plotTree: null,
    plotUnits: null,
    plotSize: null,
    plotRev: 0,
  })
  return { layerId: layer.id, hint }
}

const handleApplyBorrowedMeta = (payload) => {
  const groupMeta = payload?.groupMeta
  for (const entry of layerStateById.values()) {
    const group = isDrillType(entry.type) ? 'drill' : 'nonDrill'
    const meta = groupMeta?.[group]
    if (!meta) continue
    applyBorrowedMetaToTree(entry.parseTree, meta)
  }
  return { ok: true }
}

const handlePlotLayer = (payload) => {
  const layerId = payload?.layerId
  const entry = layerStateById.get(layerId)
  if (!entry?.parseTree) throw new Error('Missing parse tree')
  const plotTree = plotter.plot(entry.parseTree)
  entry.plotTree = plotTree
  entry.plotUnits = plotTree?.units ?? null
  entry.plotSize = Array.isArray(plotTree?.size) ? plotTree.size : null
  entry.plotRev = (entry.plotRev || 0) + 1
  return { layerId, size: entry.plotSize, units: entry.plotUnits, rev: entry.plotRev }
}

const handleComputeProjectSummary = (payload) => {
  const layers = payload?.layers || []
  const plotSizesById = payload?.plotSizesById || {}
  const outlineLayerId = payload?.outlineLayerId
  const fileUnits = payload?.fileUnits === 'in' ? 'in' : 'mm'
  const unitsToMm = (val) => (fileUnits === 'mm' ? val : val * 25.4)

  const plotTreesById = {}
  for (const layer of layers) {
    const size = plotSizesById[layer.id]
    plotTreesById[layer.id] = { size: Array.isArray(size) ? size : null }
  }
  if (outlineLayerId) {
    const outlineState = layerStateById.get(outlineLayerId)
    if (outlineState?.plotTree) {
      plotTreesById[outlineLayerId] = outlineState.plotTree
    }
  }

  const maxGapUnits = Number(payload?.maxGapUnits) || 0.02
  const boardShape = plotBoardShape(layers, plotTreesById, maxGapUnits)
  boardShapeCache = boardShape

  const nonDrillBoxes = layers
    .filter((layer) => !isDrillType(layer.type))
    .map((layer) => plotSizesById[layer.id])
    .filter((box) => Array.isArray(box) && !plotter.BoundingBox.isEmpty(box))
  const fallbackBoxes = nonDrillBoxes.length
    ? nonDrillBoxes
    : layers
        .map((layer) => plotSizesById[layer.id])
        .filter((box) => Array.isArray(box) && !plotter.BoundingBox.isEmpty(box))
  const compositeBox = plotter.BoundingBox.sum(fallbackBoxes)
  const compositeViewBox = sizeToViewBox(compositeBox)
  const boardViewBox = sizeToViewBox(boardShape?.size)

  const compositeWidthMm = `${unitsToMm(compositeViewBox[2] || 0)}mm`
  const compositeHeightMm = `${unitsToMm(compositeViewBox[3] || 0)}mm`
  const mmPerUnit = unitsToMm(1) || 1
  const unitsPerMm = 1 / mmPerUnit

  const drillPayload = buildDrillShapesPayload({ layers, drillLimit: payload?.drillLimit })

  return {
    boardShape,
    boardViewBox,
    compositeViewBox,
    compositeWidthMm,
    compositeHeightMm,
    unitMeta: {
      units: fileUnits,
      mmPerUnit,
      unitsPerMm,
    },
    drillShapes: drillPayload?.drillShapes ?? null,
    drillStats: drillPayload?.stats ?? null,
  }
}

const handleBuildLayerMesh = async (payload) => {
  const layerId = payload?.layerId
  const entry = layerStateById.get(layerId)
  if (!entry?.plotTree) throw new Error('Missing plot tree')
  const viewBox = Array.isArray(payload?.viewBox) ? payload.viewBox : [0, 0, 0, 0]
  const unitsToPx = Number(payload?.unitsToPx) || 1
  const ctx = { viewBox, unitsToPx }
  const { buildLayerMeshChunks } = await ensureLayerMeshBuilder()
  const chunks = buildLayerMeshChunks(entry.plotTree, ctx)
  const transferSet = new Set()
  for (const chunk of chunks) {
    if (chunk.solid?.positions?.buffer) transferSet.add(chunk.solid.positions.buffer)
    if (chunk.solid?.indices?.buffer) transferSet.add(chunk.solid.indices.buffer)
    if (chunk.mask?.positions?.buffer) transferSet.add(chunk.mask.positions.buffer)
    if (chunk.mask?.indices?.buffer) transferSet.add(chunk.mask.indices.buffer)
  }
  return { result: { layerId, chunks }, transfer: Array.from(transferSet) }
}

let globals3d = {
  boardOutline: null,
  drillShapes: null,
}

const handleSet3dGlobals = (payload) => {
  globals3d.boardOutline = payload?.boardOutline ?? null
  globals3d.drillShapes = payload?.drillShapes ?? null
  return { ok: true }
}

const handleBuild3dLayer = async (payload) => {
  const layerId = payload?.layerId
  const entry = layerStateById.get(layerId)
  const plotTree = entry?.plotTree ?? null
  const parseTree = entry?.parseTree ?? null
  const { buildPcbLayerPayload } = await ensurePcbModelBuilder()
  const start = getWorkerPerfNow()
  const jobPayload = {
    ...payload,
    plotTree,
    parseTree,
    boardShapeRegions: globals3d.boardOutline?.regions,
    boardShapePolygons: globals3d.boardOutline?.polygons,
    boardClipRegions: globals3d.boardOutline?.regions,
    boardBounds: globals3d.boardOutline?.bounds,
    drillShapes: globals3d.drillShapes,
  }
  const { payload: result, transferList } = buildPcbLayerPayload(jobPayload)
  return {
    result: {
      ...result,
      metrics: result?.metrics ? { ...result.metrics, computeWorkerMs: Number((getWorkerPerfNow() - start).toFixed(2)) } : result?.metrics,
    },
    transfer: transferList,
  }
}

const handleCollectTraceData = async (payload) => {
  const layerIds = Array.isArray(payload?.layerIds) ? payload.layerIds : []
  const ids = layerIds.filter(Boolean)
  const { collectTraceDataForParseTree } = await ensureTraceCollector()
  const result = {}
  for (const layerId of ids) {
    const entry = layerStateById.get(layerId)
    if (!entry?.parseTree) continue
    try {
      result[layerId] = collectTraceDataForParseTree(entry.parseTree)
    } catch (error) {
      // ignore per-layer failures
    }
  }
  return { traceDataByLayerId: result }
}

const dispatch = async (action, payload) => {
  switch (action) {
    case 'reset':
      return handleReset(payload)
    case 'parse-layer':
      return handleParseLayer(payload)
    case 'apply-borrowed-meta':
      return handleApplyBorrowedMeta(payload)
    case 'plot-layer':
      return handlePlotLayer(payload)
    case 'compute-project-summary':
      return handleComputeProjectSummary(payload)
    case 'build-layer-mesh':
      return handleBuildLayerMesh(payload)
    case 'set-3d-globals':
      return handleSet3dGlobals(payload)
    case 'build-3d-layer':
      return handleBuild3dLayer(payload)
    case 'collect-trace-data':
      return handleCollectTraceData(payload)
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}

self.onmessage = (event) => {
  const { jobId, action, payload } = event.data || {}
  if (!jobId) return
  const projectId = payload?.projectId
  if (action !== 'reset') {
    if (projectId && activeProjectId && projectId !== activeProjectId) {
      self.postMessage({ jobId, success: false, error: 'stale project' })
      return
    }
    if (projectId && !activeProjectId) activeProjectId = projectId
  }
  Promise.resolve()
    .then(async () => {
      const output = await dispatch(action, payload)
      if (output && output.transfer) {
        self.postMessage({ jobId, success: true, result: output.result }, output.transfer)
      } else {
        self.postMessage({ jobId, success: true, result: output })
      }
    })
    .catch((error) => {
      self.postMessage({ jobId, success: false, error: error?.message || String(error) })
    })
}
