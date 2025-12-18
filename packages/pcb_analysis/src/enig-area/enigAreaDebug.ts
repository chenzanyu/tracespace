import {geosGeomToGeojson} from 'geos-wasm/helpers'
import type {Geometry as GeoJsonGeometry} from 'geojson'

import type {EnigAreaOptions, EnigAreaSideDebugResult, EnigAreaSideInput, EnigAreaTimingSample} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {boundsFromPolygons, boundsToRectMultiPolygon, normalizeBounds} from '../internal/bounds'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {nowMs} from '../internal/time'
import {computeArea, destroyGeom} from '../internal/geos/geom'
import {difference, intersection} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildBoardGeometry, buildLayerGeometryFromTrees} from '../internal/layerGeometry'

/**
 * `computeEnigAreaForSide` 的 debug 版本。
 *
 * 额外输出：
 * - `timings`：分步耗时（用于定位性能瓶颈）
 * - `geometries`：关键中间几何的 GeoJSON（用于可视化/排障）
 *
 * 注意：GeoJSON 导出可能很大且较慢，建议只在开发环境使用。
 */
export const computeEnigAreaForSideDebug = async (input: EnigAreaSideInput): Promise<EnigAreaSideDebugResult> => {
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

  const boardWidth = bounds ? Math.abs(bounds[2] - bounds[0]) : 0
  const boardHeight = bounds ? Math.abs(bounds[3] - bounds[1]) : 0
  const boardAreaUnits2 = Number.isFinite(boardWidth) && Number.isFinite(boardHeight) ? boardWidth * boardHeight : 0
  const boardAreaMm2 = boardAreaUnits2 * mmPerUnit * mmPerUnit
  endBounds({hasBounds: Boolean(bounds), source: boundsSource, mmPerUnit, boardAreaMm2})

  const endOutline = time('board:outline')
  const outlinePtr = buildBoardGeometry(geos, input.boardPolygons)
  const outlineAreaUnits2 = computeArea(geos, outlinePtr)
  const outlineAreaMm2 = outlineAreaUnits2 * mmPerUnit * mmPerUnit
  const outlineExportPtr = outlinePtr ? geos.GEOSGeom_clone(outlinePtr as never) : null
  destroyGeom(geos, outlinePtr)
  endOutline({outlineAreaMm2})

  const endClip = time('board:clip')
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
  const boardClipExportPtr = boardClipPtr ? geos.GEOSGeom_clone(boardClipPtr as never) : null
  endClip({hasClip: Boolean(boardClipPtr), drillTrees: drillTrees.length})

  const endCopper = time('layer:copper')
  let copperPtr = await buildLayerGeometryFromTrees(geos, input.copperTrees, options, {
    overlayGridSize,
    mmPerUnit,
  })
  endCopper({trees: input.copperTrees?.length ?? 0, hasGeom: Boolean(copperPtr)})

  const endMask = time('layer:soldermask')
  let soldermaskOpenPtr = await buildLayerGeometryFromTrees(geos, input.soldermaskTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })
  endMask({trees: input.soldermaskTrees?.length ?? 0, hasGeom: Boolean(soldermaskOpenPtr)})

  if (options.clipToBoard && boardClipPtr) {
    const endCopperClip = time('clip:copper')
    const boardCloneForCopper = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForCopper) {
      copperPtr = intersection(geos, copperPtr, boardCloneForCopper as unknown as number, overlayGridSize)
    }
    endCopperClip({hasGeom: Boolean(copperPtr)})

    const endMaskClip = time('clip:soldermask')
    const boardCloneForMask = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForMask) {
      soldermaskOpenPtr = intersection(geos, soldermaskOpenPtr, boardCloneForMask as unknown as number, overlayGridSize)
    }
    endMaskClip({hasGeom: Boolean(soldermaskOpenPtr)})
  }

  const endAreas = time('area:inputs')
  const copperAreaUnits2 = computeArea(geos, copperPtr)
  const soldermaskOpenAreaUnits2 = computeArea(geos, soldermaskOpenPtr)
  const copperAreaMm2 = copperAreaUnits2 * mmPerUnit * mmPerUnit
  const soldermaskOpenAreaMm2 = soldermaskOpenAreaUnits2 * mmPerUnit * mmPerUnit
  endAreas({copperAreaMm2, soldermaskOpenAreaMm2})

  const copperExportPtr = copperPtr ? geos.GEOSGeom_clone(copperPtr as never) : null
  const soldermaskExportPtr = soldermaskOpenPtr ? geos.GEOSGeom_clone(soldermaskOpenPtr as never) : null

  const endIntersection = time('exposed:intersection')
  const exposedPtr = intersection(geos, copperPtr, soldermaskOpenPtr, overlayGridSize)
  copperPtr = null
  soldermaskOpenPtr = null
  endIntersection({hasGeom: Boolean(exposedPtr)})

  const endExposedArea = time('area:exposed')
  const exposedAreaUnits2 = computeArea(geos, exposedPtr)
  const enigAreaMm2 = exposedAreaUnits2 * mmPerUnit * mmPerUnit
  endExposedArea({enigAreaMm2})

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
    boardOutline: toGeojson(outlineExportPtr as unknown as number | null),
    boardClip: toGeojson(boardClipExportPtr as unknown as number | null),
    copper: toGeojson(copperExportPtr as unknown as number | null),
    soldermaskOpen: toGeojson(soldermaskExportPtr as unknown as number | null),
    exposed: toGeojson(exposedPtr),
  }
  endGeojson()

  destroyGeom(geos, outlineExportPtr as unknown as number | null)
  destroyGeom(geos, boardClipExportPtr as unknown as number | null)
  destroyGeom(geos, copperExportPtr as unknown as number | null)
  destroyGeom(geos, soldermaskExportPtr as unknown as number | null)
  destroyGeom(geos, exposedPtr)
  destroyGeom(geos, boardClipPtr)

  const enigAreaPercent = boardAreaMm2 > 0 ? (enigAreaMm2 / boardAreaMm2) * 100 : 0

  return {
    enigAreaMm2,
    boardAreaMm2,
    enigAreaPercent,
    outlineAreaMm2,
    options,
    mmPerUnit,
    timings,
    geometries,
    debug: {
      copperAreaMm2,
      soldermaskOpenAreaMm2,
    },
  }
}
