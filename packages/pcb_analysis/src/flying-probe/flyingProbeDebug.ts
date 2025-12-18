import {geosGeomToGeojson} from 'geos-wasm/helpers'
import type {Geometry as GeoJsonGeometry} from 'geojson'

import type {EnigAreaOptions, EnigAreaTimingSample, FlyingProbeCountDebugResult, FlyingProbeCountInput} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {boundsFromPolygons, boundsToRectMultiPolygon, normalizeBounds} from '../internal/bounds'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {nowMs} from '../internal/time'
import {cloneGeom, destroyGeom} from '../internal/geos/geom'
import {countPolygonComponents, countPolygonComponentsWhere, intersection, unionTwo} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildBoardGeometry, buildLayerGeometryFromTrees} from '../internal/layerGeometry'

import {buildFlyingProbeMaskOpenUnionClipped, computeFlyingProbeMaskIslandCountForTrees} from './flyingProbeCore'

/**
 * `computeFlyingProbeCount` 的 debug 版本。
 *
 * 额外输出：
 * - `timings`：分步耗时（用于定位性能瓶颈）
 * - `geometries`：关键中间几何的 GeoJSON（用于可视化/排障）
 *
 * 注意：GeoJSON 导出可能很大且较慢，建议只在开发环境使用。
 */
export const computeFlyingProbeCountDebug = async (input: FlyingProbeCountInput): Promise<FlyingProbeCountDebugResult> => {
  const timings: EnigAreaTimingSample[] = []
  const time = (step: string, meta?: Record<string, unknown>) => {
    const start = nowMs()
    return (extra?: Record<string, unknown>) => {
      timings.push({
        step,
        ms: nowMs() - start,
        meta: extra ? {...(meta ?? {}), ...extra} : meta,
      })
    }
  }

  const endGeos = time('geos:init')
  const geos = await getSharedGeos()
  endGeos()

  const options: EnigAreaOptions = {
    ...DEFAULT_ENIG_AREA_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const endBounds = time('board:bounds')
  const boundsSource = normalizeBounds(input.boardBounds) ? 'boardBounds' : 'boardPolygons'
  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon = boundsToRectMultiPolygon(bounds)
  endBounds({hasBounds: Boolean(bounds), source: boundsSource, mmPerUnit})

  const endOutline = time('board:outline')
  const outlinePtr = buildBoardGeometry(geos, input.boardPolygons)
  endOutline({hasGeom: Boolean(outlinePtr)})

  const endClip = time('board:clip')
  const boardClipPtr = boundsPolygon ? buildBoardGeometry(geos, boundsPolygon) : buildBoardGeometry(geos, input.boardPolygons)
  endClip({hasGeom: Boolean(boardClipPtr)})

  const endDrill = time('layer:drill')
  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  const drillPtr =
    drillTrees.length > 0
      ? await buildLayerGeometryFromTrees(geos, drillTrees, options, {
          preferClearWhenDarkEmpty: true,
          overlayGridSize,
          mmPerUnit,
        })
      : null
  const drillTotalCount = countPolygonComponents(geos, drillPtr)
  endDrill({trees: drillTrees.length, hasGeom: Boolean(drillPtr), drillTotalCount})

  const soldermaskTopTrees = Array.isArray(input.soldermaskTopTrees) ? input.soldermaskTopTrees.filter(Boolean) : []
  const soldermaskBottomTrees = Array.isArray(input.soldermaskBottomTrees) ? input.soldermaskBottomTrees.filter(Boolean) : []

  const endTopIslands = time('mask:top:islands')
  const maskTopCount = await computeFlyingProbeMaskIslandCountForTrees({
    geos,
    soldermaskTrees: soldermaskTopTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  endTopIslands({trees: soldermaskTopTrees.length, maskTopCount})

  const endBottomIslands = time('mask:bottom:islands')
  const maskBottomCount = await computeFlyingProbeMaskIslandCountForTrees({
    geos,
    soldermaskTrees: soldermaskBottomTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  endBottomIslands({trees: soldermaskBottomTrees.length, maskBottomCount})

  const endTopUnion = time('mask:top:union')
  const topMaskUnionPtr = await buildFlyingProbeMaskOpenUnionClipped({
    geos,
    soldermaskTrees: soldermaskTopTrees,
    boardClipPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const topMaskExportPtr = cloneGeom(geos, topMaskUnionPtr)
  endTopUnion({hasGeom: Boolean(topMaskUnionPtr)})

  const endBottomUnion = time('mask:bottom:union')
  const bottomMaskUnionPtr = await buildFlyingProbeMaskOpenUnionClipped({
    geos,
    soldermaskTrees: soldermaskBottomTrees,
    boardClipPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const bottomMaskExportPtr = cloneGeom(geos, bottomMaskUnionPtr)
  endBottomUnion({hasGeom: Boolean(bottomMaskUnionPtr)})

  const endMaskUnion = time('mask:union')
  const maskUnionPtr = unionTwo(geos, topMaskUnionPtr, bottomMaskUnionPtr, overlayGridSize)
  endMaskUnion({hasGeom: Boolean(maskUnionPtr)})

  const endDrillCount = time('drill:count')
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
  endDrillCount({drillCount})

  const drillSelectedPtr =
    drillPtr && maskUnionPtr
      ? intersection(geos, cloneGeom(geos, drillPtr), cloneGeom(geos, maskUnionPtr), overlayGridSize)
      : null

  const flyingProbeCount = maskTopCount + maskBottomCount + drillCount

  const endGeojson = time('geojson:export')
  const toGeojson = (geomPtr: number | null): GeoJsonGeometry | null => {
    if (!geomPtr) return null
    try {
      return geosGeomToGeojson(geomPtr as never, geos as never) as GeoJsonGeometry
    } catch {
      return null
    }
  }

  const geometries = {
    boardOutline: toGeojson(outlinePtr),
    boardClip: toGeojson(boardClipPtr),
    drill: toGeojson(drillPtr),
    maskTopOpen: toGeojson(topMaskExportPtr),
    maskBottomOpen: toGeojson(bottomMaskExportPtr),
    maskOpenUnion: toGeojson(maskUnionPtr),
    drillSelected: toGeojson(drillSelectedPtr),
  }
  endGeojson()

  destroyGeom(geos, outlinePtr)
  destroyGeom(geos, boardClipPtr)
  destroyGeom(geos, topMaskExportPtr)
  destroyGeom(geos, bottomMaskExportPtr)
  destroyGeom(geos, drillSelectedPtr)
  destroyGeom(geos, maskUnionPtr)
  destroyGeom(geos, drillPtr)

  return {
    flyingProbeCount,
    mmPerUnit,
    options,
    timings,
    geometries,
    debug: {
      maskTopCount,
      maskBottomCount,
      drillCount,
      drillTotalCount,
    },
  }
}

