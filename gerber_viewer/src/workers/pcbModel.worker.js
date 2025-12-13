import * as THREE from 'three'
import {
  plot,
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  CIRCLE,
  RECTANGLE,
  POLYGON,
  LAYERED_SHAPE,
  OUTLINE,
  ARC,
} from '@tracespace/plotter'
import {renderThree} from './pcb-model/geometry/index.js'

const ACTION_BUILD_LAYER = 'build-layer'
const normalizeType = (value) => (typeof value === 'string' ? value.toLowerCase() : '')
const isDrillType = (value) => normalizeType(value).includes('drill')
const DRILL_SHAPE_FORMAT_IMAGE_TREES = 'drill-image-trees'

const normalizeColor = value => {
  try {
    return new THREE.Color(value ?? 0xffffff)
  } catch (error) {
    return new THREE.Color(0xffffff)
  }
}

const collectMeshChunks = (group) => {
  const chunks = []
  const transferList = []
  const seenBuffers = new Set()
  let totalByteLength = 0
  const pushTransferBuffer = buffer => {
    if (!buffer || seenBuffers.has(buffer)) return false
    seenBuffers.add(buffer)
    transferList.push(buffer)
    if (typeof buffer.byteLength === 'number') {
      totalByteLength += buffer.byteLength
    }
    return true
  }
  const chunkSummaries = []
  group.traverse(child => {
    if (!child?.isMesh || !child.geometry) return
    const geometry = child.geometry
    const chunk = {}
    const attributes = {}
    const packAttribute = (attribute) => {
      if (!attribute || !attribute.array) return null
      const array = attribute.array
      const buffer = array.buffer
      if (!buffer) return null
      pushTransferBuffer(buffer)
      return {
        array: buffer,
        arrayType: array.constructor.name,
        itemSize: attribute.itemSize,
        normalized: attribute.normalized ?? false,
        count: attribute.count ?? array.length / attribute.itemSize,
      }
    }
    attributes.position = packAttribute(geometry.getAttribute('position'))
    attributes.normal = packAttribute(geometry.getAttribute('normal'))
    attributes.uv = packAttribute(geometry.getAttribute('uv'))
    const indexAttr = geometry.getIndex?.() ?? geometry.index
    if (indexAttr && indexAttr.array && indexAttr.array.buffer) {
      const indexArray = indexAttr.array
      const indexBuffer = indexArray.buffer
      pushTransferBuffer(indexBuffer)
      chunk.index = {
        array: indexBuffer,
        arrayType: indexArray.constructor.name,
        count: indexAttr.count ?? indexArray.length,
      }
    } else {
      chunk.index = null
    }
    chunk.attributes = attributes
    chunk.material = {
      color: child.material?.color?.getHex(),
      transparent: child.material?.transparent ?? false,
      opacity: child.material?.opacity ?? 1,
    }
    chunk.metadata = child.userData ? {...child.userData} : null
    chunkSummaries.push({
      vertexCount: attributes.position?.count ?? 0,
      chunkType: child.type,
    })
    chunks.push(chunk)
  })
  group.traverse(obj => {
    if (obj.geometry?.dispose) obj.geometry.dispose()
    if (Array.isArray(obj.material)) {
      obj.material.forEach(mat => mat?.dispose?.())
    } else {
      obj.material?.dispose?.()
    }
  })
  return {chunks, transferList, chunkSummaries, totalByteLength}
}

