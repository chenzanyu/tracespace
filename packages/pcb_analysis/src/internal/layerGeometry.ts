import {geojsonToGeosGeom} from 'geos-wasm/helpers'
import {CLEAR} from '@tracespace/parser'
import {IMAGE_PATH} from '@tracespace/plotter'
import type {ImageGraphic, ImageTree} from '@tracespace/plotter'

import type {BoardMultiPolygon, EnigAreaOptions} from '../types'

import {graphicToGeoJsonParts, scaleGeoJsonLineStrings, scaleGeoJsonPolygons} from './geojson'
import {clampNumber} from './numbers'
import {cloneGeom, destroyGeom} from './geos/geom'
import type {GeosModule} from './geos/shared'
import {difference, simplifyIfNeeded, unionFeatureCollection, unionTwo} from './geos/ops'
import {scaleFactorForUnitsToTargetMmPerUnit} from './units'

/**
 * 把一个 `ImageTree`（plot 输出）回放成 GEOS polygonal geometry。
 *
 * 关键点：
 * - 遵循 Gerber 的 LPD/LPC 语义：按 `tree.children` 顺序依次叠加（dark=union，clear=difference）
 * - 为提升性能：把“连续同极性”的一段图形先合并成一个 segment，再做一次布尔
 * - `IMAGE_PATH` 会先把中心线按线宽做 buffer 得到 polygon，再参与布尔
 *
 * 注意：返回的是 GEOS geometry 指针；调用方负责在合适时机 `destroyGeom`。
 */
