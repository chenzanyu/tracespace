import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import {CLEAR} from '@tracespace/parser'
import {
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  POLYGON,
  CIRCLE,
  RECTANGLE,
  LAYERED_SHAPE,
  OUTLINE,
  ARC,
  LINE,
} from '@tracespace/plotter'
import {extrudeSettings} from './config'
import {
  renderImageOutline,
  createOutlineState,
  finalizeOutlineState,
  appendSegmentsToPath,
} from './outline'
import {renderImagePath} from './path'
import {renderImageRegion} from './region'
import {renderImageShape, drawRoundedRect} from './shape'

const PLANE_THICKNESS = 0.0005
const SNAP_PRECISION = 1e7
const RING_AREA_EPSILON = 1e-12
const RING_POINT_EPSILON = 1e-8
const SIMPLIFY_ABSOLUTE_TOLERANCE = 5e-4
const SHAPE_SAMPLING_DIVISIONS = 16
const reportedUnionFailures = new Set()

const normalizeGeometry = geometry => {
  if (!geometry) return null
  const result = geometry
  const position = result.getAttribute('position')
  if (!position) {
    console.warn('[pcbModel] Geometry missing position attribute')
    result.dispose?.()
    return null
  }
  if (!result.getAttribute('normal')) {
    result.computeVertexNormals()
  }
  if (!result.getAttribute('uv')) {
    const uvArray = new Float32Array(position.count * 2)
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2))
  }
  return result
}

const ensureHoleList = shape => {
  if (!Array.isArray(shape.holes)) {
    shape.holes = []
  }
}

const addCircleHole = (shape, circle) => {
  if (!circle) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  hole.absellipse(circle.cx, circle.cy, circle.r, circle.r, 0, Math.PI * 2, true)
  hole.closePath()
  shape.holes.push(hole)
}

const addRectangleHole = (shape, rect) => {
  if (!rect) return
  ensureHoleList(shape)
  const {x, y, xSize, ySize, r = 0} = rect
  const hole = new THREE.Path()
  if (r > 0) {
    hole.moveTo(x + r, y)
    hole.lineTo(x + xSize - r, y)
    hole.quadraticCurveTo(x + xSize, y, x + xSize, y + r)
    hole.lineTo(x + xSize, y + ySize - r)
    hole.quadraticCurveTo(x + xSize, y + ySize, x + xSize - r, y + ySize)
    hole.lineTo(x + r, y + ySize)
    hole.quadraticCurveTo(x, y + ySize, x, y + ySize - r)
    hole.lineTo(x, y + r)
    hole.quadraticCurveTo(x, y, x + r, y)
  } else {
    hole.moveTo(x, y)
    hole.lineTo(x + xSize, y)
    hole.lineTo(x + xSize, y + ySize)
    hole.lineTo(x, y + ySize)
  }
  hole.closePath()
  shape.holes.push(hole)
}

const addPolygonHole = (shape, points) => {
  if (!Array.isArray(points) || points.length < 3) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  hole.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    hole.lineTo(points[i][0], points[i][1])
  }
  hole.closePath()
  shape.holes.push(hole)
}

const addOutlineHole = (shape, segments) => {
  if (!Array.isArray(segments) || !segments.length) return
  ensureHoleList(shape)
  const hole = new THREE.Path()
  appendSegmentsToPath(segments, hole)
  hole.closePath()
  shape.holes.push(hole)
}

const addHoleFromShapeDefinition = (shape, definition) => {
  if (!definition) return
  switch (definition.type) {
    case CIRCLE:
      addCircleHole(shape, definition)
      break
    case RECTANGLE:
      addRectangleHole(shape, definition)
      break
    case POLYGON:
      addPolygonHole(shape, definition.points)
      break
    case LAYERED_SHAPE:
      definition.shapes?.forEach((sub) => addHoleFromShapeDefinition(shape, sub))
      break
    case OUTLINE:
      addOutlineHole(shape, definition.segments)
      break
    default:
      break
  }
}

const addHoleFromElement = (shape, element) => {
  if (!element) return
  if (element.type === IMAGE_SHAPE) {
    addHoleFromShapeDefinition(shape, element.shape)
    return
  }
  if (element.type === IMAGE_REGION) {
    const hole = new THREE.Path()
    appendSegmentsToPath(element.segments, hole)
    hole.closePath()
    ensureHoleList(shape)
    shape.holes.push(hole)
    return
  }
  if (element.type === IMAGE_PATH) {
    const hole = new THREE.Path()
    appendSegmentsToPath(element.segments, hole)
    hole.closePath()
    ensureHoleList(shape)
    shape.holes.push(hole)
  }
}

const applyDrillHoles = (shape, drillTrees) => {
  if (!shape || !Array.isArray(drillTrees) || !drillTrees.length) return
  for (const tree of drillTrees) {
    if (!tree?.children) continue
    for (const element of tree.children) {
      addHoleFromElement(shape, element)
    }
  }
}

const snapValue = value => {
  const number = Number(value) || 0
  return Math.round(number * SNAP_PRECISION) / SNAP_PRECISION
}

const snapPoint = point => [snapValue(point?.[0]), snapValue(point?.[1])]

const distanceSquared = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
}

const segmentsToShape = (segments) => {
  if (!Array.isArray(segments) || !segments.length) return null
  const shape = new THREE.Shape()
  appendSegmentsToPath(segments, shape)
  return shape
}

const regionsToMultiPolygon = regions => {
  if (!Array.isArray(regions) || regions.length === 0) return null
  const polygons = regions
    .map(region => segmentsToShape(region?.segments))
    .filter(Boolean)
    .map(shape => shapeToMultiPolygon(shape))
    .filter(Boolean)
  return unionPolygonList(polygons)
}