const logWorker = (event, details = {}) => {
  try {
    console.log(`[pcbModel.worker] ${event}`, details)
  } catch (error) {
    // ignore logging failures
  }
}
const getWorkerPerfNow = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now())
const captureWorkerMemoryUsage = () => {
  if (typeof performance === 'undefined' || !performance.memory) return null
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
  if (!Number.isFinite(usedJSHeapSize)) return null
  return {
    usedBytes: usedJSHeapSize,
    totalBytes: totalJSHeapSize,
    limitBytes: jsHeapSizeLimit,
  }
}
const pushWorkerMemorySample = (metrics, snapshot) => {
  if (!metrics || !snapshot) return
  metrics.memorySamples.push({
    timestamp: Date.now(),
    ...snapshot,
  })
  if (!metrics.peakMemoryBytes || snapshot.usedBytes > metrics.peakMemoryBytes) {
    metrics.peakMemoryBytes = snapshot.usedBytes
  }
}
const createWorkerMetrics = () => ({
  startedAt: Date.now(),
  timeline: [],
  memorySamples: [],
  peakMemoryBytes: 0,
})
const measureWorkerStage = (metrics, name, fn) => {
  const memoryStart = captureWorkerMemoryUsage()
  pushWorkerMemorySample(metrics, memoryStart)
  const start = getWorkerPerfNow()
  try {
    return fn()
  } finally {
    const durationMs = Number((getWorkerPerfNow() - start).toFixed(2))
    const memoryEnd = captureWorkerMemoryUsage()
    pushWorkerMemorySample(metrics, memoryEnd)
    metrics.timeline.push({
      name,
      durationMs,
      memoryStart,
      memoryEnd,
    })
  }
}

