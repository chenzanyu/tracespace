import type {GeosModule} from './shared'

/**
 * 销毁一个 GEOS geometry 指针。
 *
 * 注意：本库大量函数采用“消费指针”的风格（union/diff/intersection 会在成功后销毁输入几何），
 * 因此如果你需要复用某个几何，请先 `cloneGeom`。
 */
export const destroyGeom = (geos: GeosModule, ptr: number | null) => {
  if (!ptr) return
  try {
    geos.GEOSGeom_destroy(ptr as never)
  } catch {
    // ignore dispose errors
  }
}

export const computeArea = (geos: GeosModule, geomPtr: number | null): number => {
  if (!geomPtr) return 0
  const areaPtr = geos.Module._malloc(8)
  try {
    const ok = geos.GEOSArea(geomPtr as never, areaPtr as never)
    if (!ok) return 0
    return geos.Module.getValue(areaPtr, 'double')
  } finally {
    geos.Module._free(areaPtr)
  }
}

/**
 * 计算线/边界的长度（单位：输入几何的坐标单位）。
 */
export const computeLength = (geos: GeosModule, geomPtr: number | null): number => {
  if (!geomPtr) return 0
  const lengthPtr = geos.Module._malloc(8)
  try {
    const ok = geos.GEOSLength(geomPtr as never, lengthPtr as never)
    if (!ok) return 0
    return geos.Module.getValue(lengthPtr, 'double')
  } finally {
    geos.Module._free(lengthPtr)
  }
}

/**
 * 克隆一个 GEOS geometry 指针（深拷贝）。
 */
export const cloneGeom = (geos: GeosModule, geomPtr: number | null): number | null => {
  if (!geomPtr) return null
  try {
    const clone = geos.GEOSGeom_clone(geomPtr as never)
    return clone || null
  } catch {
    return null
  }
}

/**
 * 尝试对几何执行 `GEOSMakeValid`；若失败则退回到 `cloneGeom`。
 *
 * 用途：在 overlay（union/diff/intersection）失败时，尝试修复自相交等无效几何。
 */
export const makeValidOrClone = (geos: GeosModule, geomPtr: number | null): number | null => {
  if (!geomPtr) return null
  try {
    const fixed = geos.GEOSMakeValid(geomPtr as never)
    if (fixed) return fixed as unknown as number
  } catch {
    // ignore make-valid errors
  }
  return cloneGeom(geos, geomPtr)
}