const extractHoleMultiPolygon = polygons => {
  if (!Array.isArray(polygons) || polygons.length === 0) return null
  const holes = []
  polygons.forEach(polygon => {
    if (!Array.isArray(polygon) || polygon.length < 2) return
    polygon.slice(1).forEach(ring => {
      const normalized = normalizeRing(ring)
      if (normalized) {
        holes.push([normalized])
      }
    })
  })
  return holes.length ? holes : null
}

const buildBoardHolePolygon = (boardShapePolygons, boardShapeRegions) => {
  let polygons = boardShapePolygons
  if ((!polygons || !polygons.length) && Array.isArray(boardShapeRegions) && boardShapeRegions.length) {
    polygons = regionsToMultiPolygon(boardShapeRegions)
  }
  return extractHoleMultiPolygon(polygons)
}

const buildBoardClipPolygon = (
  boardShapePolygons,
  boardShapeRegions,
  boardBounds,
  boardClipRegions,
  imageTree
) => {
  const sanitized = sanitizeMultiPolygon(boardShapePolygons)
  if (sanitized && sanitized.length) {
    return sanitized
  }
  let regionSource = null
  if (Array.isArray(boardShapeRegions) && boardShapeRegions.length) {
    regionSource = boardShapeRegions
  } else if (Array.isArray(boardClipRegions) && boardClipRegions.length) {
    regionSource = boardClipRegions
  } else {
    regionSource = getFallbackBoardRegions(imageTree, boardBounds, boardClipRegions)
  }
  return regionSource ? regionsToMultiPolygon(regionSource) : null
}

const rectangleRegionFromBounds = bounds => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const [x1, y1, x2, y2] = bounds
  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return null
  }
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  return {
    type: IMAGE_REGION,
    segments: [
      {type: LINE, start: [minX, minY], end: [maxX, minY]},
      {type: LINE, start: [maxX, minY], end: [maxX, maxY]},
      {type: LINE, start: [maxX, maxY], end: [minX, maxY]},
      {type: LINE, start: [minX, maxY], end: [minX, minY]},
    ],
  }
}

const getFallbackBoardRegions = (imageTree, boardBounds, boardClipRegions) => {
  if (Array.isArray(boardClipRegions) && boardClipRegions.length) {
    return boardClipRegions
  }
  const fromBounds = rectangleRegionFromBounds(boardBounds)
  if (fromBounds) return [fromBounds]
  const fromSize = rectangleRegionFromBounds(imageTree?.size)
  return fromSize ? [fromSize] : null
}

const POINT_TOLERANCE = 1e-6

const pointsClose = (a, b, eps = POINT_TOLERANCE) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  Math.abs(a[0] - b[0]) <= eps &&
  Math.abs(a[1] - b[1]) <= eps

const dedupeSequentialPoints = (points, eps = POINT_TOLERANCE) => {
  if (!Array.isArray(points) || points.length === 0) return []
  const deduped = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1]
    const current = points[i]
    if (!pointsClose(prev, current, eps)) {
      deduped.push(current)
    }
  }
  return deduped
}

const simplifyRingPoints = (ring, eps = RING_AREA_EPSILON) => {
  if (!Array.isArray(ring) || ring.length < 4) return ring
  const simplified = []
  for (let i = 0; i < ring.length; i++) {
    const prev = simplified.length > 0 ? simplified[simplified.length - 1] : ring[i === 0 ? ring.length - 2 : i - 1]
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]
    if (!prev || !current || !next) continue
    if (pointsClose(prev, current, POINT_TOLERANCE)) continue
    const cross =
      prev[0] * (current[1] - next[1]) +
      current[0] * (next[1] - prev[1]) +
      next[0] * (prev[1] - current[1])
    const area = Math.abs(cross / 2)
    const prevDist = distanceSquared(prev, current)
    const nextDist = distanceSquared(current, next)
    if (area < eps && (prevDist < RING_POINT_EPSILON || nextDist < RING_POINT_EPSILON)) {
      continue
    }
    simplified.push(current)
  }
  if (simplified.length < 4) return ring
  if (!pointsClose(simplified[0], simplified[simplified.length - 1])) {
    simplified.push([...simplified[0]])
  }
  return simplified
}

const normalizeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const snapped = dedupeSequentialPoints(ring.map(point => snapPoint(point)))
  if (snapped.length < 3) return null
  if (!pointsClose(snapped[0], snapped[snapped.length - 1])) {
    snapped.push([...snapped[0]])
  }
  if (snapped.length < 4) return null
  return simplifyRingPoints(snapped)
}

const vectorToPoint = vector => snapPoint([vector?.x, vector?.y])

const pointSegmentDistance = (point, start, end) => {
  const px = Number(point?.[0]) || 0
  const py = Number(point?.[1]) || 0
  const sx = Number(start?.[0]) || 0
  const sy = Number(start?.[1]) || 0
  const ex = Number(end?.[0]) || 0
  const ey = Number(end?.[1]) || 0
  const dx = ex - sx
  const dy = ey - sy
  if (Math.abs(dx) < POINT_TOLERANCE && Math.abs(dy) < POINT_TOLERANCE) {
    return Math.sqrt((px - sx) ** 2 + (py - sy) ** 2)
  }
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)))
  const projX = sx + t * dx
  const projY = sy + t * dy
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