const buildLayerPayload = payload => {
  const contextBase = {
    layerId: payload.layerId,
    type: payload.type,
    outline: payload.outline,
  }
  try {
    const {
      parseTree,
      plotTree,
      color,
      drillShapes,
      boardShapeRegions,
      boardBounds,
      boardClipRegions,
      boardShapePolygons,
      syntheticOutlineRegions: syntheticOutlineInput,
      simplifyTolerances,
    } = payload
    const metrics = createWorkerMetrics()
    const perfOrigin = getWorkerPerfNow()
    if (isDrillType(payload.type)) {
      measureWorkerStage(metrics, 'drill:passthrough', () => null)
      metrics.completedAt = Date.now()
      metrics.totalDurationMs = Number((getWorkerPerfNow() - perfOrigin).toFixed(2))
      metrics.vertexCount = 0
      metrics.meshByteLength = 0
      return {
        payload: {
          layerId: payload.layerId,
          type: payload.type,
          side: payload.side,
          color,
          mesh: null,
          meshSummary: { chunkCount: 0, totalVertices: 0, skipped: 'drill-layer' },
          metrics,
        },
        transferList: [],
      }
    }
    const syntheticOutlineRegions = Array.isArray(syntheticOutlineInput)
      ? syntheticOutlineInput.filter(Boolean)
      : null
    const hasSyntheticOutline =
      Array.isArray(syntheticOutlineRegions) && syntheticOutlineRegions.length > 0
    if (!parseTree && !hasSyntheticOutline) {
      throw new Error('Missing parse tree for layer job')
    }
    const boardClipPolygons =
      !hasSyntheticOutline
        ? measureWorkerStage(metrics, 'clip-polygons', () => buildClipPolygons(boardClipRegions))
        : null
    const providedPlotTree = !hasSyntheticOutline && plotTree ? plotTree : null
    const plottedTree = hasSyntheticOutline
      ? { children: syntheticOutlineRegions }
      : providedPlotTree
        ? providedPlotTree
        : measureWorkerStage(metrics, 'plot', () => plot(parseTree))
    const plotStage =
      hasSyntheticOutline || providedPlotTree
        ? null
        : metrics.timeline[metrics.timeline.length - 1]
    const imageTree = hasSyntheticOutline
      ? plottedTree
      : measureWorkerStage(metrics, 'filter-image-tree', () =>
          filterImageTree(plottedTree, boardBounds, boardClipPolygons)
        )
    console.log('[pcbModel.worker] imageTree stats', {
      ...contextBase,
      boardBounds,
      boardClipPolygonCount: boardClipPolygons?.length ?? 0,
      childCount: imageTree?.children?.length ?? 0,
      syntheticOutline: hasSyntheticOutline,
    })
    if (!hasSyntheticOutline) {
      if (providedPlotTree) {
        logWorker('plot-reused', {
          ...contextBase,
          childCount: imageTree?.children?.length ?? 0,
        })
      } else {
        logWorker('plot-complete', {
          ...contextBase,
          childCount: imageTree?.children?.length ?? 0,
          durationMs: plotStage?.durationMs ?? null,
        })
      }
    } else {
      logWorker('plot-skipped-synthetic-outline', {
        ...contextBase,
        childCount: imageTree?.children?.length ?? 0,
      })
    }
    let drillTrees = null
    if (
      drillShapes
      && typeof drillShapes === 'object'
      && drillShapes.format === DRILL_SHAPE_FORMAT_IMAGE_TREES
      && Array.isArray(drillShapes.imageTrees)
      && drillShapes.imageTrees.length
    ) {
      drillTrees = measureWorkerStage(metrics, 'drill:reuse', () => drillShapes.imageTrees)
      drillTrees = measureWorkerStage(metrics, 'clip-drills', () =>
        filterDrillTrees(drillTrees, boardBounds, boardClipPolygons)
      )
    } else if (Array.isArray(drillShapes) && drillShapes.length) {
      drillTrees = measureWorkerStage(metrics, 'plot-drills', () => {
        const produced = []
        for (const tree of drillShapes) {
          try {
            const parsed = plot(tree)
            if (parsed) produced.push(parsed)
          } catch (error) {
            console.warn('[pcbModel.worker] Failed to plot drill tree', error)
          }
        }
        return produced
      })
      drillTrees = measureWorkerStage(metrics, 'clip-drills', () =>
        filterDrillTrees(drillTrees, boardBounds, boardClipPolygons)
      )
    }
    let group = null
    try {
      group = measureWorkerStage(metrics, 'render-three', () =>
        renderThree(
          imageTree,
          normalizeColor(color),
          () => {},
          payload.outline,
          drillTrees,
          boardShapeRegions,
          payload.type,
          boardBounds,
          boardClipRegions,
          boardShapePolygons,
          simplifyTolerances,
          metrics
        )
      )
      logWorker('renderThree-complete', {
        ...contextBase,
        durationMs: metrics.timeline[metrics.timeline.length - 1]?.durationMs ?? null,
      })
    } catch (error) {
      const context = {
        ...contextBase,
        boardBounds,
        boardShapeRegionCount: boardShapeRegions?.length ?? 0,
        boardClipPolygonCount: boardClipPolygons?.length ?? 0,
        drillTreeCount: drillTrees?.length ?? 0,
      }
      console.error('[pcbModel.worker] renderThree failed', {
        ...context,
        message: error?.message,
        stack: error?.stack,
      })
      const contextJson = safeStringify(context)
      throw new Error(`${error?.message || 'render failure'} | ctx=${contextJson}`)
    }
    console.log('[pcbModel.worker] renderThree output', {
      ...contextBase,
      meshCount: group.children?.length ?? 0,
    })
    const meshResult = measureWorkerStage(metrics, 'collect-mesh', () => collectMeshChunks(group))
    const {chunks, transferList, chunkSummaries, totalByteLength = 0} = meshResult
    const summary = summarizeChunks(chunkSummaries)
    metrics.meshByteLength = totalByteLength
    if (!metrics.peakMemoryBytes || totalByteLength > metrics.peakMemoryBytes) {
      metrics.peakMemoryBytes = totalByteLength
    }
    metrics.completedAt = Date.now()
    metrics.totalDurationMs = Number((getWorkerPerfNow() - perfOrigin).toFixed(2))
    metrics.vertexCount = summary.totalVertices
    return {
      payload: {
        layerId: payload.layerId,
        type: payload.type,
        side: payload.side,
        color,
        mesh: {
          format: 'buffer-geometry',
          chunks,
          summary,
        },
        meshSummary: summary,
        metrics,
      },
      transferList,
    }
  } catch (error) {
    const contextJson = safeStringify({
      ...contextBase,
      message: error?.message,
    })
    console.error('[pcbModel.worker] build-layer failed', {
      ...contextBase,
      message: error?.message,
      stack: error?.stack,
    })
    throw new Error(`${error?.message || 'worker failure'} | ctx=${contextJson}`)
  }
}

