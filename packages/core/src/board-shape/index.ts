import {
  IMAGE_PATH,
  IMAGE_REGION,
  LINE,
  ARC,
  BoundingBox,
} from '@tracespace/plotter'
import {
  TYPE_COPPER,
  TYPE_DRILL,
  TYPE_SILKSCREEN,
  TYPE_SOLDERMASK,
  TYPE_SOLDERPASTE,
  TYPE_OUTLINE,
} from '@tracespace/identify-layers'
import {renderGraphic, sizeToViewBox} from '@tracespace/renderer'
import polygonClipping from 'polygon-clipping'

import type {
  ImageTree,
  ImagePath,
  ImageRegion,
  SizeEnvelope,
  PathSegment,
  Position,
} from '@tracespace/plotter'
import type {SvgElement, ViewBox} from '@tracespace/renderer'

import type {Layer} from '..'
import {getOutlineLayer} from '../sort-layers'
import {walkPaths} from './walk-paths'
import {fillGaps} from './fill-gaps'

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
  path?: SvgElement
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
    const reconstructedPolygons = reconstructStrokeBoardPolygons(mergedPolygons)
    if (reconstructedPolygons) {
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

  const finalSize = derivedRegionBounds ?? BoundingBox.fromGraphics(mergedRegions) ?? size

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
  const {regions, size, failureReason} = boardShape
  const viewBox = sizeToViewBox(size)
  const segments = regions.flatMap(r => r.segments)
  const path =
    segments.length > 0 ? renderGraphic({type: IMAGE_REGION, segments}) : undefined

  if (failureReason && !path) {
    return {viewBox, failureReason}
  }

  return failureReason
    ? {viewBox, failureReason, path}
    : {viewBox, path}
}

const REGION_POINT_TOLERANCE = 1e-6

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

const reconstructStrokeBoardPolygons = (
  polygons?: MultiPolygon | null
): MultiPolygon | null => {
  if (!Array.isArray(polygons) || polygons.length === 0) return null
  const sortable = polygons
    .map(polygon => ({
      polygon,
      outer: cloneRing(polygon?.[0]),
      inner: cloneRing(polygon?.[1]),
      outerArea: Math.abs(ringSignedArea(polygon?.[0])),
    }))
    .filter(entry => entry.outer && entry.inner && entry.outerArea > 0)
  if (!sortable.length) return null
  sortable.sort((a, b) => (b.outerArea ?? 0) - (a.outerArea ?? 0))
  const perimeter = sortable.shift()
  if (!perimeter?.inner) return null
  const boardPolygon: [number, number][][] = [perimeter.inner]
  sortable.forEach(entry => {
    if (entry.outer) {
      boardPolygon.push(entry.outer)
    }
  })
  return [boardPolygon]
}
const mergeBoardRegions = (
  regions: ImageRegion[]
): {regions: ImageRegion[]; polygons: MultiPolygon | null} => {
  if (!Array.isArray(regions) || regions.length === 0) {
    return {regions: regions ?? [], polygons: null}
  }
  const polygons = regions
    .map(regionToPolygon)
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
    return {regions, polygons: null}
  }
}
