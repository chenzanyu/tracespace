import {geojsonToGeosGeom} from 'geos-wasm/helpers'

import {normalizePositiveNumber} from '../numbers'

import {cloneGeom, destroyGeom, makeValidOrClone} from './geom'
import type {GeosModule} from './shared'

/**
 * 重要：本文件的几何布尔操作采用“消费指针”语义。
 *
 * - `unionTwo/difference/intersection` 在成功或进入修复流程后，通常会 `destroyGeom` 掉输入几何
 * - 这样可以显著降低 wasm 内存占用，但也意味着：调用方如果还要复用某个几何，必须先 `clone`
 */
const GEOS_GEOMETRY_TYPE_POLYGON = 3
const GEOS_GEOMETRY_TYPE_MULTIPOLYGON = 6
const GEOS_GEOMETRY_TYPE_GEOMETRY_COLLECTION = 7

const isPolygonalTypeId = (typeId: number): boolean =>
  typeId === GEOS_GEOMETRY_TYPE_POLYGON || typeId === GEOS_GEOMETRY_TYPE_MULTIPOLYGON

export const countPolygonComponents = (geos: GeosModule, geomPtr: number | null): number => {
  if (!geomPtr) return 0
  let empty = 0
  try {
    empty = geos.GEOSisEmpty(geomPtr as never)
  } catch {
    empty = 0
  }
  if (empty === 1) return 0

  const countFor = (ptr: number | null): number => {
    if (!ptr) return 0
    let typeId = -1
    try {
      typeId = geos.GEOSGeomTypeId(ptr as never)
    } catch {
      typeId = -1
    }
    if (typeId === GEOS_GEOMETRY_TYPE_POLYGON) return 1
    if (typeId === GEOS_GEOMETRY_TYPE_MULTIPOLYGON) {
      try {
        const count = geos.GEOSGetNumGeometries(ptr as never)
        return Number.isFinite(count) && count > 0 ? count : 0
      } catch {
        return 0
      }
    }
    if (typeId !== GEOS_GEOMETRY_TYPE_GEOMETRY_COLLECTION) return 0

    let total = 0
    let childCount = 0
    try {
      childCount = geos.GEOSGetNumGeometries(ptr as never)
    } catch {
      childCount = 0
    }
    if (!Number.isFinite(childCount) || childCount <= 0) return 0
    for (let index = 0; index < childCount; index += 1) {
      let childPtr = 0
      try {
        childPtr = geos.GEOSGetGeometryN(ptr as never, index)
      } catch {
        childPtr = 0
      }
      if (!childPtr) continue
      total += countFor(childPtr as unknown as number)
    }
    return total
  }

  return countFor(geomPtr)
}

/**
 * 统计 polygon 组件数量，但只计入满足 predicate 的组件。
 *
 * 用途：例如统计“不与钻孔相交”的阻焊开窗岛数量。
 */
export const countPolygonComponentsWhere = (
  geos: GeosModule,
  geomPtr: number | null,
  predicate: (polygonPtr: number) => boolean
): number => {
  if (!geomPtr) return 0
  let empty = 0
  try {
    empty = geos.GEOSisEmpty(geomPtr as never)
  } catch {
    empty = 0
  }
  if (empty === 1) return 0

  const countFor = (ptr: number | null): number => {
    if (!ptr) return 0
    let typeId = -1
    try {
      typeId = geos.GEOSGeomTypeId(ptr as never)
    } catch {
      typeId = -1
    }
    if (typeId === GEOS_GEOMETRY_TYPE_POLYGON) {
      try {
        return predicate(ptr) ? 1 : 0
      } catch {
        return 0
      }
    }
    if (typeId !== GEOS_GEOMETRY_TYPE_MULTIPOLYGON && typeId !== GEOS_GEOMETRY_TYPE_GEOMETRY_COLLECTION) {
      return 0
    }

    let total = 0
    let childCount = 0
    try {
      childCount = geos.GEOSGetNumGeometries(ptr as never)
    } catch {
      childCount = 0
    }
    if (!Number.isFinite(childCount) || childCount <= 0) return 0
    for (let index = 0; index < childCount; index += 1) {
      let childPtr = 0
      try {
        childPtr = geos.GEOSGetGeometryN(ptr as never, index)
      } catch {
        childPtr = 0
      }
      if (!childPtr) continue
      total += countFor(childPtr as unknown as number)
    }
    return total
  }

  return countFor(geomPtr)
}

