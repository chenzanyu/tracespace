import {geojsonToGeosGeom, geosGeomToGeojson} from 'geos-wasm/helpers'
import type {Geometry as GeoJsonGeometry} from 'geojson'
import {CLEAR} from '@tracespace/parser'
import {IMAGE_PATH} from '@tracespace/plotter'
import type {ImageGraphic, ImageTree} from '@tracespace/plotter'

import type {
  EnigAreaOptions,
  EnigAreaTimingSample,
  FlyingProbeCountDebugResult,
  FlyingProbeCountInput,
  FlyingProbeIslandDebug,
} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {boundsFromPolygons, boundsToRectMultiPolygon, normalizeBounds} from '../internal/bounds'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {nowMs} from '../internal/time'
import {cloneGeom, destroyGeom} from '../internal/geos/geom'
import {
  countPolygonComponents,
  countPolygonComponentsWhere,
  difference,
  intersection,
  simplifyIfNeeded,
  unionFeatureCollection,
  unionTwo,
} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildBoardGeometry, buildLayerGeometryFromTrees} from '../internal/layerGeometry'
import {graphicToGeoJsonParts, scaleGeoJsonLineStrings, scaleGeoJsonPolygons} from '../internal/geojson'
import {scaleFactorForUnitsToTargetMmPerUnit} from '../internal/units'

import {buildFlyingProbeMaskOpenUnionClipped} from './flyingProbeCore'

type MaskIslandsDebug = {
  islandsAll: GeoJsonGeometry | null
  islandsExcludedByDrill: GeoJsonGeometry | null
  islands: FlyingProbeIslandDebug[]
  countAll: number
  excludedByDrillCount: number
  countExcludingDrill: number
}

const toGeojson = (geos: Awaited<ReturnType<typeof getSharedGeos>>, geomPtr: number | null): GeoJsonGeometry | null => {
  if (!geomPtr) return null
  try {
    return geosGeomToGeojson(geomPtr as never, geos as never) as GeoJsonGeometry
  } catch {
    return null
  }
}

const multiPolygonOrNull = (polygons: number[][][][]): GeoJsonGeometry | null => {
  if (!polygons.length) return null
  return {type: 'MultiPolygon', coordinates: polygons} as GeoJsonGeometry
}