const simplifyPolylineDouglasPeucker = (points, tolerance) => {
  if (!Array.isArray(points) || points.length < 2) return points ? points.slice() : []
  const result = []
  const stack = [[0, points.length - 1]]
  const included = new Array(points.length).fill(false)
  included[0] = true
  included[points.length - 1] = true
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop()
    if (endIndex <= startIndex + 1) continue
    const startPoint = points[startIndex]
    const endPoint = points[endIndex]
    let maxDistance = 0
    let index = startIndex
    for (let i = startIndex + 1; i < endIndex; i++) {
      const distance = pointSegmentDistance(points[i], startPoint, endPoint)
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (maxDistance > tolerance && index > startIndex && index < endIndex) {
      included[index] = true
      stack.push([startIndex, index])
      stack.push([index, endIndex])
    }
  }
  for (let i = 0; i < points.length; i++) {
    if (included[i]) result.push(points[i])
  }
  if (!included[points.length - 1]) {
    result.push(points[points.length - 1])
  }
  return result
}

const simplifyRingWithTolerance = (ring, tolerance) => {
  if (!Array.isArray(ring) || ring.length < 5) return ring
  if (!Number.isFinite(tolerance) || tolerance <= 0) return ring
  const openPoints = ring.slice(0, ring.length - 1)
  if (openPoints.length < 3) return ring
  const simplified = simplifyPolylineDouglasPeucker(openPoints, tolerance)
  if (!simplified || simplified.length < 3) return ring
  const closed = simplified.slice()
  const first = simplified[0]
  const last = simplified[simplified.length - 1]
  if (!pointsClose(first, last, POINT_TOLERANCE)) {
    closed.push([...first])
  } else {
    closed[closed.length - 1] = [...first]
  }
  return closed.length >= 4 ? closed : ring
}

