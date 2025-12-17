import {
  IMAGE_PATH,
  IMAGE_REGION,
  LINE,
  ARC,
  BoundingBox,
} from '@tracespace/plotter'
import {CLEAR} from '@tracespace/parser'
import {
  TYPE_COPPER,
  TYPE_DRILL,
  TYPE_SILKSCREEN,
  TYPE_SOLDERMASK,
  TYPE_SOLDERPASTE,
  TYPE_OUTLINE,
} from '@tracespace/identify-layers'
import polygonClipping from 'polygon-clipping'

import type {
  ImageTree,
  ImageGraphic,
  ImageShape,
  ImagePath,
  ImageRegion,
  SizeEnvelope,
  PathSegment,
  Position,
} from '@tracespace/plotter'

import type {Layer} from '..'
import {getOutlineLayer} from '../sort-layers'
import {walkPaths} from './walk-paths'
import {fillGaps} from './fill-gaps'

export type ViewBox = [number, number, number, number]

export const MISSING_OUTLINE_LAYER = 'missingOutlineLayer'
export const NO_PATHS_IN_OUTLINE_LAYER = 'noPathsInOutlineLayer'
export const NO_CLOSED_REGIONS_FOUND = 'noClosedRegionsFound'
const STROKE_AREA_RATIO_THRESHOLD = 0.15

type Polygon = polygonClipping.Polygon
type MultiPolygon = polygonClipping.MultiPolygon

export interface BoardShape {
  size: SizeEnvelope
  regions: ImageRegion[]
  openPaths: ImagePath[]
  polygons?: MultiPolygon | null
  failureReason?: BoardShapeFailureReason
}

export interface BoardShapeRender {
  viewBox: ViewBox
  failureReason?: BoardShapeFailureReason
}

export type BoardShapeFailureReason =
  | typeof MISSING_OUTLINE_LAYER
  | typeof NO_PATHS_IN_OUTLINE_LAYER
  | typeof NO_CLOSED_REGIONS_FOUND

const createRectangleRegionFromBox = (
  box: SizeEnvelope
): ImageRegion | null => {
  if (!Array.isArray(box) || box.length < 4) return null
  const [minX, minY, maxX, maxY] = box
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    minX === maxX ||
    minY === maxY
  ) {
    return null
  }
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

