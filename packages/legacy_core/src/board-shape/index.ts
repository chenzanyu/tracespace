import {IMAGE_PATH, IMAGE_REGION, LINE, BoundingBox} from '@tracespace/legacy-plotter'
import {renderGraphic, sizeToViewBox} from '@tracespace/legacy-renderer'

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

  const nonDrillBoxes = collectLayerBoxes(layer => layer.type !== 'drill')
  const anyLayerBoxes = nonDrillBoxes.length > 0
    ? nonDrillBoxes
    : collectLayerBoxes(() => true)

  const outlineId = getOutlineLayer(layers)
  const outlinePlot =
    outlineId === undefined ? undefined : plotTreesById[outlineId]
  const size = BoundingBox.sum(anyLayerBoxes)

  if (outlinePlot === undefined) {
    return {
      size,
      regions: [],
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
  const inputSegments = outlinePaths.flatMap(path => path.segments)

  if (inputSegments.length === 0) {
    if (outlineRegions.length > 0) {
      const derivedRegions = outlineRegions.map(region => ({
        type: IMAGE_REGION as const,
        segments: region.segments,
      }))
      const regionBox = BoundingBox.fromGraphics(derivedRegions)
      return {
        size: BoundingBox.isEmpty(regionBox) ? size : regionBox,
        regions: derivedRegions,
        openPaths: [],
      }
    }
    return {
      size,
      regions: [],
      openPaths: [],
      failureReason: NO_PATHS_IN_OUTLINE_LAYER,
    }
  }

  const allPaths = walkPaths(inputSegments)
  const [regions, openPaths] = fillGaps(allPaths, maximumGap)

  if (regions.length === 0) {
    // Fallback: some outline layers are drawn as open strokes that never
    // numerically close (CAD output quirks, rounding, or missing final edge).
    // In that case, derive a rectangular board shape from the bounding box of
    // all outline paths so top/bottom renders still get a reasonable clip.
    if (outlinePaths.length > 0) {
      const box = outlinePaths
        .map(p => BoundingBox.fromPath(p.segments, p.width))
        .reduce(BoundingBox.add, BoundingBox.empty())

      if (!BoundingBox.isEmpty(box)) {
        const [x1, y1, x2, y2] = box
        const fallbackRegion: ImageRegion = {
          type: IMAGE_REGION,
          segments: [
            {type: LINE, start: [x1, y1], end: [x2, y1]},
            {type: LINE, start: [x2, y1], end: [x2, y2]},
            {type: LINE, start: [x2, y2], end: [x1, y2]},
            {type: LINE, start: [x1, y2], end: [x1, y1]},
          ],
        }

        return {
          regions: [fallbackRegion],
          openPaths,
          size: box,
        }
      }
    }

    return {size, regions, openPaths, failureReason: NO_CLOSED_REGIONS_FOUND}
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

  return failureReason === undefined
    ? {viewBox, path: renderGraphic({type: IMAGE_REGION, segments})}
    : {viewBox, failureReason}
}