const ringBounds = (ring) => {
  if (!Array.isArray(ring) || ring.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of ring) {
    if (!Array.isArray(point)) continue
    const x = Number(point[0])
    const y = Number(point[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return {minX, maxX, minY, maxY}
}

const vectorsToRing = vectors => normalizeRing(vectors?.map(vectorToPoint))

const shapeToMultiPolygon = (shape, divisions = SHAPE_SAMPLING_DIVISIONS) => {
  if (!shape?.extractPoints) return null
  const extracted = shape.extractPoints(divisions)
  const outerRing = vectorsToRing(extracted.shape)
  if (!outerRing) return null
  const polygon = [outerRing]
  if (Array.isArray(extracted.holes)) {
    extracted.holes.forEach(holePoints => {
      const ring = vectorsToRing(holePoints)
      if (ring) polygon.push(ring)
    })
  }
  return [polygon]
}

const ringToShape = ring => {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const shape = new THREE.Shape()
  ring.forEach(([x, y], index) => {
    if (index === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  })
  shape.closePath()
  return shape
}

const ringToPath = ring => {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const path = new THREE.Path()
  ring.forEach(([x, y], index) => {
    if (index === 0) {
      path.moveTo(x, y)
    } else {
      path.lineTo(x, y)
    }
  })
  path.closePath()
  return path
}

const polygonToShape = (polygon, {skipNormalization = false} = {}) => {
  if (!Array.isArray(polygon) || polygon.length === 0) return null
  const normalized = skipNormalization
    ? polygon
    : polygon
        .map(ring => normalizeRing(ring))
        .filter(Boolean)
  if (normalized.length === 0) return null
  const outer = ringToShape(normalized[0])
  if (!outer) return null
  if (normalized.length > 1) {
    ensureHoleList(outer)
    normalized.slice(1).forEach(ring => {
      const holePath = ringToPath(ring)
      if (holePath) outer.holes.push(holePath)
    })
  }
  return outer
}

const multiPolygonToShapes = (multiPolygon, options = {}) => {
  if (!Array.isArray(multiPolygon) || multiPolygon.length === 0) return []
  const shapes = []
  multiPolygon.forEach(polygon => {
    const shape = polygonToShape(polygon, options)
    if (shape) shapes.push(shape)
  })
  return shapes
}

const cloneMultiPolygon = multiPolygon => {
  if (!Array.isArray(multiPolygon)) return null
  const cloned = multiPolygon
    .map(polygon => {
      if (!Array.isArray(polygon) || polygon.length === 0) return null
      const rings = polygon
        .map(ring => {
          if (!Array.isArray(ring) || ring.length < 3) return null
          return ring.map(point => [Number(point?.[0]) || 0, Number(point?.[1]) || 0])
        })
        .filter(Boolean)
      return rings.length ? rings : null
    })
    .filter(Boolean)
  return cloned.length ? cloned : null
}

const sanitizeMultiPolygon = value => {
  if (!Array.isArray(value) || value.length === 0) return null
  const polygons = value
    .map(polygon => {
      if (!Array.isArray(polygon) || polygon.length === 0) return null
      const rings = polygon
        .map(ring => normalizeRing(ring))
        .filter(Boolean)
      return rings.length ? rings : null
  })
    .filter(Boolean)
  return polygons.length ? polygons : null
}

const resolveLayerSimplifyTolerance = (layerType, toleranceMap) => {
  const candidate =
    toleranceMap && layerType && Number.isFinite(toleranceMap[layerType])
      ? toleranceMap[layerType]
      : null
  if (Number.isFinite(candidate) && candidate >= 0) return candidate
  if (toleranceMap && Number.isFinite(toleranceMap.default) && toleranceMap.default >= 0) {
    return toleranceMap.default
  }
  return SIMPLIFY_ABSOLUTE_TOLERANCE
}

const simplifyMultiPolygonForLayer = (multiPolygon, layerType, toleranceMap = null) => {
  const baseTolerance = resolveLayerSimplifyTolerance(layerType, toleranceMap)
  if (!Number.isFinite(baseTolerance) || baseTolerance <= 0) {
    return multiPolygon
  }
  if (!Array.isArray(multiPolygon) || multiPolygon.length === 0) return multiPolygon
  let changed = false
  const simplifiedPolygons = multiPolygon.map(polygon => {
    if (!Array.isArray(polygon) || polygon.length === 0) return polygon
    const simplifiedRings = polygon.map(ring => {
      if (!Array.isArray(ring) || ring.length < 10) return ring
      const bounds = ringBounds(ring)
      if (!bounds) return ring
      const tolerance = baseTolerance
      const simplified = simplifyRingWithTolerance(ring, tolerance)
      if (simplified && simplified !== ring && simplified.length < ring.length) {
        changed = true
        return simplified
      }
      return ring
    })
    return simplifiedRings
  })
  if (!changed) return multiPolygon
  return sanitizeMultiPolygon(simplifiedPolygons) || multiPolygon
}

const unionMultiPolygon = (existing, addition, stats = null) => {
  if (!addition || addition.length === 0) {
    return existing || null
  }
  if (!existing || existing.length === 0) {
    return addition || null
  }
  const start = typeof performance !== 'undefined' ? performance.now() : null
  try {
    const result = polygonClipping.union(existing, addition)
    if (start !== null && stats) {
      stats.unionCount = (stats.unionCount || 0) + 1
      stats.unionTime = (stats.unionTime || 0) + (performance.now() - start)
    }
    return sanitizeMultiPolygon(result)
  } catch (error) {
    const message = error?.message || 'unknown'
    if (!reportedUnionFailures.has(message)) {
      console.warn('[pcbModel] polygon union failed', {message})
      reportedUnionFailures.add(message)
    }
    const combined = [
      ...(existing ? cloneMultiPolygon(existing) || [] : []),
      ...(addition ? cloneMultiPolygon(addition) || [] : []),
    ]
    return sanitizeMultiPolygon(combined)
  }
}

const subtractMultiPolygon = (subject, removal, stats = null) => {
  if (!subject || subject.length === 0) return null
  if (!removal || removal.length === 0) return cloneMultiPolygon(subject)
  const start = typeof performance !== 'undefined' ? performance.now() : null
  try {
    const result = polygonClipping.difference(subject, removal)
    if (start !== null && stats) {
      stats.diffCount = (stats.diffCount || 0) + 1
      stats.diffTime = (stats.diffTime || 0) + (performance.now() - start)
    }
    return sanitizeMultiPolygon(result)
  } catch (error) {
    const message = error?.message || 'unknown'
    if (!reportedUnionFailures.has(`diff:${message}`)) {
      console.warn('[pcbModel] polygon difference failed', {message})
      reportedUnionFailures.add(`diff:${message}`)
    }
    return cloneMultiPolygon(subject)
  }
}

const intersectMultiPolygon = (subject, clip, stats = null) => {
  if (!subject || subject.length === 0) return null
  if (!clip || clip.length === 0) return null
  const start = typeof performance !== 'undefined' ? performance.now() : null
  try {
    const result = polygonClipping.intersection(subject, clip)
    if (start !== null && stats) {
      stats.intersectCount = (stats.intersectCount || 0) + 1
      stats.intersectTime = (stats.intersectTime || 0) + (performance.now() - start)
    }
    return sanitizeMultiPolygon(result)
  } catch (error) {
    const message = error?.message || 'unknown'
    if (!reportedUnionFailures.has(`intersect:${message}`)) {
      console.warn('[pcbModel] polygon intersection failed', {message})
      reportedUnionFailures.add(`intersect:${message}`)
    }
    return cloneMultiPolygon(subject)
  }
}

const extendBounds = (bounds, addition) => {
  if (!addition) return bounds
  if (!bounds) return {...addition}
  return {
    minX: Math.min(bounds.minX, addition.minX),
    minY: Math.min(bounds.minY, addition.minY),
    maxX: Math.max(bounds.maxX, addition.maxX),
    maxY: Math.max(bounds.maxY, addition.maxY),
  }
}

const getMultiPolygonBounds = multiPolygon => {
  if (!Array.isArray(multiPolygon) || multiPolygon.length === 0) return null
  let bounds = null
  for (const polygon of multiPolygon) {
    if (!Array.isArray(polygon)) continue
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue
      for (const point of ring) {
        if (!Array.isArray(point)) continue
        bounds = extendBounds(bounds, {
          minX: point[0],
          minY: point[1],
          maxX: point[0],
          maxY: point[1],
        })
      }
    }
  }
  return bounds
}

const unionPolygonList = (polygons, stats = null) => {
  if (!Array.isArray(polygons) || polygons.length === 0) return null
  const valid = polygons.filter(Boolean)
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]
  const start = typeof performance !== 'undefined' ? performance.now() : null
  try {
    const result = sanitizeMultiPolygon(polygonClipping.union(...valid))
    if (start !== null && stats) {
      stats.unionCount = (stats.unionCount || 0) + 1
      stats.unionTime = (stats.unionTime || 0) + (performance.now() - start)
    }
    return result
  } catch (error) {
    const message = error?.message || 'unknown'
    if (!reportedUnionFailures.has(`list:${message}`)) {
      console.warn('[pcbModel] polygon union failed', {message})
      reportedUnionFailures.add(`list:${message}`)
    }
    return valid[0]
  }
}

const combineShapeEntriesPolygon = entries => {
  if (!Array.isArray(entries) || entries.length === 0) return null
  return entries.reduce((acc, entry) => {
    if (!entry?.shape) return acc
    const polygon = shapeToMultiPolygon(entry.shape)
    if (!polygon) return acc
    return unionMultiPolygon(acc, polygon)
  }, null)
}

const contourizeCirclePath = (segment, width) => {
  const radius = Number(width) / 2
  if (!Number.isFinite(radius) || radius <= 0) return []
  if (segment.type === LINE) {
    const {start, end} = segment
    const [x1, y1] = start
    const [x2, y2] = end
    const theta = Math.atan2(y2 - y1, x2 - x1)
    const dx = -radius * Math.sin(theta)
    const dy = radius * Math.cos(theta)
    return [
      {type: LINE, start: [x1 + dx, y1 + dy], end: [x2 + dx, y2 + dy]},
      {
        type: ARC,
        start: [x2 + dx, y2 + dy, theta + Math.PI / 2],
        end: [x2 - dx, y2 - dy, theta - Math.PI / 2],
        center: [x2, y2],
        radius,
      },
      {type: LINE, start: [x2 - dx, y2 - dy], end: [x1 - dx, y1 - dy]},
      {
        type: ARC,
        start: [x1 - dx, y1 - dy, theta + (3 * Math.PI) / 2],
        end: [x1 + dx, y1 + dy, theta + Math.PI / 2],
        center: [x1, y1],
        radius,
      },
    ]
  }
  const {start, end, radius: arcRadius, center} = segment
  const [x1, y1] = start
  const [x2, y2] = end
  const [cx, cy] = center
  const theta1 = start[2]
  const theta2 = end[2]
  const dx1 = -radius * Math.sin(theta1 - Math.PI / 2)
  const dy1 = radius * Math.cos(theta1 - Math.PI / 2)
  const dx2 = -radius * Math.sin(theta2 - Math.PI / 2)
  const dy2 = radius * Math.cos(theta2 - Math.PI / 2)
  const innerRadius = Math.max((arcRadius || 0) - radius, 0)
  const outerRadius = Math.max((arcRadius || 0) + radius, 0)
  if (theta1 > theta2) {
    return [
      {
        type: ARC,
        start: [x1 + dx1, y1 + dy1, theta1],
        end: [x2 + dx2, y2 + dy2, theta2],
        center: [cx, cy],
        radius: outerRadius,
      },
      {
        type: ARC,
        start: [x2 + dx2, y2 + dy2, theta2],
        end: [x2 - dx2, y2 - dy2, theta2 - Math.PI],
        center: [x2, y2],
        radius,
      },
      {
        type: ARC,
        start: [x2 - dx2, y2 - dy2, theta2],
        end: [x1 - dx1, y1 - dy1, theta1],
        center: [cx, cy],
        radius: innerRadius,
      },
      {
        type: ARC,
        start: [x1 - dx1, y1 - dy1, theta1 + Math.PI],
        end: [x1 + dx1, y1 + dy1, theta1],
        center: [x1, y1],
        radius,
      },
    ]
  }
  return [
    {
      type: ARC,
      start: [x1 + dx1, y1 + dy1, theta1],
      end: [x2 + dx2, y2 + dy2, theta2],
      center: [cx, cy],
      radius: outerRadius,
    },
    {
      type: ARC,
      start: [x2 + dx2, y2 + dy2, theta2],
      end: [x2 - dx2, y2 - dy2, theta2 + Math.PI],
      center: [x2, y2],
      radius,
    },
    {
      type: ARC,
      start: [x2 - dx2, y2 - dy2, theta2],
      end: [x1 - dx1, y1 - dy1, theta1],
      center: [cx, cy],
      radius: innerRadius,
    },
    {
      type: ARC,
      start: [x1 - dx1, y1 - dy1, theta1 - Math.PI],
      end: [x1 + dx1, y1 + dy1, theta1],
      center: [x1, y1],
      radius,
    },
  ]
}

const pathToMultiPolygon = element => {
  if (!element?.segments || element.segments.length === 0) return null
  const width = Number(element.width) || 0
  if (!Number.isFinite(width) || width <= 0) return null
  const strokePolygons = []
  element.segments.forEach(segment => {
    const contourSegments = contourizeCirclePath(segment, width)
    const strokeShape = segmentsToShape(contourSegments)
    if (!strokeShape) return
    const strokePolygon = shapeToMultiPolygon(strokeShape)
    if (strokePolygon) strokePolygons.push(strokePolygon)
  })
  return unionPolygonList(strokePolygons)
}

export function renderThree(
  imageTree,
  color,
  progress = () => {},
  outline = false,
  drillTrees = [],
  boardShapeRegions = null,
  layerType = null,
  boardBounds = null,
  boardClipRegions = null,
  boardShapePolygons = null,
  simplifyTolerances = null
) {
  if (!imageTree) {
    return new THREE.Group()
  }
  if (outline) {
    return buildBoardGeometry(
      imageTree,
      color,
      drillTrees,
      boardShapeRegions,
      boardShapePolygons,
      progress,
      simplifyTolerances
    )
  }
  return buildPlanarLayerGeometry(
    imageTree,
    color,
    progress,
    layerType,
    boardShapeRegions,
    boardBounds,
    boardClipRegions,
    drillTrees,
    boardShapePolygons,
    simplifyTolerances
  )
}

const buildPlanarLayerGeometry = (
  imageTree,
  color,
  progress,
  layerType = null,
  boardShapeRegions = null,
  boardBounds = null,
  boardClipRegions = null,
  drillTrees = null,
  boardShapePolygons = null,
  simplifyTolerances = null
) => {
  const group = new THREE.Group()
  let current = 0
  progress(current)
  const children = imageTree.children || []
  const planarEntries = []

  const chunkList = []
  const initialDarkPolygons = []
  const isSolderMaskLayer = layerType === 'soldermask'
  const createChunk = () => {
    const chunk = {
      darkEntries: [],
      clearEntries: [],
      multiPolygon: null,
      hasClear: false,
      index: chunkList.length,
      dirty: true,
      contentBounds: null,
    }
    chunkList.push(chunk)
    return chunk
  }

  let currentChunk = createChunk()

let boardHolePolygon = buildBoardHolePolygon(boardShapePolygons, boardShapeRegions)
boardHolePolygon = simplifyMultiPolygonForLayer(boardHolePolygon, 'outline', simplifyTolerances)
const boardHoleBounds = boardHolePolygon ? getMultiPolygonBounds(boardHolePolygon) : null

let boardClipPolygon = buildBoardClipPolygon(
  boardShapePolygons,
  boardShapeRegions,
  boardBounds,
  boardClipRegions,
  imageTree
)
boardClipPolygon = simplifyMultiPolygonForLayer(boardClipPolygon, 'outline', simplifyTolerances)
const boardClipBounds = boardClipPolygon ? getMultiPolygonBounds(boardClipPolygon) : null

  if (isSolderMaskLayer) {
    let boardMaskPolygon = boardClipPolygon
    if (!boardMaskPolygon) {
      const fallbackRegions = getFallbackBoardRegions(imageTree, boardBounds, boardClipRegions)
      boardMaskPolygon = fallbackRegions ? regionsToMultiPolygon(fallbackRegions) : null
    }
    if (boardMaskPolygon) {
      initialDarkPolygons.push(boardMaskPolygon)
    } else {
      console.warn(
        '[pcbModel] Missing board shape for soldermask layer after fallback; rendering mask openings only'
      )
    }
  }

  const ensureChunkReadyForDark = () => {
    if (currentChunk.hasClear) {
      currentChunk = createChunk()
    }
  }

  const applyDarkPolygon = (multiPolygon) => {
    const stored = sanitizeMultiPolygon(multiPolygon)
    if (!stored) return
    const entryBounds = getMultiPolygonBounds(stored)
    if (!entryBounds) return
    ensureChunkReadyForDark()
    currentChunk.darkEntries.push({polygon: stored, bounds: entryBounds})
    currentChunk.contentBounds = extendBounds(currentChunk.contentBounds, entryBounds)
    currentChunk.dirty = true
  }

  const applyClearPolygon = (multiPolygon) => {
    const stored = sanitizeMultiPolygon(multiPolygon)
    if (!stored) return
    const entryBounds = getMultiPolygonBounds(stored)
    if (!entryBounds) return
    chunkList.forEach(chunk => {
      if (!chunk.contentBounds || !boundsOverlap(chunk.contentBounds, entryBounds)) {
        return
      }
      chunk.clearEntries.push({polygon: stored, bounds: entryBounds})
      chunk.hasClear = true
      chunk.dirty = true
    })
  }

  const buildChunkMultiPolygon = chunk => {
    if (!chunk.dirty && chunk.multiPolygon) return chunk.multiPolygon
    const darkPolygons = chunk.darkEntries.map(entry => entry.polygon)
    const darkUnion = unionPolygonList(darkPolygons)
    if (!darkUnion) {
      chunk.multiPolygon = null
      chunk.contentBounds = null
      chunk.dirty = false
      return null
    }
    let result = darkUnion
    let resultBounds = getMultiPolygonBounds(result)
    const relevantClears = chunk.clearEntries.filter(entry =>
      resultBounds && boundsOverlap(resultBounds, entry.bounds)
    ).map(entry => entry.polygon)
    const clearUnion = unionPolygonList(relevantClears)
    if (clearUnion) {
        result = subtractMultiPolygon(result, clearUnion)
      resultBounds = getMultiPolygonBounds(result)
    }
    if (result && boardClipPolygon) {
      const shouldApplyBoardClip =
        !resultBounds || !boardClipBounds || boundsOverlap(resultBounds, boardClipBounds)
      if (shouldApplyBoardClip) {
        result = intersectMultiPolygon(result, boardClipPolygon)
        resultBounds = getMultiPolygonBounds(result)
      }
    }
    if (result && drillHolePolygon) {
      const shouldApplyDrill =
        !resultBounds || !drillHoleBounds || boundsOverlap(resultBounds, drillHoleBounds)
      if (shouldApplyDrill) {
        // Carve global drill holes from every chunk
        result = subtractMultiPolygon(result, drillHolePolygon)
        resultBounds = getMultiPolygonBounds(result)
      }
    }
    if (result && boardHolePolygon) {
      const shouldApplyBoardHole =
        !resultBounds || !boardHoleBounds || boundsOverlap(resultBounds, boardHoleBounds)
      if (shouldApplyBoardHole) {
        result = subtractMultiPolygon(result, boardHolePolygon)
        resultBounds = getMultiPolygonBounds(result)
      }
    }
    if (result) {
      const simplifiedResult = simplifyMultiPolygonForLayer(result, layerType, simplifyTolerances)
      if (simplifiedResult && simplifiedResult !== result) {
        result = simplifiedResult
        resultBounds = getMultiPolygonBounds(result)
      }
    }
    chunk.multiPolygon = result
    chunk.contentBounds = resultBounds
    chunk.dirty = false
    return result
  }

  const emitChunkPolygons = chunk => {
    const finalPolygon = chunk.multiPolygon ?? buildChunkMultiPolygon(chunk)
    if (!finalPolygon) return
    const shapes = multiPolygonToShapes(finalPolygon, {skipNormalization: true})
    if (!shapes.length) return
    const geometry = new THREE.ShapeGeometry(shapes)
    geometry.deleteAttribute('uv')
    geometry.translate(0, 0, -PLANE_THICKNESS / 2)
    planarEntries.push({geometry})
  }

  initialDarkPolygons.forEach(polygon => applyDarkPolygon(polygon))

let drillHolePolygon = drillTreesToMultiPolygon(drillTrees)
drillHolePolygon = simplifyMultiPolygonForLayer(drillHolePolygon, 'drill', simplifyTolerances)
const drillHoleBounds = drillHolePolygon ? getMultiPolygonBounds(drillHolePolygon) : null

  for (let index = 0; index < children.length; index++) {
    const element = children[index]
    const nextProgress = Math.ceil(((index + 1) / children.length) * 100)
    if (nextProgress !== current) {
      current = nextProgress
      progress(current)
    }
    const rawElementIsClear = element?.erase === true || element?.polarity === CLEAR
    const elementIsClear = isSolderMaskLayer ? true : rawElementIsClear

    if (element.type === IMAGE_REGION) {
      const entry = createShapeEntryFromSegments(element.segments)
      const regionPolygon = entry?.shape ? shapeToMultiPolygon(entry.shape) : null
      if (!regionPolygon) continue
      if (elementIsClear) {
        applyClearPolygon(regionPolygon)
      } else {
        applyDarkPolygon(regionPolygon)
      }
      continue
    }

    if (element.type === IMAGE_SHAPE) {
      const entries = buildShapeEntriesFromDefinition(element.shape)
      const shapePolygon = combineShapeEntriesPolygon(entries)
      if (!shapePolygon) continue
      if (elementIsClear) {
        applyClearPolygon(shapePolygon)
      } else {
        applyDarkPolygon(shapePolygon)
      }
      continue
    }

    if (element.type === IMAGE_PATH) {
      const pathPolygon = pathToMultiPolygon(element)
      if (!pathPolygon) continue
      if (elementIsClear) {
        applyClearPolygon(pathPolygon)
      } else {
        applyDarkPolygon(pathPolygon)
      }
      continue
    }
  }

  chunkList.forEach(emitChunkPolygons)

  planarEntries.forEach(entry => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isSolderMaskLayer ? 0.9 : 1,
    })
    material.side = THREE.DoubleSide
    material.depthWrite = true
    material.polygonOffset = true
    material.polygonOffsetFactor = -0.2
    material.polygonOffsetUnits = -0.2
    const mesh = new THREE.Mesh(entry.geometry, material)
    mesh.userData = {planar: true}
    group.add(mesh)
  })

  return group
}