export const buildLayerGeometryFromTree = async (
  geos: GeosModule,
  tree: ImageTree,
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
    overlayGridSize?: number | null
    mmPerUnit?: number
  }
): Promise<number | null> => {
  type SegmentPolarity = 'dark' | 'clear'
  const preferClearWhenDarkEmpty = extra?.preferClearWhenDarkEmpty === true
  const overlayGridSize = extra?.overlayGridSize ?? null
  const treeScale = scaleFactorForUnitsToTargetMmPerUnit(tree?.units, extra?.mmPerUnit ?? 1)

  let result: number | null = null
  let sawDarkGeometry = false
  let clearFallback: number | null = null

  let segmentPolarity: SegmentPolarity | null = null
  let segmentPolygons: Array<{type: string; coordinates: unknown}> = []
  let segmentLinesByRadius = new Map<number, number[][][]>()
  let segmentPolygonCount = 0
  let segmentLineCount = 0
  const segmentFeatureLimit = 20000

  const unionBufferedLines = (byRadius: Map<number, number[][][]>): number | null => {
    let bufferedUnion: number | null = null
    for (const [radius, lines] of byRadius.entries()) {
      if (!lines.length) continue
      const ml = {type: 'MultiLineString', coordinates: lines}
      const linePtr = geojsonToGeosGeom(ml as never, geos as never)
      if (!linePtr) continue
      const buffered = geos.GEOSBuffer(linePtr as never, radius, options.pathBufferQuadrantSegments)
      destroyGeom(geos, linePtr as unknown as number)
      bufferedUnion = unionTwo(geos, bufferedUnion, buffered || null, overlayGridSize)
    }
    return bufferedUnion
  }

  const buildSegmentGeometry = (): number | null => {
    if (segmentPolygons.length === 0 && segmentLinesByRadius.size === 0) return null
    const polygonPtr = unionFeatureCollection(geos, segmentPolygons, overlayGridSize)
    const linePtr = unionBufferedLines(segmentLinesByRadius)
    const combined = unionTwo(geos, polygonPtr, linePtr, overlayGridSize)
    return simplifyIfNeeded(geos, combined, options.polygonSimplifyGridSize)
  }

  const resetSegment = () => {
    segmentPolarity = null
    segmentPolygons = []
    segmentLinesByRadius = new Map<number, number[][][]>()
    segmentPolygonCount = 0
    segmentLineCount = 0
  }

  const flushSegment = () => {
    if (!segmentPolarity) return
    const polarity = segmentPolarity
    const segmentGeom = buildSegmentGeometry()
    resetSegment()
    if (!segmentGeom) return

    if (polarity === 'dark') {
      sawDarkGeometry = true
      if (clearFallback) {
        destroyGeom(geos, clearFallback)
        clearFallback = null
      }
      result = unionTwo(geos, result, segmentGeom, overlayGridSize)
      return
    }

    if (preferClearWhenDarkEmpty && !sawDarkGeometry) {
      const clone = cloneGeom(geos, segmentGeom)
      clearFallback = unionTwo(geos, clearFallback, clone, overlayGridSize)
    }
    result = difference(geos, result, segmentGeom, overlayGridSize)
  }

  const children = Array.isArray(tree?.children) ? (tree.children as ImageGraphic[]) : []
  for (const graphic of children) {
    if (!graphic) continue
    const isClear = (graphic as unknown as {erase?: boolean}).erase === true || graphic.polarity === CLEAR
    const nextPolarity: SegmentPolarity = isClear ? 'clear' : 'dark'
    if (segmentPolarity && nextPolarity !== segmentPolarity) {
      flushSegment()
    }
    if (!segmentPolarity) segmentPolarity = nextPolarity

    const {polygons: rawPolygons, lineStrings: rawLineStrings} = graphicToGeoJsonParts(graphic, {
      arcToleranceRad: options.arcToleranceRad,
    })
    const polygons = scaleGeoJsonPolygons(rawPolygons, treeScale)
    const lineStrings = scaleGeoJsonLineStrings(rawLineStrings, treeScale)
    polygons.forEach(polygon => {
      segmentPolygons.push({type: 'Polygon', coordinates: polygon})
    })
    segmentPolygonCount += polygons.length

    if (graphic.type === IMAGE_PATH) {
      const width = clampNumber((graphic as unknown as {width?: unknown}).width)
      const radiusRaw = (width / 2) * treeScale
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 0
      if (radius > 0 && lineStrings.length) {
        segmentLineCount += lineStrings.length
        const existing = segmentLinesByRadius.get(radius) ?? []
        existing.push(...lineStrings)
        segmentLinesByRadius.set(radius, existing)
      }
    }

    if (segmentPolarity && segmentPolygonCount + segmentLineCount >= segmentFeatureLimit) {
      flushSegment()
      segmentPolarity = nextPolarity
    }
  }

  flushSegment()

  if (preferClearWhenDarkEmpty && !sawDarkGeometry && clearFallback) {
    destroyGeom(geos, result)
    return simplifyIfNeeded(geos, clearFallback, options.polygonSimplifyGridSize)
  }

  destroyGeom(geos, clearFallback)
  return simplifyIfNeeded(geos, result, options.polygonSimplifyGridSize)
}

/**
 * 多个 trees 的 union（会逐个构建并合并）。
 *
 * 用途：同一语义层可能由多个 gerber 文件组成（例如多个铜层或多个阻焊文件）。
 */
export const buildLayerGeometryFromTrees = async (
  geos: GeosModule,
  trees: ImageTree[],
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
    overlayGridSize?: number | null
    mmPerUnit?: number
  }
): Promise<number | null> => {
  const list = Array.isArray(trees) ? trees.filter(Boolean) : []
  const overlayGridSize = extra?.overlayGridSize ?? null
  let result: number | null = null
  for (const tree of list) {
    const geom = await buildLayerGeometryFromTree(geos, tree, options, extra)
    result = unionTwo(geos, result, geom, overlayGridSize)
  }
  return simplifyIfNeeded(geos, result, options.polygonSimplifyGridSize)
}

/**
 * 把 `BoardMultiPolygon`（等价 GeoJSON MultiPolygon.coordinates）转换为 GEOS geometry。
 */
export const buildBoardGeometry = (geos: GeosModule, boardPolygons: BoardMultiPolygon): number | null => {
  if (!Array.isArray(boardPolygons) || boardPolygons.length === 0) return null
  const geom = geojsonToGeosGeom({type: 'MultiPolygon', coordinates: boardPolygons} as never, geos as never)
  return geom || null
}