const normalizePolygonalGeometry = (geos: GeosModule, geomPtr: number | null, gridSize?: number | null): number | null => {
  if (!geomPtr) return null
  let typeId = -1
  try {
    typeId = geos.GEOSGeomTypeId(geomPtr as never)
  } catch {
    return geomPtr
  }
  if (isPolygonalTypeId(typeId)) return geomPtr
  if (typeId !== GEOS_GEOMETRY_TYPE_GEOMETRY_COLLECTION) {
    destroyGeom(geos, geomPtr)
    return null
  }

  let count = 0
  try {
    count = geos.GEOSGetNumGeometries(geomPtr as never)
  } catch {
    destroyGeom(geos, geomPtr)
    return null
  }
  if (!Number.isFinite(count) || count <= 0) {
    destroyGeom(geos, geomPtr)
    return null
  }

  const grid = normalizePositiveNumber(gridSize)
  let extracted: number | null = null
  for (let index = 0; index < count; index += 1) {
    let childPtr = 0
    try {
      childPtr = geos.GEOSGetGeometryN(geomPtr as never, index)
    } catch {
      childPtr = 0
    }
    if (!childPtr) continue
    let childType = -1
    try {
      childType = geos.GEOSGeomTypeId(childPtr as never)
    } catch {
      childType = -1
    }
    if (!isPolygonalTypeId(childType)) continue
    const clone = cloneGeom(geos, childPtr)
    extracted = unionTwo(geos, extracted, clone, grid)
  }

  destroyGeom(geos, geomPtr)
  return normalizePolygonalGeometry(geos, extracted, grid)
}

/**
 * 对一组 GeoJSON Polygon 进行 union，返回 GEOS geometry 指针。
 *
 * 策略：
 * - 尽量使用 `GEOSUnaryUnion` / `GEOSUnaryUnionPrec`（速度快）
 * - 超过一定数量时使用分治 union（减少一次性 GeometryCollection 的压力）
 * - 失败时尝试 `makeValid` 再 union
 */
export const unionFeatureCollection = (
  geos: GeosModule,
  geometries: Array<{type: string; coordinates: unknown}>,
  gridSize?: number | null
): number | null => {
  if (!geometries.length) return null
  const grid = normalizePositiveNumber(gridSize)

  const maxUnaryUnionGeometries = 2000
  const maxMakeValidUnaryUnionGeometries = 200

  const tryUnaryUnion = (slice: Array<{type: string; coordinates: unknown}>, allowMakeValid: boolean): number | null => {
    if (!slice.length) return null
    if (slice.length === 1) {
      return normalizePolygonalGeometry(geos, geojsonToGeosGeom(slice[0] as never, geos as never) || null, grid)
    }
    const collection = {type: 'GeometryCollection', geometries: slice}
    const collectionPtr = geojsonToGeosGeom(collection as never, geos as never)
    if (!collectionPtr) return null
    let unionPtr: number | null = null
    try {
      unionPtr = geos.GEOSUnaryUnion(collectionPtr as never) || null
    } catch {
      unionPtr = null
    }
    if (!unionPtr && grid) {
      try {
        unionPtr = geos.GEOSUnaryUnionPrec(collectionPtr as never, grid) || null
      } catch {
        unionPtr = null
      }
    }
    if (!unionPtr && allowMakeValid) {
      const fixedCollection = makeValidOrClone(geos, collectionPtr as unknown as number)
      if (fixedCollection) {
        try {
          unionPtr = geos.GEOSUnaryUnion(fixedCollection as never) || null
        } catch {
          unionPtr = null
        }
        if (!unionPtr && grid) {
          try {
            unionPtr = geos.GEOSUnaryUnionPrec(fixedCollection as never, grid) || null
          } catch {
            unionPtr = null
          }
        }
        destroyGeom(geos, fixedCollection)
      }
    }
    destroyGeom(geos, collectionPtr)
    return unionPtr ? normalizePolygonalGeometry(geos, unionPtr, grid) : null
  }

  const unionRange = (start: number, end: number): number | null => {
    const count = end - start
    if (count <= 0) return null
    if (count === 1) {
      let geomPtr = geojsonToGeosGeom(geometries[start] as never, geos as never) || null
      if (!geomPtr) return null
      let valid = 1
      try {
        valid = geos.GEOSisValid(geomPtr as never)
      } catch {
        valid = 1
      }
      if (valid === 0) {
        const fixed = makeValidOrClone(geos, geomPtr)
        destroyGeom(geos, geomPtr)
        geomPtr = fixed
      }
      return normalizePolygonalGeometry(geos, geomPtr, grid)
    }

    if (count <= maxUnaryUnionGeometries) {
      const slice = geometries.slice(start, end)
      const unary = tryUnaryUnion(slice, count <= maxMakeValidUnaryUnionGeometries)
      if (unary) return unary
    }

    const mid = start + Math.floor(count / 2)
    const left = unionRange(start, mid)
    const right = unionRange(mid, end)
    return unionTwo(geos, left, right, grid)
  }

  return unionRange(0, geometries.length)
}