const safeStringify = (value) => {
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.warn('[pcbModel.worker] Failed to stringify context', error)
    return '[context serialization failed]'
  }
}

const summarizeChunks = (entries) => {
  const chunkCount = entries.length
  const totalVertices = entries.reduce((sum, entry) => sum + (entry.vertexCount || 0), 0)
  return {
    chunkCount,
    totalVertices,
  }
}

self.onmessage = event => {
  const {jobId, action, payload} = event.data || {}
  if (!jobId) return
  try {
    if (action === ACTION_BUILD_LAYER) {
      const {payload: result, transferList} = buildLayerPayload(payload)
      self.postMessage({jobId, success: true, result}, transferList)
      return
    }
    throw new Error(`Unsupported action: ${action}`)
  } catch (error) {
    self.postMessage({jobId, success: false, message: error?.message || String(error)})
  }
}

const toPoint = position => [Number(position?.[0]) || 0, Number(position?.[1]) || 0]
const positionsClose = (a, b, eps = 1e-6) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const extendBoundsWithPoint = (bounds, point) => {
  const [x, y] = point
  if (!bounds) {
    return {minX: x, minY: y, maxX: x, maxY: y}
  }
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  }
}

const approximateArcPoints = segment => {
  const startAngle = segment?.start?.[2]
  const endAngle = segment?.end?.[2]
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toPoint(segment.start)
  const endRaw = toPoint(segment.end)
  if (Math.abs(sweep) < 1e-7 && distanceSquared(startRaw, endRaw) < 1e-12) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const steps = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 16)))
  const [cx, cy] = toPoint(segment.center)
  const radius = Number(segment.radius) || 0
  const points = []
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

const distanceSquared = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

const boundsFromSegments = segments => {
  if (!Array.isArray(segments) || segments.length === 0) return null
  let bounds = null
  for (const segment of segments) {
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.start))
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.end))
    if (segment.type === ARC) {
      const arcPts = approximateArcPoints(segment)
      arcPts.forEach(pt => {
        bounds = extendBoundsWithPoint(bounds, pt)
      })
    }
  }
  return bounds
}

const shapeBounds = shape => {
  if (!shape) return null
  switch (shape.type) {
    case CIRCLE:
      return {
        minX: shape.cx - shape.r,
        minY: shape.cy - shape.r,
        maxX: shape.cx + shape.r,
        maxY: shape.cy + shape.r,
      }
    case RECTANGLE:
      return {
        minX: shape.x,
        minY: shape.y,
        maxX: shape.x + shape.xSize,
        maxY: shape.y + shape.ySize,
      }
    case POLYGON:
      return boundsFromSegments(
        shape.points?.map((point, index, arr) => ({
          type: 'line',
          start: point,
          end: arr[(index + 1) % arr.length],
        })) || []
      )
    case OUTLINE:
      return boundsFromSegments(shape.segments)
    case LAYERED_SHAPE: {
      let merged = null
      for (const sub of shape.shapes || []) {
        const subBounds = shapeBounds(sub)
        if (subBounds) {
          merged = merged
            ? {
                minX: Math.min(merged.minX, subBounds.minX),
                minY: Math.min(merged.minY, subBounds.minY),
                maxX: Math.max(merged.maxX, subBounds.maxX),
                maxY: Math.max(merged.maxY, subBounds.maxY),
              }
            : subBounds
        }
      }
      return merged
    }
    default:
      return null
  }
}

const elementBounds = element => {
  if (!element) return null
  if (element.type === IMAGE_PATH || element.type === IMAGE_REGION) {
    return boundsFromSegments(element.segments)
  }
  if (element.type === IMAGE_SHAPE) {
    return shapeBounds(element.shape)
  }
  return null
}