const buildBoardGeometry = (
  imageTree,
  color,
  drillTrees,
  boardShapeRegions,
  boardShapePolygons,
  progress,
  simplifyTolerances = null
) => {
  const region = []
  const path = []
  const shape = []
  const polygonShapes = []
  let current = 0
  progress(current)
  const simplifiedBoardPolygons = simplifyMultiPolygonForLayer(
    boardShapePolygons,
    'outline',
    simplifyTolerances
  )
  const polygonShapeList =
    Array.isArray(simplifiedBoardPolygons) && simplifiedBoardPolygons.length
      ? multiPolygonToShapes(simplifiedBoardPolygons)
      : null
  const regionShapeList = Array.isArray(boardShapeRegions)
    ? boardShapeRegions
        .map((regionDef) => segmentsToShape(regionDef?.segments))
        .filter(Boolean)
    : []
  const boardShapes =
    polygonShapeList && polygonShapeList.length
      ? polygonShapeList
      : regionShapeList
  const useBoardShape = boardShapes.length > 0
  const outlineState = useBoardShape ? null : createOutlineState()

  for (let index = 0; index < imageTree.children.length; index++) {
    const element = imageTree.children[index]
    const nextProgress = Math.ceil(((index + 1) / imageTree.children.length) * 100)
    if (nextProgress !== current) {
      current = nextProgress
      progress(current)
    }

    if (outlineState) {
      renderImageOutline(element, outlineState)
      continue
    }

    if (useBoardShape) {
      continue
    }

    if (element.type === IMAGE_REGION) {
      const geo = normalizeGeometry(renderImageRegion(element))
      if (geo) region.push(geo)
      continue
    }

    if (element.type === IMAGE_PATH) {
      const geos = renderImagePath(element)
      geos.forEach(geo => {
        const normalized = normalizeGeometry(geo)
        if (normalized) path.push(normalized)
      })
      continue
    }

    if (element.type === IMAGE_SHAPE) {
      const geos = renderImageShape(element)
      geos.forEach(entry => {
        const normalized = normalizeGeometry(entry.geometry)
        if (!normalized) return
        if (entry.type === POLYGON) {
          polygonShapes.push(normalized)
        } else {
          shape.push(normalized)
        }
      })
    }
  }

  const group = new THREE.Group()

  if (outlineState) {
    const outlineShape = finalizeOutlineState(outlineState)
    if (outlineShape) {
      applyDrillHoles(outlineShape, drillTrees)
      const geometry = new THREE.ExtrudeGeometry(outlineShape, extrudeSettings)
      geometry.translate(0, 0, -0.5)
      const normalized = normalizeGeometry(geometry)
      if (normalized) region.push(normalized)
    }
  } else if (boardShapes.length > 0) {
    boardShapes.forEach((shapeEntry) => {
      if (!shapeEntry) return
      applyDrillHoles(shapeEntry, drillTrees)
      const geometry = new THREE.ExtrudeGeometry(shapeEntry, extrudeSettings)
      geometry.translate(0, 0, -0.5)
      const normalized = normalizeGeometry(geometry)
      if (normalized) region.push(normalized)
    })
  }

  const material = new THREE.MeshBasicMaterial({color})

  const mergeAndAdd = geometries => {
    if (!geometries.length) return
    geometries.forEach(geo => {
      if (!geo) return
      const mesh = new THREE.Mesh(geo, material)
      mesh.userData = {planar: false}
      group.add(mesh)
    })
  }

  mergeAndAdd(region)
  mergeAndAdd(path)
  mergeAndAdd(shape)
  mergeAndAdd(polygonShapes)

  return group
}