export function plotBoardShape(
  layers: Layer[],
  plotTreesById: Record<string, ImageTree>,
  maximumGap: number
): BoardShape {
  const collectLayerBoxes = (filterFn: (layer: Layer) => boolean): SizeEnvelope[] =>
    layers
      .filter(filterFn)
      .map(layer => plotTreesById[layer.id]?.size)
      .filter((box): box is SizeEnvelope => Boolean(box) && !BoundingBox.isEmpty(box))

  const boardRelevantTypes = new Set<Layer['type']>([
    TYPE_COPPER,
    TYPE_SOLDERMASK,
    TYPE_SOLDERPASTE,
    TYPE_SILKSCREEN,
    TYPE_OUTLINE,
  ])
  const boardRelevantBoxes = collectLayerBoxes(layer => {
    if (!layer.type) return false
    return boardRelevantTypes.has(layer.type)
  })
  const nonDrillBoxes = collectLayerBoxes(layer => layer.type !== TYPE_DRILL)
  const anyLayerBoxes =
    boardRelevantBoxes.length > 0
      ? boardRelevantBoxes
      : nonDrillBoxes.length > 0
        ? nonDrillBoxes
        : collectLayerBoxes(() => true)

  const outlineId = getOutlineLayer(layers)
  const outlinePlot =
    outlineId === undefined ? undefined : plotTreesById[outlineId]
  const size = BoundingBox.sum(anyLayerBoxes)

  if (outlinePlot === undefined) {
    const fallbackRegion = createRectangleRegionFromBox(size)
    const fallbackPolygon = fallbackRegion ? regionToPolygon(fallbackRegion) : null
    return {
      size,
      regions: fallbackRegion ? [fallbackRegion] : [],
      openPaths: [],
      polygons: fallbackPolygon ? [fallbackPolygon] : null,
      failureReason: MISSING_OUTLINE_LAYER,
    }
  }

  const outlinePaths = outlinePlot.children.filter(
    (node): node is ImagePath => node.type === IMAGE_PATH
  )
  const outlineRegions = outlinePlot.children.filter(
    (node): node is ImageRegion => node.type === IMAGE_REGION
  )
  const pathSegments = outlinePaths.flatMap(path => path.segments)

  if (pathSegments.length === 0 && outlineRegions.length === 0) {
    return {
      size,
      regions: [],
      openPaths: [],
      polygons: null,
      failureReason: NO_PATHS_IN_OUTLINE_LAYER,
    }
  }

  let derivedRegions: ImageRegion[] = []
  let openPaths: ImagePath[] = []
  let strokeBounds: SizeEnvelope | null = null
  let usedStrokeReconstruction = false

  if (pathSegments.length > 0) {
    const allPaths = walkPaths(pathSegments)
    const [regionCandidates, openCandidates] = fillGaps(allPaths, maximumGap)
    derivedRegions = regionCandidates
    openPaths = openCandidates
  }

  let {regions: mergedRegions, polygons: mergedPolygons} = mergeBoardRegions([
    ...outlineRegions,
    ...derivedRegions,
  ])
  let derivedRegionBounds = BoundingBox.fromGraphics(mergedRegions)
  let mergedPolygonArea = multiPolygonArea(mergedPolygons)
  const computeCoverageRatio = () => {
    const derivedBoundsArea = boundingBoxArea(derivedRegionBounds)
    return derivedBoundsArea > 0 ? mergedPolygonArea / derivedBoundsArea : 0
  }
  let polygonCoverageRatio = computeCoverageRatio()

  const looksLikeStrokeOnly =
    mergedPolygonArea > 0 &&
    polygonCoverageRatio > 0 &&
    polygonCoverageRatio < STROKE_AREA_RATIO_THRESHOLD

  if (looksLikeStrokeOnly) {
    strokeBounds = derivedRegionBounds
    const reconstructedPolygons = reconstructStrokeBoardPolygons(mergedPolygons, {
      layers,
      plotTreesById,
    })
    if (reconstructedPolygons) {
      usedStrokeReconstruction = true
      mergedPolygons = reconstructedPolygons
      mergedRegions = polygonToRegions(reconstructedPolygons)
      derivedRegionBounds = BoundingBox.fromGraphics(mergedRegions)
      mergedPolygonArea = multiPolygonArea(mergedPolygons)
      polygonCoverageRatio = computeCoverageRatio()
    }
  }

  const coverageTooLow =
    mergedPolygonArea > 0 &&
    polygonCoverageRatio > 0 &&
    polygonCoverageRatio < STROKE_AREA_RATIO_THRESHOLD

  if (coverageTooLow) {
    const applyFallbackRegions = (extraRegions: ImageRegion[]): boolean => {
      if (!Array.isArray(extraRegions) || extraRegions.length === 0) return false
      const mergedWithFallback = mergeBoardRegions([
        ...mergedRegions,
        ...extraRegions,
      ])
      if (!mergedWithFallback.regions.length) return false
      mergedRegions = mergedWithFallback.regions
      mergedPolygons = mergedWithFallback.polygons
      derivedRegionBounds = BoundingBox.fromGraphics(mergedRegions)
      mergedPolygonArea = multiPolygonArea(mergedPolygons)
      polygonCoverageRatio = computeCoverageRatio()
      return true
    }

    const outlineBoundingFallbacks = buildBoundingRegionsFromOutline(outlineRegions, size)
    if (applyFallbackRegions(outlineBoundingFallbacks)) {
      if (polygonCoverageRatio >= STROKE_AREA_RATIO_THRESHOLD) {
        // accept improved outline
      }
    }

    if (polygonCoverageRatio < STROKE_AREA_RATIO_THRESHOLD) {
      const outlinePathFallbacks = buildRegionsFromOpenPaths(outlinePaths, size)
      applyFallbackRegions(outlinePathFallbacks)
    }

    if (polygonCoverageRatio < STROKE_AREA_RATIO_THRESHOLD) {
      const openPathFallbackRegions = buildRegionsFromOpenPaths(openPaths, size)
      if (applyFallbackRegions(openPathFallbackRegions)) {
        if (polygonCoverageRatio >= STROKE_AREA_RATIO_THRESHOLD) {
          // outline restored
        }
      }
    }

    if (polygonCoverageRatio >= STROKE_AREA_RATIO_THRESHOLD) {
      // After integrating fallback regions we now have sufficient coverage;
      // continue with merged result.
    } else {
      const fallbackRegion = createRectangleRegionFromBox(size)
      const fallbackPolygon = fallbackRegion ? regionToPolygon(fallbackRegion) : null
      if (fallbackRegion && fallbackPolygon) {
        return {
          size,
          regions: [fallbackRegion],
          openPaths,
          polygons: [fallbackPolygon],
          failureReason: NO_CLOSED_REGIONS_FOUND,
        }
      }
    }

  }

  if (mergedRegions.length === 0) {
    const sizedFallbackRegion = createRectangleRegionFromBox(size)
    const sizedFallbackPolygon = sizedFallbackRegion
      ? regionToPolygon(sizedFallbackRegion)
      : null
    if (sizedFallbackRegion) {
      return {
        size,
        regions: [sizedFallbackRegion],
        openPaths,
        polygons: sizedFallbackPolygon ? [sizedFallbackPolygon] : null,
        failureReason: NO_CLOSED_REGIONS_FOUND,
      }
    }

    // Fallback: derive a rectangular clip from whichever outline primitives
    // exist so renders still have a bounded board.
    const fallbackBox = (() => {
      if (outlinePaths.length > 0) {
        return outlinePaths
          .map(p => BoundingBox.fromPath(p.segments, p.width))
          .reduce(BoundingBox.add, BoundingBox.empty())
      }
      if (outlineRegions.length > 0) {
        return BoundingBox.fromGraphics(outlineRegions)
      }
      return BoundingBox.empty()
    })()

    if (!BoundingBox.isEmpty(fallbackBox)) {
      const fallbackRegion = createRectangleRegionFromBox(fallbackBox)
      const fallbackPolygon = fallbackRegion ? regionToPolygon(fallbackRegion) : null
      return {
        regions: fallbackRegion ? [fallbackRegion] : [],
        openPaths,
        size: fallbackBox,
        polygons: fallbackPolygon ? [fallbackPolygon] : null,
        failureReason: NO_CLOSED_REGIONS_FOUND,
      }
    }

    return {size, regions: [], openPaths, polygons: null, failureReason: NO_CLOSED_REGIONS_FOUND}
  }

  const finalSize = (() => {
    const innerBounds = derivedRegionBounds
    if (
      usedStrokeReconstruction &&
      strokeBounds &&
      innerBounds &&
      !BoundingBox.isEmpty(strokeBounds) &&
      !BoundingBox.isEmpty(innerBounds) &&
      boundsContains(strokeBounds, innerBounds)
    ) {
      const [outerMinX, outerMinY, outerMaxX, outerMaxY] = strokeBounds
      const [innerMinX, innerMinY, innerMaxX, innerMaxY] = innerBounds
      const midpointBounds: SizeEnvelope = [
        (outerMinX + innerMinX) / 2,
        (outerMinY + innerMinY) / 2,
        (outerMaxX + innerMaxX) / 2,
        (outerMaxY + innerMaxY) / 2,
      ]
      if (!BoundingBox.isEmpty(midpointBounds)) return midpointBounds
    }
    return derivedRegionBounds ?? BoundingBox.fromGraphics(mergedRegions) ?? size
  })()

  const derivedBoundsArea = boundingBoxArea(derivedRegionBounds)
  if (
    (!mergedPolygonArea || mergedPolygonArea <= 0) &&
    derivedBoundsArea > 0
  ) {
    const fallbackRegion = createRectangleRegionFromBox(size)
    const fallbackPolygon = fallbackRegion ? regionToPolygon(fallbackRegion) : null
    if (fallbackRegion && fallbackPolygon) {
      return {
        regions: [fallbackRegion],
        openPaths,
        size,
        polygons: [fallbackPolygon],
        failureReason: NO_CLOSED_REGIONS_FOUND,
      }
    }
  }

  return {
    regions: mergedRegions,
    openPaths,
    size: finalSize,
    polygons: mergedPolygons,
  }
}

