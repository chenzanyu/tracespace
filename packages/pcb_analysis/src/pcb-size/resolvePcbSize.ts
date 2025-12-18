import type {Bounds, ResolvePcbSizeInput, ResolvePcbSizeResult} from '../types'

import {boundsContains, boundsFromPolygons, normalizeBounds} from '../internal/bounds'
import {clampNumber} from '../internal/numbers'

/**
 * 解析 PCB 尺寸（优先使用更“可信”的数据源）。
 *
 * 选择策略：
 * 1. `boardBounds`（若提供且合法）
 * 2. `outlineBounds` 与 `boardPolygons` 均存在且 `boardPolygons` 在 outline 内：取二者的“中点 bounds”
 * 3. `outlineBounds`
 * 4. `boardPolygons` 的外接矩形 bounds
 *
 * @returns 若无法得到合法尺寸（<=0 或 NaN）则返回 `null`
 */
export const resolvePcbSize = (input: ResolvePcbSizeInput): ResolvePcbSizeResult | null => {
  const mmPerUnit = clampNumber(input?.mmPerUnit, 1) || 1
  const boardBounds = normalizeBounds(input?.boardBounds)
  const outlineBounds = normalizeBounds(input?.outlineBounds)
  const polygonBounds = boundsFromPolygons(input?.boardPolygons)

  const bounds = (() => {
    if (boardBounds) return {bounds: boardBounds, source: 'boardBounds' as const}
    if (outlineBounds && polygonBounds && boundsContains(outlineBounds, polygonBounds)) {
      const midpoint: Bounds = [
        (outlineBounds[0] + polygonBounds[0]) / 2,
        (outlineBounds[1] + polygonBounds[1]) / 2,
        (outlineBounds[2] + polygonBounds[2]) / 2,
        (outlineBounds[3] + polygonBounds[3]) / 2,
      ]
      if (midpoint[2] > midpoint[0] && midpoint[3] > midpoint[1]) {
        return {bounds: midpoint, source: 'outlineAndPolygonsMidpoint' as const}
      }
    }
    if (outlineBounds) return {bounds: outlineBounds, source: 'outlineBounds' as const}
    if (polygonBounds) return {bounds: polygonBounds, source: 'boardPolygons' as const}
    return null
  })()

  if (!bounds) return null
  const widthUnits = bounds.bounds[2] - bounds.bounds[0]
  const heightUnits = bounds.bounds[3] - bounds.bounds[1]
  const widthMm = widthUnits * mmPerUnit
  const heightMm = heightUnits * mmPerUnit
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) return null
  return {
    ...bounds,
    widthUnits,
    heightUnits,
    widthMm,
    heightMm,
  }
}