/**
 * 两个几何的 union（会消费输入指针）。
 */
export const unionTwo = (geos: GeosModule, a: number | null, b: number | null, gridSize?: number | null): number | null => {
  if (!a && !b) return null
  if (a && !b) return normalizePolygonalGeometry(geos, a, gridSize)
  if (!a && b) return normalizePolygonalGeometry(geos, b, gridSize)
  const grid = normalizePositiveNumber(gridSize)

  try {
    const result = geos.GEOSUnion(a as never, b as never) || null
    if (result) {
      destroyGeom(geos, a)
      destroyGeom(geos, b)
      return normalizePolygonalGeometry(geos, result, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const result = geos.GEOSUnionPrec(a as never, b as never, grid) || null
      if (result) {
        destroyGeom(geos, a)
        destroyGeom(geos, b)
        return normalizePolygonalGeometry(geos, result, grid)
      }
    } catch {
      // fallthrough to make-valid path
    }
  }

  let aFixed = makeValidOrClone(geos, a)
  let bFixed = makeValidOrClone(geos, b)
  destroyGeom(geos, a)
  destroyGeom(geos, b)
  aFixed = normalizePolygonalGeometry(geos, aFixed, grid)
  bFixed = normalizePolygonalGeometry(geos, bFixed, grid)
  if (!aFixed && !bFixed) return null
  if (aFixed && !bFixed) return normalizePolygonalGeometry(geos, aFixed, grid)
  if (!aFixed && bFixed) return normalizePolygonalGeometry(geos, bFixed, grid)

  try {
    const result = geos.GEOSUnion(aFixed as never, bFixed as never) || null
    if (result) {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const result = geos.GEOSUnionPrec(aFixed as never, bFixed as never, grid) || null
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    } catch {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return null
    }
  }

  destroyGeom(geos, aFixed)
  destroyGeom(geos, bFixed)
  return null
}

/**
 * `subject - clip`（会消费输入指针）。
 */
export const difference = (geos: GeosModule, subject: number | null, clip: number | null, gridSize?: number | null): number | null => {
  if (!subject) {
    destroyGeom(geos, clip)
    return null
  }
  if (!clip) return normalizePolygonalGeometry(geos, subject, gridSize)
  const grid = normalizePositiveNumber(gridSize)

  try {
    const fallback = geos.GEOSDifference(subject as never, clip as never) || null
    if (fallback) {
      destroyGeom(geos, subject)
      destroyGeom(geos, clip)
      return normalizePolygonalGeometry(geos, fallback, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const direct = geos.GEOSDifferencePrec(subject as never, clip as never, grid) || null
      if (direct) {
        destroyGeom(geos, subject)
        destroyGeom(geos, clip)
        return normalizePolygonalGeometry(geos, direct, grid)
      }
    } catch {
      // fallthrough to make-valid path
    }
  }

  let subjectFixed = makeValidOrClone(geos, subject)
  let clipFixed = makeValidOrClone(geos, clip)
  destroyGeom(geos, subject)
  destroyGeom(geos, clip)
  subjectFixed = normalizePolygonalGeometry(geos, subjectFixed, grid)
  clipFixed = normalizePolygonalGeometry(geos, clipFixed, grid)
  if (!subjectFixed) {
    destroyGeom(geos, clipFixed)
    return null
  }
  if (!clipFixed) return normalizePolygonalGeometry(geos, subjectFixed, grid)

  try {
    const result = geos.GEOSDifference(subjectFixed as never, clipFixed as never) || null
    if (result) {
      destroyGeom(geos, subjectFixed)
      destroyGeom(geos, clipFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const result = geos.GEOSDifferencePrec(subjectFixed as never, clipFixed as never, grid) || null
      destroyGeom(geos, subjectFixed)
      destroyGeom(geos, clipFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    } catch {
      destroyGeom(geos, subjectFixed)
      destroyGeom(geos, clipFixed)
      return null
    }
  }

  destroyGeom(geos, subjectFixed)
  destroyGeom(geos, clipFixed)
  return null
}

/**
 * `a ∩ b`（会消费输入指针）。
 */
export const intersection = (geos: GeosModule, a: number | null, b: number | null, gridSize?: number | null): number | null => {
  if (!a || !b) {
    destroyGeom(geos, a)
    destroyGeom(geos, b)
    return null
  }
  const grid = normalizePositiveNumber(gridSize)

  try {
    const fallback = geos.GEOSIntersection(a as never, b as never) || null
    if (fallback) {
      destroyGeom(geos, a)
      destroyGeom(geos, b)
      return normalizePolygonalGeometry(geos, fallback, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const direct = geos.GEOSIntersectionPrec(a as never, b as never, grid) || null
      if (direct) {
        destroyGeom(geos, a)
        destroyGeom(geos, b)
        return normalizePolygonalGeometry(geos, direct, grid)
      }
    } catch {
      // fallthrough to make-valid path
    }
  }

  let aFixed = makeValidOrClone(geos, a)
  let bFixed = makeValidOrClone(geos, b)
  destroyGeom(geos, a)
  destroyGeom(geos, b)
  aFixed = normalizePolygonalGeometry(geos, aFixed, grid)
  bFixed = normalizePolygonalGeometry(geos, bFixed, grid)
  if (!aFixed || !bFixed) {
    destroyGeom(geos, aFixed)
    destroyGeom(geos, bFixed)
    return null
  }

  try {
    const result = geos.GEOSIntersection(aFixed as never, bFixed as never) || null
    if (result) {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    }
  } catch {
    // try precision overlay next
  }

  if (grid) {
    try {
      const result = geos.GEOSIntersectionPrec(aFixed as never, bFixed as never, grid) || null
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return normalizePolygonalGeometry(geos, result, grid)
    } catch {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return null
    }
  }

  destroyGeom(geos, aFixed)
  destroyGeom(geos, bFixed)
  return null
}

/**
 * 可选的网格简化（`GEOSUnaryUnionPrec`）。
 *
 * - 当 `gridSize` 为 `null/<=0` 时直接返回原几何
 * - 否则尝试按网格归一化，提升后续 overlay 的稳定性与性能
 */
export const simplifyIfNeeded = (geos: GeosModule, geomPtr: number | null, gridSize: number | null): number | null => {
  if (!geomPtr) return null
  const grid = Number(gridSize)
  if (!Number.isFinite(grid) || grid <= 0) return geomPtr
  let simplified: number | null = null
  try {
    simplified = geos.GEOSUnaryUnionPrec(geomPtr as never, grid) || null
  } catch {
    simplified = null
  }
  if (simplified) {
    destroyGeom(geos, geomPtr)
    return normalizePolygonalGeometry(geos, simplified, grid)
  }
  return normalizePolygonalGeometry(geos, geomPtr, grid)
}