export function renderBoardShape(boardShape: BoardShape): BoardShapeRender {
  const {size, failureReason} = boardShape
  return {
    viewBox: sizeToViewBox(size),
    failureReason,
  }
}

const REGION_POINT_TOLERANCE = 1e-6

const sizeToViewBox = (size: SizeEnvelope): ViewBox => {
  if (!Array.isArray(size) || size.length < 4 || BoundingBox.isEmpty(size)) {
    return [0, 0, 0, 0]
  }

  const [minX, minY, maxX, maxY] = size
  return [minX, -maxY, maxX - minX, maxY - minY]
}

const toXY = (pos?: Position): [number, number] => [
  Number(pos?.[0]) || 0,
  Number(pos?.[1]) || 0,
]

const positionsClose = (a: [number, number], b: [number, number], eps = REGION_POINT_TOLERANCE) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const approximateArcPoints = (segment: PathSegment): [number, number][] => {
  if (segment.type !== ARC) return []
  const startAngle = segment.start?.[2]
  const endAngle = segment.end?.[2]
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toXY(segment.start)
  const endRaw = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startRaw, endRaw)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const [cx, cy] = segment.center ? toXY(segment.center) : [0, 0]
  const radius = Number(segment.radius) || 0
  const points: [number, number][] = []
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

