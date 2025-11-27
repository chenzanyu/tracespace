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

export interface BoardShape {
  size: SizeEnvelope
  regions: ImageRegion[]
  openPaths: ImagePath[]
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

  const mergedRegions = mergeBoardRegions([
    ...outlineRegions,
    ...derivedRegions,
  ])

  if (mergedRegions.length === 0) {
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
      }
    }

    return {size, regions: [], openPaths, failureReason: NO_CLOSED_REGIONS_FOUND}
  }

  return {
    regions: mergedRegions,
    openPaths,
    size: BoundingBox.fromGraphics(mergedRegions),
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

type Polygon = polygonClipping.Polygon
type MultiPolygon = polygonClipping.MultiPolygon

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

const polygonArea = (polygon?: [number, number][][]): number => {
  const ring = polygon?.[0]
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

const mergeBoardRegions = (regions: ImageRegion[]): ImageRegion[] => {
  if (!Array.isArray(regions) || regions.length === 0) return regions
  const polygons = regions
    .map(regionToPolygon)
    .filter((polygon): polygon is Polygon => Boolean(polygon))
  if (polygons.length === 0) return regions
  try {
    const unionResult = polygonClipping.union(...polygons)
    if (!Array.isArray(unionResult) || unionResult.length === 0) {
      return regions
    }
    return polygonToRegions(unionResult)
  } catch (error) {
    console.warn('[tracespace][board-shape] Failed to merge regions', error)
    return regions
  }
}