const createShapeFromDefinition = (definition) => {
  switch (definition?.type) {
    case CIRCLE: {
      const circle = new THREE.Shape()
      circle.absellipse(definition.cx, definition.cy, definition.r, definition.r, 0, Math.PI * 2, false)
      return circle
    }
    case RECTANGLE: {
      if (definition.r) {
        return drawRoundedRect(definition.x, definition.y, definition.xSize, definition.ySize, definition.r)
      }
      const rectShape = new THREE.Shape()
      rectShape.moveTo(definition.x, definition.y)
      rectShape.lineTo(definition.x + definition.xSize, definition.y)
      rectShape.lineTo(definition.x + definition.xSize, definition.y + definition.ySize)
      rectShape.lineTo(definition.x, definition.y + definition.ySize)
      rectShape.closePath()
      return rectShape
    }
    case POLYGON: {
      const points = definition.points || []
      if (points.length < 3) return null
      const polygon = new THREE.Shape()
      polygon.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length; i++) {
        polygon.lineTo(points[i][0], points[i][1])
      }
      polygon.closePath()
      return polygon
    }
    case OUTLINE:
      return segmentsToShape(definition.segments)
    default:
      return null
  }
}

const createShapeEntryFromSegments = (segments) => {
  if (!Array.isArray(segments) || !segments.length) return null
  const shape = segmentsToShape(segments)
  if (!shape) return null
  return {
    shape,
    bounds: boundsFromSegments(segments),
    segments,
  }
}