const regionToPolygon = (region: ImageRegion): Polygon | null => {
  if (!Array.isArray(region.segments) || region.segments.length === 0) return null
  const rings: [number, number][][] = []
  let currentRing: [number, number][] = []
  let cursor: [number, number] | null = null

  const finalizeRing = () => {
    if (currentRing.length >= 3) {
      if (!positionsClose(currentRing[0], currentRing[currentRing.length - 1])) {
        currentRing.push([...currentRing[0]] as [number, number])
      }
      rings.push(currentRing)
    }
    currentRing = []
  }

  for (const segment of region.segments) {
    const start = toXY(segment.start)
    const end = toXY(segment.end)
    if (!cursor || !positionsClose(cursor, start)) {
      if (currentRing.length > 0) finalizeRing()
      currentRing = [start]
    }
    if (segment.type === LINE) {
      currentRing.push(end)
    } else if (segment.type === ARC) {
      const arcPoints = approximateArcPoints(segment)
      arcPoints.forEach(point => currentRing.push(point))
      currentRing.push(end)
    } else {
      currentRing.push(end)
    }
    cursor = end
  }
  finalizeRing()

  if (rings.length === 0) return null
  return rings
}

const ringToSegments = (ring: [number, number][]): PathSegment[] => {
  const segments: PathSegment[] = []
  for (let i = 0; i < ring.length; i++) {
    const start = ring[i]
    const end = ring[(i + 1) % ring.length]
    if (positionsClose(start as [number, number], end as [number, number])) continue
    segments.push({
      type: LINE,
      start: [start[0], start[1]],
      end: [end[0], end[1]],
    })
  }
  return segments
}

const polygonToRegions = (polygons: MultiPolygon): ImageRegion[] => {
  if (!Array.isArray(polygons) || polygons.length === 0) return []
  const areas = polygons.map(polygonArea)
  const maxArea = Math.max(...areas, 0)
  const minArea = maxArea * 0.05
  const regions: ImageRegion[] = []
  polygons.forEach((polygon, index) => {
    const outerRing = polygon?.[0]
    if (!Array.isArray(outerRing) || outerRing.length < 3) return
    const area = Math.abs(areas[index])
    if (maxArea > 0 && area < minArea) return
    const segments = ringToSegments(outerRing)
    if (segments.length > 0) {
      regions.push({type: IMAGE_REGION, segments})
    }
  })
  return regions
}

