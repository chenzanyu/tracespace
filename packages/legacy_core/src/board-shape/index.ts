import {
  IMAGE_PATH,
  IMAGE_REGION,
  LINE,
  BoundingBox,
} from '@tracespace/legacy-plotter'
import {renderGraphic, sizeToViewBox} from '@tracespace/legacy-renderer'
import {
  TYPE_COPPER,
  TYPE_DRILL,
  TYPE_SILKSCREEN,
  TYPE_SOLDERMASK,
  TYPE_SOLDERPASTE,
} from '@tracespace/identify-layers'

import type {
  ImageTree,
  ImagePath,
  ImageRegion,
  SizeEnvelope,
} from '@tracespace/legacy-plotter'
import type {SvgElement, ViewBox} from '@tracespace/legacy-renderer'

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
    return {
      size,
      regions: fallbackRegion ? [fallbackRegion] : [],
      openPaths: [],
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

  const regions = [...outlineRegions, ...derivedRegions]

  if (regions.length === 0) {
    // Fallback: some outline layers are drawn as open strokes that never
    // numerically close (CAD output quirks, rounding, or missing final edge).
    // In that case, derive a rectangular board shape from the bounding box of
    // all outline paths so top/bottom renders still get a reasonable clip.
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
      return {
        regions: fallbackRegion ? [fallbackRegion] : [],
        openPaths,
        size: fallbackBox,
      }
    }

    return {size, regions: [], openPaths, failureReason: NO_CLOSED_REGIONS_FOUND}
  }

  return {
    regions,
    openPaths,
    size: BoundingBox.fromGraphics(regions),
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
  return failureReason ? {viewBox, failureReason, path} : {viewBox, path}
}