const boundsOverlap = (a, b) => {
  if (!a || !b) return true
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  )
}

const buildShapeEntriesFromDefinition = (definition) => {
  if (!definition || definition.erase === true) return []
  if (definition.type === LAYERED_SHAPE) {
    const layeredEntries = []
    definition.shapes?.forEach(sub => {
      if (sub?.erase) {
        layeredEntries.forEach(entry => addHoleFromShapeDefinition(entry.shape, sub))
      } else {
        layeredEntries.push(...buildShapeEntriesFromDefinition(sub))
      }
    })
    return layeredEntries
  }
  const shape = createShapeFromDefinition(definition)
  if (!shape) return []
  const bounds = shapeBounds(definition)
  return [{shape, bounds}]
}

const elementToMultiPolygon = element => {
  if (!element) return null
  if (element.type === IMAGE_REGION) {
    const entry = createShapeEntryFromSegments(element.segments)
    return entry?.shape ? shapeToMultiPolygon(entry.shape) : null
  }
  if (element.type === IMAGE_SHAPE) {
    const entries = buildShapeEntriesFromDefinition(element.shape)
    return combineShapeEntriesPolygon(entries)
  }
  if (element.type === IMAGE_PATH) {
    return pathToMultiPolygon(element)
  }
  return null
}

