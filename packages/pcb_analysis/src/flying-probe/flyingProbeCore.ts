import {geojsonToGeosGeom} from 'geos-wasm/helpers'
import {CLEAR} from '@tracespace/parser'
import {IMAGE_PATH} from '@tracespace/plotter'
import type {ImageGraphic, ImageTree} from '@tracespace/plotter'

import type {EnigAreaOptions} from '../types'

import {graphicToGeoJsonParts, scaleGeoJsonLineStrings, scaleGeoJsonPolygons} from '../internal/geojson'
import {clampNumber} from '../internal/numbers'
import {destroyGeom} from '../internal/geos/geom'
import {
  countPolygonComponents,
  countPolygonComponentsWhere,
  difference,
  intersection,
  simplifyIfNeeded,
  unionFeatureCollection,
  unionTwo,
} from '../internal/geos/ops'
import type {GeosModule} from '../internal/geos/shared'
import {buildLayerGeometryFromTrees} from '../internal/layerGeometry'
import {scaleFactorForUnitsToTargetMmPerUnit} from '../internal/units'

/**
 * 计算“阻焊开窗点数（单面）”——实现层面的定义是“阻焊开窗岛数量”。
 *
 * 规则（与 README 保持一致）：
 * - 以每个 dark `ImageGraphic` 为独立统计源，不做 dark↔dark 并集
 * - 对该图形应用“后续 clear 的扣除”（按 draw order 回放）
 * - 若 `clipToBoard=true`：再裁剪到板框 ViewBox（外接矩形或轮廓多边形）
 * - 若提供 `drillPtr`：与任意钻孔相交/贴边/重叠的岛不计入
 *
 * 注意：返回的是“岛数量”，不是面积/长度。
 */
export const computeFlyingProbeMaskIslandCountForTrees = async (params: {
  geos: GeosModule
  soldermaskTrees: ImageTree[]
  boardClipPtr: number | null
  drillPtr: number | null
  options: EnigAreaOptions
  overlayGridSize: number | null
  mmPerUnit: number
}): Promise<number> => {
  const {geos, soldermaskTrees, boardClipPtr, drillPtr, options, overlayGridSize, mmPerUnit} = params

  const buildGraphicGeometry = (graphic: ImageGraphic, scale: number): number | null => {
    const {polygons: rawPolygons, lineStrings: rawLineStrings} = graphicToGeoJsonParts(graphic, {
      arcToleranceRad: options.arcToleranceRad,
    })
    const polygons = scaleGeoJsonPolygons(rawPolygons, scale)
    const lineStrings = scaleGeoJsonLineStrings(rawLineStrings, scale)
    const polygonFeatures = polygons.map(polygon => ({type: 'Polygon', coordinates: polygon}))
    const polygonPtr = unionFeatureCollection(geos, polygonFeatures, overlayGridSize)

    let bufferedPtr: number | null = null
    if (graphic.type === IMAGE_PATH) {
      const width = clampNumber((graphic as unknown as {width?: unknown}).width)
      const radiusRaw = (width / 2) * scale
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 0
      if (radius > 0 && lineStrings.length) {
        const ml = {type: 'MultiLineString', coordinates: lineStrings}
        const linePtr = geojsonToGeosGeom(ml as never, geos as never)
        if (linePtr) {
          bufferedPtr = geos.GEOSBuffer(linePtr as never, radius, options.pathBufferQuadrantSegments) || null
          destroyGeom(geos, linePtr as unknown as number)
        }
      }
    }

    const combined = unionTwo(geos, polygonPtr, bufferedPtr, overlayGridSize)
    return simplifyIfNeeded(geos, combined, options.polygonSimplifyGridSize)
  }

  const countMaskIslands = (geomPtr: number | null): number => {
    if (!geomPtr) return 0
    if (!drillPtr) return countPolygonComponents(geos, geomPtr)
    return countPolygonComponentsWhere(geos, geomPtr, polyPtr => {
      try {
        return geos.GEOSIntersects(polyPtr as never, drillPtr as never) !== 1
      } catch {
        return true
      }
    })
  }

  const trees = Array.isArray(soldermaskTrees) ? soldermaskTrees.filter(Boolean) : []
  let flyingProbeCount = 0
  for (const tree of trees) {
    const treeScale = scaleFactorForUnitsToTargetMmPerUnit(tree?.units, mmPerUnit)
    const children = Array.isArray(tree?.children) ? (tree.children as ImageGraphic[]) : []
    let clearAfterPtr: number | null = null
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const graphic = children[index]
      if (!graphic) continue

      const isClear = (graphic as unknown as {erase?: boolean}).erase === true || graphic.polarity === CLEAR
      const geomPtr = buildGraphicGeometry(graphic, treeScale)
      if (!geomPtr) continue

      if (isClear) {
        clearAfterPtr = unionTwo(geos, clearAfterPtr, geomPtr, overlayGridSize)
        continue
      }

      let effectivePtr: number | null = geomPtr
      if (clearAfterPtr) {
        const clearClone = geos.GEOSGeom_clone(clearAfterPtr as never) || null
        if (clearClone) {
          effectivePtr = difference(geos, effectivePtr, clearClone as unknown as number, overlayGridSize)
        }
      }

      if (options.clipToBoard && boardClipPtr) {
        const boardClone = geos.GEOSGeom_clone(boardClipPtr as never) || null
        if (boardClone) {
          effectivePtr = intersection(geos, effectivePtr, boardClone as unknown as number, overlayGridSize)
        }
      }

      flyingProbeCount += countMaskIslands(effectivePtr)
      destroyGeom(geos, effectivePtr)
    }
    destroyGeom(geos, clearAfterPtr)
  }

  return flyingProbeCount
}

/**
 * 构建“阻焊开窗并集”（用于 drillCount 去重与可视化），并按需裁剪到板框 ViewBox。
 */
export const buildFlyingProbeMaskOpenUnionClipped = async (params: {
  geos: GeosModule
  soldermaskTrees: ImageTree[]
  boardClipPtr: number | null
  options: EnigAreaOptions
  overlayGridSize: number | null
  mmPerUnit: number
}): Promise<number | null> => {
  const {geos, soldermaskTrees, boardClipPtr, options, overlayGridSize, mmPerUnit} = params
  const trees = Array.isArray(soldermaskTrees) ? soldermaskTrees.filter(Boolean) : []
  if (!trees.length) return null

  let maskPtr = await buildLayerGeometryFromTrees(geos, trees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })

  if (options.clipToBoard && boardClipPtr) {
    const boardClone = geos.GEOSGeom_clone(boardClipPtr as never) || null
    if (boardClone) {
      maskPtr = intersection(geos, maskPtr, boardClone as unknown as number, overlayGridSize)
    }
  }

  return maskPtr
}

