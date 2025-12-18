import type {EnigAreaOptions, EnigAreaSideInput, EnigAreaSideResult} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {boundsFromPolygons, boundsToRectMultiPolygon, normalizeBounds} from '../internal/bounds'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {computeArea, destroyGeom} from '../internal/geos/geom'
import {difference, intersection} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildBoardGeometry, buildLayerGeometryFromTrees} from '../internal/layerGeometry'

/**
 * 计算“单面平面沉金面积 (Planar ENIG area)”
 *
 * 定义（单面）：
 * - `enig = Copper ∩ MaskOpen`
 * - `enigAreaMm2 = Area(enig) * mmPerUnit^2`
 * - `boardAreaMm2 = Area(Rect(boardBounds)) * mmPerUnit^2`（分母是外接矩形面积，不是实际轮廓面积）
 *
 * 其他说明：
 * - 若提供 `drillTrees`：会从裁剪区域中扣除孔洞，避免把孔洞面积计入 copper/mask/enig
 * - `ImageTree.units` 若与 `mmPerUnit` 不一致，会自动做缩放统一后再运算
 *
 * @example
 * ```ts
 * const top = await computeEnigAreaForSide({mmPerUnit, boardPolygons, copperTrees, soldermaskTrees})
 * ```
 */
export const computeEnigAreaForSide = async (input: EnigAreaSideInput): Promise<EnigAreaSideResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_ENIG_AREA_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon = boundsToRectMultiPolygon(bounds)

  const boardWidth = bounds ? Math.abs(bounds[2] - bounds[0]) : 0
  const boardHeight = bounds ? Math.abs(bounds[3] - bounds[1]) : 0
  const boardAreaUnits2 = Number.isFinite(boardWidth) && Number.isFinite(boardHeight) ? boardWidth * boardHeight : 0
  const boardAreaMm2 = boardAreaUnits2 * mmPerUnit * mmPerUnit

  let boardClipPtr = boundsPolygon ? buildBoardGeometry(geos, boundsPolygon) : buildBoardGeometry(geos, input.boardPolygons)

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  if (boardClipPtr && drillTrees.length) {
    const drillPtr = await buildLayerGeometryFromTrees(geos, drillTrees, options, {
      preferClearWhenDarkEmpty: true,
      overlayGridSize,
      mmPerUnit,
    })
    if (drillPtr) {
      const subtracted = difference(geos, boardClipPtr, drillPtr, overlayGridSize)
      boardClipPtr = subtracted || null
    }
  }

  let copperPtr = await buildLayerGeometryFromTrees(geos, input.copperTrees, options, {
    overlayGridSize,
    mmPerUnit,
  })
  let soldermaskOpenPtr = await buildLayerGeometryFromTrees(geos, input.soldermaskTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })

  if (options.clipToBoard && boardClipPtr) {
    const boardCloneForCopper = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForCopper) {
      copperPtr = intersection(geos, copperPtr, boardCloneForCopper as unknown as number, overlayGridSize)
    }
    const boardCloneForMask = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForMask) {
      soldermaskOpenPtr = intersection(geos, soldermaskOpenPtr, boardCloneForMask as unknown as number, overlayGridSize)
    }
  }

  const copperAreaUnits2 = computeArea(geos, copperPtr)
  const soldermaskOpenAreaUnits2 = computeArea(geos, soldermaskOpenPtr)

  const exposedPtr = intersection(geos, copperPtr, soldermaskOpenPtr, overlayGridSize)
  copperPtr = null
  soldermaskOpenPtr = null
  const exposedAreaUnits2 = computeArea(geos, exposedPtr)
  const enigAreaMm2 = exposedAreaUnits2 * mmPerUnit * mmPerUnit

  destroyGeom(geos, exposedPtr)
  destroyGeom(geos, boardClipPtr)

  const enigAreaPercent = boardAreaMm2 > 0 ? (enigAreaMm2 / boardAreaMm2) * 100 : 0

  return {
    enigAreaMm2,
    boardAreaMm2,
    enigAreaPercent,
    debug: {
      copperAreaMm2: copperAreaUnits2 * mmPerUnit * mmPerUnit,
      soldermaskOpenAreaMm2: soldermaskOpenAreaUnits2 * mmPerUnit * mmPerUnit,
    },
  }
}
