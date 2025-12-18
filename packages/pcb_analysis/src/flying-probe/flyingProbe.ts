import type {
  EnigAreaOptions,
  FlyingProbeCountInput,
  FlyingProbeCountResult,
  FlyingProbeCountSideInput,
  FlyingProbeCountSideResult,
} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {boundsFromPolygons, boundsToRectMultiPolygon, normalizeBounds} from '../internal/bounds'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {destroyGeom} from '../internal/geos/geom'
import {countPolygonComponentsWhere, unionTwo} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildBoardGeometry, buildLayerGeometryFromTrees} from '../internal/layerGeometry'
import {buildFlyingProbeMaskOpenUnionClipped, computeFlyingProbeMaskIslandCountForTrees} from './flyingProbeCore'

export const computeFlyingProbeCountForSide = async (input: FlyingProbeCountSideInput): Promise<FlyingProbeCountSideResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_ENIG_AREA_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon = boundsToRectMultiPolygon(bounds)

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  const drillPtr =
    drillTrees.length > 0
      ? await buildLayerGeometryFromTrees(geos, drillTrees, options, {
          preferClearWhenDarkEmpty: true,
          overlayGridSize,
          mmPerUnit,
        })
      : null

  const trees = Array.isArray(input.soldermaskTrees) ? input.soldermaskTrees.filter(Boolean) : []
  let boardClipPtr = boundsPolygon ? buildBoardGeometry(geos, boundsPolygon) : buildBoardGeometry(geos, input.boardPolygons)

  const flyingProbeCount = await computeFlyingProbeMaskIslandCountForTrees({
    geos,
    soldermaskTrees: trees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })

  destroyGeom(geos, boardClipPtr)
  boardClipPtr = null
  destroyGeom(geos, drillPtr)

  return {flyingProbeCount}
}

/**
 * 计算“双面飞针点数”。
 *
 * 定义：
 * - `maskTopCount = computeFlyingProbeCountForSide(top mask)`
 * - `maskBottomCount = computeFlyingProbeCountForSide(bottom mask)`
 * - `drillCount = Count(DrillHoles ∩ (MaskOpenTop ∪ MaskOpenBottom))`
 * - `total = maskTopCount + maskBottomCount + drillCount`
 */
export const computeFlyingProbeCount = async (input: FlyingProbeCountInput): Promise<FlyingProbeCountResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_ENIG_AREA_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon = boundsToRectMultiPolygon(bounds)

  let boardClipPtr = boundsPolygon ? buildBoardGeometry(geos, boundsPolygon) : buildBoardGeometry(geos, input.boardPolygons)

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  const drillPtr =
    drillTrees.length > 0
      ? await buildLayerGeometryFromTrees(geos, drillTrees, options, {
          preferClearWhenDarkEmpty: true,
          overlayGridSize,
          mmPerUnit,
        })
      : null

  const soldermaskTopTrees = Array.isArray(input.soldermaskTopTrees) ? input.soldermaskTopTrees.filter(Boolean) : []
  const soldermaskBottomTrees = Array.isArray(input.soldermaskBottomTrees) ? input.soldermaskBottomTrees.filter(Boolean) : []

  const maskTopCount = await computeFlyingProbeMaskIslandCountForTrees({
    geos,
    soldermaskTrees: soldermaskTopTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const maskBottomCount = await computeFlyingProbeMaskIslandCountForTrees({
    geos,
    soldermaskTrees: soldermaskBottomTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })

  const topMaskUnionPtr = await buildFlyingProbeMaskOpenUnionClipped({
    geos,
    soldermaskTrees: soldermaskTopTrees,
    boardClipPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const bottomMaskUnionPtr = await buildFlyingProbeMaskOpenUnionClipped({
    geos,
    soldermaskTrees: soldermaskBottomTrees,
    boardClipPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })

  const maskUnionPtr = unionTwo(geos, topMaskUnionPtr, bottomMaskUnionPtr, overlayGridSize)

  const drillCount =
    drillPtr && maskUnionPtr
      ? countPolygonComponentsWhere(geos, drillPtr, polyPtr => {
          try {
            return geos.GEOSIntersects(polyPtr as never, maskUnionPtr as never) === 1
          } catch {
            return false
          }
        })
      : 0

  const flyingProbeCount = maskTopCount + maskBottomCount + drillCount

  destroyGeom(geos, maskUnionPtr)
  destroyGeom(geos, drillPtr)
  destroyGeom(geos, boardClipPtr)
  boardClipPtr = null

  return {
    flyingProbeCount,
    debug: {
      maskTopCount,
      maskBottomCount,
      drillCount,
    },
  }
}