const boundsIntersect = (bounds, minX, minY, maxX, maxY) => {
  if (
    !bounds ||
    minX === null ||
    minY === null ||
    maxX === null ||
    maxY === null
  ) {
    return true
  }
  return (
    bounds.maxX >= minX &&
    bounds.minX <= maxX &&
    bounds.maxY >= minY &&
    bounds.minY <= maxY
  )
}

const filterImageTree = (imageTree, bounds, clipPolygons) => {
  if (!imageTree || !Array.isArray(imageTree.children)) return imageTree
  const useBounds = Array.isArray(bounds) && bounds.length >= 4
  const [minX, minY, maxX, maxY] = useBounds
    ? [
        Math.min(bounds[0], bounds[2]),
        Math.min(bounds[1], bounds[3]),
        Math.max(bounds[0], bounds[2]),
        Math.max(bounds[1], bounds[3]),
      ]
    : [null, null, null, null]
  if (!useBounds && !clipPolygons) return imageTree
  const filteredChildren = imageTree.children.filter(child => {
    const childBounds = elementBounds(child)
    if (
      useBounds &&
      !boundsIntersect(childBounds, minX, minY, maxX, maxY)
    ) {
      return false
    }
    if (clipPolygons && !elementInsideClip(child, clipPolygons)) {
      return false
    }
    return true
  })
  if (filteredChildren.length === imageTree.children.length) return imageTree
  return {...imageTree, children: filteredChildren}
}

const buildClipPolygons = regions => {
  if (!Array.isArray(regions) || regions.length === 0) return null
  const polygons = []
  for (const region of regions) {
    const polygon = segmentsToPolygon(region?.segments)
    if (polygon?.length >= 3) polygons.push(polygon)
  }
  return polygons.length ? polygons : null
}

const segmentsToPolygon = segments => {
  if (!Array.isArray(segments) || segments.length === 0) return null
  const loop = []
  const first = toPoint(segments[0].start)
  loop.push(first)
  for (const segment of segments) {
    if (loop.length > 100000) {
      console.warn('[pcbModel.worker] Aborting polygon conversion, segment count too large', {
        segmentCount: segments.length,
      })
      break
    }
    if (segment.type === ARC) {
      const arcPoints = approximateArcPoints(segment)
      arcPoints.forEach(pt => loop.push(pt))
      loop.push(toPoint(segment.end))
    } else {
      loop.push(toPoint(segment.end))
    }
  }
  if (!positionsClose(loop[0], loop[loop.length - 1])) {
    loop.push([...loop[0]])
  }
  return loop
}

const pointInPolygon = (point, polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] <
        ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

const elementInsideClip = (element, polygons) => {
  if (!Array.isArray(polygons) || polygons.length === 0) return true
  const points = collectElementPoints(element)
  if (!points.length) return true
  return points.some(point =>
    polygons.some(polygon => pointInPolygon(point, polygon))
  )
}

const collectElementPoints = element => {
  if (!element) return []
  if (element.type === IMAGE_REGION || element.type === IMAGE_PATH) {
    const samples = []
    const segments = element.segments || []
    for (const segment of segments) {
      const start = toPoint(segment.start)
      const end = toPoint(segment.end)
      samples.push(start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2])
    }
    return samples
  }
  if (element.type === IMAGE_SHAPE) {
    const bounds = shapeBounds(element.shape)
    if (bounds) {
      return [[(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2]]
    }
  }
  return []
}

const filterDrillTrees = (drillTrees, bounds, clipPolygons) => {
  if (!Array.isArray(drillTrees) || drillTrees.length === 0) return drillTrees
  return drillTrees
    .map(tree => filterImageTree(tree, bounds, clipPolygons))
    .filter(tree => tree && Array.isArray(tree.children) && tree.children.length > 0)
}