const pointOnSurfaceOrCentroid = (
  geos: Awaited<ReturnType<typeof getSharedGeos>>,
  geomPtr: number
): {x: number; y: number} | null => {
  const toPoint = (ptr: number | null): {x: number; y: number} | null => {
    if (!ptr) return null
    try {
      const geo = geosGeomToGeojson(ptr as never, geos as never) as GeoJsonGeometry
      if (!geo || geo.type !== 'Point') return null
      const coords = (geo as unknown as {coordinates?: unknown}).coordinates
      if (!Array.isArray(coords) || coords.length < 2) return null
      const x = Number(coords[0])
      const y = Number(coords[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return {x, y}
    } catch {
      return null
    }
  }

  let pointPtr: number | null = null
  try {
    pointPtr = geos.GEOSPointOnSurface(geomPtr as never) || null
  } catch {
    pointPtr = null
  }
  if (pointPtr) {
    try {
      const pt = toPoint(pointPtr)
      if (pt) return pt
    } finally {
      destroyGeom(geos, pointPtr)
    }
  }

  let centroidPtr: number | null = null
  try {
    centroidPtr = geos.GEOSGetCentroid(geomPtr as never) || null
  } catch {
    centroidPtr = null
  }
  if (!centroidPtr) return null
  try {
    return toPoint(centroidPtr)
  } finally {
    destroyGeom(geos, centroidPtr)
  }
}

const collectMaskIslandsDebug = async (params: {
  geos: Awaited<ReturnType<typeof getSharedGeos>>
  soldermaskTrees: ImageTree[]
  boardClipPtr: number | null
  drillPtr: number | null
  options: EnigAreaOptions
  overlayGridSize: number | null
  mmPerUnit: number
}): Promise<MaskIslandsDebug> => {
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

  const allPolygons: number[][][][] = []
  const excludedPolygons: number[][][][] = []
  const islands: FlyingProbeIslandDebug[] = []
  let excludedByDrillCount = 0

  const fallbackLabelPointFromPolygon = (coordinates: number[][][]): {x: number; y: number} => {
    const ring = Array.isArray(coordinates?.[0]) ? coordinates[0] : []
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const entry of ring) {
      if (!Array.isArray(entry) || entry.length < 2) continue
      const x = Number(entry[0])
      const y = Number(entry[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return {x: 0, y: 0}
    }
    return {x: (minX + maxX) / 2, y: (minY + maxY) / 2}
  }

  const trees = Array.isArray(soldermaskTrees) ? soldermaskTrees.filter(Boolean) : []
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

      if (!effectivePtr) continue

      countPolygonComponentsWhere(geos, effectivePtr, polyPtr => {
        let polyGeo: GeoJsonGeometry | null = null
        try {
          polyGeo = geosGeomToGeojson(polyPtr as never, geos as never) as GeoJsonGeometry
        } catch {
          polyGeo = null
        }
        if (!polyGeo || polyGeo.type !== 'Polygon') return false

        const coordinates = (polyGeo as unknown as {coordinates?: unknown}).coordinates as number[][][] | undefined
        if (!coordinates) return false

        allPolygons.push(coordinates as unknown as number[][][])

        let excludedByDrill = false
        if (drillPtr) {
          try {
            excludedByDrill = geos.GEOSIntersects(polyPtr as never, drillPtr as never) === 1
          } catch {
            excludedByDrill = false
          }
          if (excludedByDrill) {
            excludedByDrillCount += 1
            excludedPolygons.push(coordinates as unknown as number[][][])
          }
        }

        const label = pointOnSurfaceOrCentroid(geos, polyPtr) ?? fallbackLabelPointFromPolygon(coordinates)
        islands.push({x: label.x, y: label.y, excludedByDrill})
        return false
      })

      destroyGeom(geos, effectivePtr)
    }
    destroyGeom(geos, clearAfterPtr)
  }

  const countAll = allPolygons.length
  const countExcludingDrill = drillPtr ? countAll - excludedByDrillCount : countAll

  return {
    islandsAll: multiPolygonOrNull(allPolygons),
    islandsExcludedByDrill: multiPolygonOrNull(excludedPolygons),
    islands,
    countAll,
    excludedByDrillCount,
    countExcludingDrill,
  }
}

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
  const topIslands = await collectMaskIslandsDebug({
    geos,
    soldermaskTrees: soldermaskTopTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const maskTopCount = topIslands.countExcludingDrill
  endTopIslands({
    trees: soldermaskTopTrees.length,
    maskTopCount,
    maskTopCountAll: topIslands.countAll,
    maskTopExcludedByDrillCount: topIslands.excludedByDrillCount,
  })

  const endBottomIslands = time('mask:bottom:islands')
  const bottomIslands = await collectMaskIslandsDebug({
    geos,
    soldermaskTrees: soldermaskBottomTrees,
    boardClipPtr,
    drillPtr,
    options,
    overlayGridSize,
    mmPerUnit,
  })
  const maskBottomCount = bottomIslands.countExcludingDrill
  endBottomIslands({
    trees: soldermaskBottomTrees.length,
    maskBottomCount,
    maskBottomCountAll: bottomIslands.countAll,
    maskBottomExcludedByDrillCount: bottomIslands.excludedByDrillCount,
  })

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
  const geometries = {
    boardOutline: toGeojson(geos, outlinePtr),
    boardClip: toGeojson(geos, boardClipPtr),
    drill: toGeojson(geos, drillPtr),
    maskTopOpen: toGeojson(geos, topMaskExportPtr),
    maskBottomOpen: toGeojson(geos, bottomMaskExportPtr),
    maskOpenUnion: toGeojson(geos, maskUnionPtr),
    drillSelected: toGeojson(geos, drillSelectedPtr),
    maskTopIslandsAll: topIslands.islandsAll,
    maskTopIslandsExcludedByDrill: topIslands.islandsExcludedByDrill,
    maskBottomIslandsAll: bottomIslands.islandsAll,
    maskBottomIslandsExcludedByDrill: bottomIslands.islandsExcludedByDrill,
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
    islandLabelPoints: {
      top: topIslands.islands.map(({x, y}) => ({x, y})),
      bottom: bottomIslands.islands.map(({x, y}) => ({x, y})),
    },
    islands: {top: topIslands.islands, bottom: bottomIslands.islands},
    debug: {
      maskTopCount,
      maskBottomCount,
      maskTopCountAll: topIslands.countAll,
      maskBottomCountAll: bottomIslands.countAll,
      maskTopExcludedByDrillCount: topIslands.excludedByDrillCount,
      maskBottomExcludedByDrillCount: bottomIslands.excludedByDrillCount,
      drillCount,
      drillTotalCount,
    },
  }
}