const ringSignedArea = (ring?: [number, number][]): number => {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

const polygonArea = (polygon?: [number, number][][]): number => {
  const ring = polygon?.[0]
  return ringSignedArea(ring)
}

const cloneRing = (ring?: [number, number][]) =>
  Array.isArray(ring) ? ring.map(([x, y]) => [Number(x) || 0, Number(y) || 0]) : null

const multiPolygonArea = (value?: MultiPolygon | null): number => {
  if (!Array.isArray(value) || value.length === 0) return 0
  let total = 0
  value.forEach(polygon => {
    if (!Array.isArray(polygon) || polygon.length === 0) return
    polygon.forEach((ring, index) => {
      const area = Math.abs(ringSignedArea(ring))
      if (!area) return
      total += index === 0 ? area : -area
    })
  })
  return total
}

const boundingBoxArea = (box?: SizeEnvelope | null): number => {
  if (!Array.isArray(box) || box.length < 4) return 0
  const width = Math.abs(box[2] - box[0])
  const height = Math.abs(box[3] - box[1])
  const area = width * height
  return Number.isFinite(area) ? area : 0
}

const buildRegionsFromOpenPaths = (
  paths: ImagePath[],
  boardSize: SizeEnvelope
): ImageRegion[] => {
  if (!Array.isArray(paths) || paths.length === 0) return []
  const boardArea = boundingBoxArea(boardSize)
  const minArea = boardArea > 0 ? boardArea * 0.01 : 0
  const regions: ImageRegion[] = []
  for (const path of paths) {
    const box = BoundingBox.fromPath(path.segments, path.width)
    const area = boundingBoxArea(box)
    if (!area || (minArea > 0 && area < minArea)) continue
    const rectRegion = createRectangleRegionFromBox(box)
    if (rectRegion) regions.push(rectRegion)
  }
  return regions
}

const buildBoundingRegionsFromOutline = (
  outlineRegions: ImageRegion[],
  boardSize: SizeEnvelope
): ImageRegion[] => {
  if (!Array.isArray(outlineRegions) || outlineRegions.length === 0) return []
  const boardArea = boundingBoxArea(boardSize)
  const minArea = boardArea > 0 ? boardArea * 0.01 : 0
  const regions: ImageRegion[] = []
  for (const region of outlineRegions) {
    const bbox = BoundingBox.fromGraphics([region])
    const area = boundingBoxArea(bbox)
    if (!area || (minArea > 0 && area < minArea)) continue
    const rectRegion = createRectangleRegionFromBox(bbox)
    if (rectRegion) regions.push(rectRegion)
  }
  return regions
}

const boundsFromPolygon = (polygon?: Polygon | null): SizeEnvelope => {
  if (!Array.isArray(polygon) || polygon.length === 0) return []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of polygon) {
    if (!Array.isArray(ring)) continue
    for (const point of ring) {
      const x = Number(point?.[0])
      const y = Number(point?.[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return []
  }
  return [minX, minY, maxX, maxY]
}

const boundsTouchOrOverlap = (
  a?: SizeEnvelope | null,
  b?: SizeEnvelope | null,
  eps = 0
): boolean => {
  if (!Array.isArray(a) || a.length < 4) return false
  if (!Array.isArray(b) || b.length < 4) return false
  return !(
    a[2] < b[0] - eps ||
    a[0] > b[2] + eps ||
    a[3] < b[1] - eps ||
    a[1] > b[3] + eps
  )
}

const boundsContains = (
  outer?: SizeEnvelope | null,
  inner?: SizeEnvelope | null,
  eps = 0
): boolean => {
  if (!Array.isArray(outer) || outer.length < 4) return false
  if (!Array.isArray(inner) || inner.length < 4) return false
  return (
    outer[0] <= inner[0] + eps &&
    outer[1] <= inner[1] + eps &&
    outer[2] >= inner[2] - eps &&
    outer[3] >= inner[3] - eps
  )
}

const boundsContainsPoint = (
  bounds: SizeEnvelope | null | undefined,
  point: [number, number],
  eps = 0
): boolean => {
  if (!Array.isArray(bounds) || bounds.length < 4) return false
  const [x, y] = point
  return (
    x >= bounds[0] - eps &&
    x <= bounds[2] + eps &&
    y >= bounds[1] - eps &&
    y <= bounds[3] + eps
  )
}

const pointInRing = (point: [number, number], ring?: [number, number][]): boolean => {
  if (!Array.isArray(ring) || ring.length < 3) return false
  const [px, py] = point
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false
  const lastIndex = ring.length - 1
  const closed = lastIndex >= 1 && positionsClose(ring[0], ring[lastIndex])
  const n = closed ? lastIndex : ring.length
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

const pointInPolygon = (point: [number, number], polygon?: Polygon | null): boolean => {
  if (!Array.isArray(polygon) || polygon.length === 0) return false
  let inside = false
  for (const ring of polygon) {
    if (pointInRing(point, ring as [number, number][])) inside = !inside
  }
  return inside
}

const ringCentroid = (ring?: [number, number][]): [number, number] | null => {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const lastIndex = ring.length - 1
  const closed = lastIndex >= 1 && positionsClose(ring[0], ring[lastIndex])
  const n = closed ? lastIndex : ring.length
  let signedArea2 = 0
  let cx6 = 0
  let cy6 = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % n]
    const cross = x1 * y2 - x2 * y1
    signedArea2 += cross
    cx6 += (x1 + x2) * cross
    cy6 += (y1 + y2) * cross
  }
  if (Math.abs(signedArea2) < 1e-12) return null
  const signedArea = signedArea2 / 2
  return [cx6 / (6 * signedArea), cy6 / (6 * signedArea)]
}

const samplePointsInPolygon = (polygon: Polygon): [number, number][] => {
  const bounds = boundsFromPolygon(polygon)
  if (!Array.isArray(bounds) || bounds.length < 4) return []
  const [minX, minY, maxX, maxY] = bounds
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const dx = (maxX - minX) * 0.25
  const dy = (maxY - minY) * 0.25
  const candidates: [number, number][] = []
  const centroid = ringCentroid(polygon[0] as [number, number][])
  if (centroid) candidates.push(centroid)
  candidates.push([cx, cy], [cx + dx, cy], [cx - dx, cy], [cx, cy + dy], [cx, cy - dy])
  const unique = new Map<string, [number, number]>()
  for (const pt of candidates) {
    const key = `${pt[0]},${pt[1]}`
    if (!unique.has(key)) unique.set(key, pt)
  }
  return Array.from(unique.values()).filter(pt => pointInPolygon(pt, polygon))
}

const pointSegmentDistanceSquared = (
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number => {
  const [px, py] = point
  const [x1, y1] = start
  const [x2, y2] = end
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    const ddx = px - x1
    const ddy = py - y1
    return ddx * ddx + ddy * ddy
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
  const clamped = Math.max(0, Math.min(1, t))
  const projX = x1 + clamped * dx
  const projY = y1 + clamped * dy
  const ddx = px - projX
  const ddy = py - projY
  return ddx * ddx + ddy * ddy
}

const imagePathCoversPoint = (path: ImagePath, point: [number, number]): boolean => {
  const halfWidth = Math.max(0, Number(path.width) || 0) / 2
  if (halfWidth <= 0) return false
  const threshold2 = halfWidth * halfWidth
  for (const segment of path.segments ?? []) {
    if (segment.type === LINE) {
      const start = toXY(segment.start)
      const end = toXY(segment.end)
      if (pointSegmentDistanceSquared(point, start, end) <= threshold2) return true
    } else if (segment.type === ARC) {
      const start = toXY(segment.start)
      const end = toXY(segment.end)
      const mid = approximateArcPoints(segment)
      const points = [start, ...mid, end]
      for (let i = 1; i < points.length; i++) {
        if (pointSegmentDistanceSquared(point, points[i - 1], points[i]) <= threshold2) return true
      }
    }
  }
  return false
}

const shapeCoversPoint = (
  shape: ImageShape['shape'],
  point: [number, number],
  options?: {ignoreErase?: boolean}
): boolean => {
  if (!shape) return false
  switch (shape.type) {
    case 'circle': {
      const dx = point[0] - Number(shape.cx)
      const dy = point[1] - Number(shape.cy)
      const r = Number(shape.r) || 0
      return dx * dx + dy * dy <= r * r
    }
    case 'rectangle': {
      const x1 = Number(shape.x)
      const y1 = Number(shape.y)
      const x2 = x1 + (Number(shape.xSize) || 0)
      const y2 = y1 + (Number(shape.ySize) || 0)
      return point[0] >= x1 && point[0] <= x2 && point[1] >= y1 && point[1] <= y2
    }
    case 'polygon': {
      const ring = Array.isArray(shape.points)
        ? (shape.points.map(([x, y]) => [Number(x) || 0, Number(y) || 0]) as [number, number][])
        : null
      return ring ? pointInRing(point, ring) : false
    }
    case 'outline': {
      // Outline shapes represent paths; without width we treat them as non-covering.
      return false
    }
    case 'layeredShape': {
      for (const entry of shape.shapes ?? []) {
        if (options?.ignoreErase !== false && entry?.erase === true) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (shapeCoversPoint(entry as any, point, options)) return true
      }
      return false
    }
  }
  return false
}

type MaterialSource = {
  type: Layer['type']
  tree: ImageTree
}

const holePolygonHasMaterial = (holePolygon: Polygon, sources: MaterialSource[]): boolean => {
  if (!sources.length) return false
  const samples = samplePointsInPolygon(holePolygon)
  if (samples.length === 0) return false

  const regionCache = new WeakMap<ImageRegion, Polygon | null>()

  const graphicCoversPoint = (
    graphic: ImageRegion | ImagePath | ImageShape,
    point: [number, number]
  ): boolean => {
    if (graphic.type === IMAGE_REGION) {
      let poly = regionCache.get(graphic)
      if (poly === undefined) {
        poly = regionToPolygon(graphic)
        regionCache.set(graphic, poly)
      }
      return poly ? pointInPolygon(point, poly) : false
    }
    if (graphic.type === IMAGE_PATH) return imagePathCoversPoint(graphic, point)
    if (graphic.type === 'imageShape') return shapeCoversPoint(graphic.shape, point)
    return false
  }

  for (const point of samples) {
    for (const source of sources) {
      const tree = source.tree
      if (!boundsContainsPoint(tree.size, point)) continue
      for (const graphic of tree.children ?? []) {
        if (!graphic) continue
        if (source.type === TYPE_COPPER) {
          if ((graphic as {erase?: boolean}).erase === true) continue
          if ((graphic as {polarity?: string}).polarity === CLEAR) continue
        } else if (source.type === TYPE_SOLDERMASK) {
          if ((graphic as {erase?: boolean}).erase === true) continue
        }
        const graphicBounds = BoundingBox.fromGraphic(graphic)
        if (!boundsContainsPoint(graphicBounds, point)) continue
        if (graphicCoversPoint(graphic as ImageGraphic, point)) return true
      }
    }
  }
  return false
}

const reconstructStrokeBoardPolygons = (
  polygons: MultiPolygon | null | undefined,
  options?: {layers?: Layer[]; plotTreesById?: Record<string, ImageTree>}
): MultiPolygon | null => {
  if (!Array.isArray(polygons) || polygons.length === 0) return null

  const candidates: Array<{
    polygon: Polygon
    area: number
    bounds: SizeEnvelope
  }> = []

  for (const poly of polygons) {
    if (!Array.isArray(poly) || poly.length < 2) continue
    for (let ringIndex = 1; ringIndex < poly.length; ringIndex++) {
      const ring = cloneRing(poly[ringIndex])
      if (!ring || ring.length < 3) continue
      if (!positionsClose(ring[0], ring[ring.length - 1])) ring.push([...ring[0]] as [number, number])
      const candidate: Polygon = [ring]
      const area = multiPolygonArea([candidate])
      if (!area || area <= 0) continue
      candidates.push({polygon: candidate, area, bounds: boundsFromPolygon(candidate)})
    }
  }

  if (candidates.length === 0) return null

  const connectedExcludingContainment = (a: typeof candidates[number], b: typeof candidates[number]): boolean => {
    if (!boundsTouchOrOverlap(a.bounds, b.bounds)) return false
    const smallArea = Math.min(a.area, b.area)
    const areaEps = Math.max(1e-9, smallArea * 1e-6)
    try {
      const inter = polygonClipping.intersection(a.polygon, b.polygon)
      const interArea = multiPolygonArea(inter)
      if (interArea > 0) {
        // If intersection covers the smaller polygon, treat as containment rather than connection.
        if (interArea >= smallArea - areaEps) {
          // Identical shapes can be merged safely.
          const largeArea = Math.max(a.area, b.area)
          const nearlyIdentical =
            Math.abs(a.area - b.area) <= Math.max(1e-9, largeArea * 1e-6)
          if (nearlyIdentical) return true

          // Special case: contained but touching the container boundary should be considered connected.
          const [larger, smaller] = a.area >= b.area ? [a, b] : [b, a]
          const diff = polygonClipping.difference(larger.polygon, smaller.polygon)
          const createsHole =
            Array.isArray(diff) &&
            diff.some(polygon => Array.isArray(polygon) && polygon.length > 1)
          return !createsHole
        }
        return true
      }
      const union = polygonClipping.union(a.polygon, b.polygon)
      return Array.isArray(union) && union.length === 1
    } catch {
      return false
    }
  }

  const assigned = new Array<number>(candidates.length).fill(-1)
  const rawComponents: Polygon[][] = []

  for (let i = 0; i < candidates.length; i++) {
    if (assigned[i] !== -1) continue
    const componentId = rawComponents.length
    assigned[i] = componentId
    const queue: number[] = [i]
    const polys: Polygon[] = []
    while (queue.length > 0) {
      const idx = queue.shift() as number
      polys.push(candidates[idx].polygon)
      for (let j = 0; j < candidates.length; j++) {
        if (assigned[j] !== -1) continue
        if (!connectedExcludingContainment(candidates[idx], candidates[j])) continue
        assigned[j] = componentId
        queue.push(j)
      }
    }
    rawComponents.push(polys)
  }

  const components: Array<{
    polygon: Polygon
    area: number
    bounds: SizeEnvelope
  }> = []

  for (const componentPolys of rawComponents) {
    try {
      const unionResult = polygonClipping.union(...componentPolys)
      if (!Array.isArray(unionResult) || unionResult.length === 0) continue
      for (const compPoly of unionResult) {
        if (!Array.isArray(compPoly) || compPoly.length === 0) continue
        const area = multiPolygonArea([compPoly])
        if (!area || area <= 0) continue
        components.push({polygon: compPoly, area, bounds: boundsFromPolygon(compPoly)})
      }
    } catch {
      // ignore component union failures
    }
  }

  if (components.length === 0) return null

  const parents = new Array<number>(components.length).fill(-1)
  for (let i = 0; i < components.length; i++) {
    let bestParent = -1
    let bestArea = Infinity
    for (let j = 0; j < components.length; j++) {
      if (i === j) continue
      if (components[j].area <= components[i].area) continue
      if (!boundsContains(components[j].bounds, components[i].bounds)) continue
      try {
        const inter = polygonClipping.intersection(components[j].polygon, components[i].polygon)
        const interArea = multiPolygonArea(inter)
        const areaEps = Math.max(1e-9, components[i].area * 1e-6)
        if (interArea >= components[i].area - areaEps) {
          if (components[j].area < bestArea) {
            bestParent = j
            bestArea = components[j].area
          }
        }
      } catch {
        // ignore containment test failures
      }
    }
    parents[i] = bestParent
  }

  const depths = new Array<number>(components.length).fill(0)
  for (let i = 0; i < components.length; i++) {
    let depth = 0
    let cursor = parents[i]
    while (cursor !== -1 && depth < 1000) {
      depth += 1
      cursor = parents[cursor]
    }
    depths[i] = depth
  }

  const materialSources: MaterialSource[] = []
  if (options?.layers && options?.plotTreesById) {
    for (const layer of options.layers) {
      if (!layer?.id) continue
      if (layer.type !== TYPE_COPPER && layer.type !== TYPE_SOLDERMASK) continue
      const tree = options.plotTreesById[layer.id]
      if (!tree || !Array.isArray(tree.children) || tree.children.length === 0) continue
      materialSources.push({type: layer.type, tree})
    }
  }

  const excluded = new Set<number>()
  if (materialSources.length > 0) {
    for (let i = 0; i < components.length; i++) {
      if (depths[i] % 2 !== 1) continue
      if (holePolygonHasMaterial(components[i].polygon, materialSources)) {
        excluded.add(i)
      }
    }
  }

  const toggles = components
    .filter((_, index) => !excluded.has(index))
    .map(entry => entry.polygon)

  if (toggles.length === 0) return null

  try {
    const result = polygonClipping.xor(...toggles)
    return Array.isArray(result) && result.length > 0 ? result : null
  } catch {
    return null
  }
}

const CLIPPER_SNAP_PRECISION = 1e7

const snapClipperValue = (value: number): number => {
  const number = Number(value) || 0
  return Math.round(number * CLIPPER_SNAP_PRECISION) / CLIPPER_SNAP_PRECISION
}

const snapClipperPoint = (point: [number, number]): [number, number] => [
  snapClipperValue(point[0]),
  snapClipperValue(point[1]),
]

const pointsEqual = (a: [number, number], b: [number, number]): boolean =>
  a[0] === b[0] && a[1] === b[1]

const sanitizeRingForPolygonClipping = (
  ring?: [number, number][]
): [number, number][] | null => {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const deduped: [number, number][] = []
  for (const raw of ring) {
    const snapped = snapClipperPoint([Number(raw?.[0]) || 0, Number(raw?.[1]) || 0])
    const prev = deduped[deduped.length - 1]
    if (!prev || !pointsEqual(prev, snapped)) deduped.push(snapped)
  }
  if (deduped.length < 3) return null
  const first = deduped[0]
  const last = deduped[deduped.length - 1]
  if (!pointsEqual(first, last)) deduped.push([...first] as [number, number])
  if (deduped.length < 4) return null
  return deduped
}

const sanitizePolygonForPolygonClipping = (polygon?: Polygon | null): Polygon | null => {
  if (!Array.isArray(polygon) || polygon.length === 0) return null
  const rings = polygon
    .map(ring => sanitizeRingForPolygonClipping(ring as [number, number][]))
    .filter((ring): ring is [number, number][] => Boolean(ring))
  return rings.length ? rings : null
}
const mergeBoardRegions = (
  regions: ImageRegion[]
): {regions: ImageRegion[]; polygons: MultiPolygon | null} => {
  if (!Array.isArray(regions) || regions.length === 0) {
    return {regions: regions ?? [], polygons: null}
  }
  const polygons = regions
    .map(regionToPolygon)
    .map(sanitizePolygonForPolygonClipping)
    .filter((polygon): polygon is Polygon => Boolean(polygon))
  if (polygons.length === 0) return {regions, polygons: null}
  try {
    const unionResult = polygonClipping.union(...polygons)
    if (!Array.isArray(unionResult) || unionResult.length === 0) {
      return {regions, polygons: null}
    }
    return {
      regions: polygonToRegions(unionResult),
      polygons: unionResult,
    }
  } catch (error) {
    console.warn('[tracespace][board-shape] Failed to merge regions', error)
    const fallbackPolygons = polygons as unknown as MultiPolygon
    return {
      regions,
      polygons: fallbackPolygons.length ? fallbackPolygons : null,
    }
  }
}

export const __testing = {
  reconstructStrokeBoardPolygons,
}