const drillTreesToMultiPolygon = drillTrees => {
  if (!Array.isArray(drillTrees) || drillTrees.length === 0) return null
  const polygons = []
  drillTrees.forEach(tree => {
    if (!tree?.children) return
    tree.children.forEach(element => {
      const polygon = elementToMultiPolygon(element)
      if (polygon) polygons.push(polygon)
    })
  })
  return unionPolygonList(polygons)
}

const toPoint = position => snapPoint(position)

const extendBoundsWithPoint = (bounds, point) => {
  if (!point) return bounds
  if (!bounds) {
    return {
      minX: point[0],
      maxX: point[0],
      minY: point[1],
      maxY: point[1],
    }
  }
  return {
    minX: Math.min(bounds.minX, point[0]),
    maxX: Math.max(bounds.maxX, point[0]),
    minY: Math.min(bounds.minY, point[1]),
    maxY: Math.max(bounds.maxY, point[1]),
  }
}

const approximateArcPointsForBounds = (segment) => {
  const startAngle = Number(segment?.start?.[2])
  const endAngle = Number(segment?.end?.[2])
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toPoint(segment.start)
  const endRaw = toPoint(segment.end)
  if (Math.abs(sweep) < 1e-7 && distanceSquared(startRaw, endRaw) < 1e-12) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const center = toPoint(segment.center)
  const radius = Number(segment.radius) || 0
  const points = []
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ])
  }
  return points
}

const boundsFromSegments = segments => {
  if (!Array.isArray(segments) || segments.length === 0) return null
  let bounds = null
  for (const segment of segments) {
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.start))
    bounds = extendBoundsWithPoint(bounds, toPoint(segment.end))
    if (segment.type === ARC) {
      const arcPoints = approximateArcPointsForBounds(segment)
      arcPoints.forEach(pt => {
        bounds = extendBoundsWithPoint(bounds, pt)
      })
    }
  }
  return bounds
}

const shapeBounds = definition => {
  if (!definition) return null
  switch (definition.type) {
    case CIRCLE:
      return {
        minX: definition.cx - definition.r,
        minY: definition.cy - definition.r,
        maxX: definition.cx + definition.r,
        maxY: definition.cy + definition.r,
      }
    case RECTANGLE:
      return {
        minX: definition.x,
        minY: definition.y,
        maxX: definition.x + definition.xSize,
        maxY: definition.y + definition.ySize,
      }
    case POLYGON:
      return boundsFromSegments(
        definition.points?.map((point, index, arr) => ({
          type: LINE,
          start: point,
          end: arr[(index + 1) % arr.length],
        })) || []
      )
    case OUTLINE:
      return boundsFromSegments(definition.segments)
    case LAYERED_SHAPE: {
      let merged = null
      for (const sub of definition.shapes || []) {
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
