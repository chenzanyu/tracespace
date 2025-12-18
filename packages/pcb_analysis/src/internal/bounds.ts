import {ARC, CIRCLE, LAYERED_SHAPE, OUTLINE, POLYGON, RECTANGLE} from '@tracespace/plotter'
import type {PathSegment, Shape, SimpleShape} from '@tracespace/plotter'

import type {BoardMultiPolygon, Bounds} from '../types'

import {toXY} from './geojson'
import {clampNumber} from './numbers'

/**
 * 归一化 bounds 输入，保证：
 * - 有 4 个可解析数值
 * - 输出为 `[minX, minY, maxX, maxY]`
 * - `maxX > minX` 且 `maxY > minY`
 */
export const normalizeBounds = (value: unknown): Bounds | null => {
  if (!Array.isArray(value) || value.length < 4) return null
  const [x1, y1, x2, y2] = value.map(entry => Number(entry))
  if (![x1, y1, x2, y2].every(entry => Number.isFinite(entry))) return null
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const maxX = Math.max(x1, x2)
  const maxY = Math.max(y1, y2)
  if (maxX <= minX || maxY <= minY) return null
  return [minX, minY, maxX, maxY]
}

/**
 * 从 `BoardMultiPolygon` 计算外接矩形 bounds。
 */
export const boundsFromPolygons = (polygons?: BoardMultiPolygon | null): Bounds | null => {
  if (!Array.isArray(polygons) || polygons.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) continue
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2) continue
        const x = Number(point[0])
        const y = Number(point[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    return null
  }
  return [minX, minY, maxX, maxY]
}

export const boundsContains = (outer: Bounds, inner: Bounds): boolean =>
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]

export const mergeBounds = (current: Bounds | null, candidate: Bounds | null): Bounds | null => {
  if (!candidate) return current
  if (!current) return candidate
  return [
    Math.min(current[0], candidate[0]),
    Math.min(current[1], candidate[1]),
    Math.max(current[2], candidate[2]),
    Math.max(current[3], candidate[3]),
  ]
}

const boundsFromPoint = (x: number, y: number): Bounds => [x, y, x, y]

const boundsFromCircle = (cx: number, cy: number, radius: number): Bounds => [
  cx - radius,
  cy - radius,
  cx + radius,
  cy + radius,
]

const boundsFromSegments = (segments: PathSegment[], strokeWidthUnits = 0): Bounds | null => {
  if (!Array.isArray(segments) || segments.length === 0) return null
  let bounds: Bounds | null = null
  for (const segment of segments) {
    if (!segment) continue
    const [sx, sy] = toXY(segment.start)
    const [ex, ey] = toXY(segment.end)
    bounds = mergeBounds(bounds, boundsFromPoint(sx, sy))
    bounds = mergeBounds(bounds, boundsFromPoint(ex, ey))
    if (segment.type === ARC) {
      const [cx, cy] = toXY(segment.center)
      const radius = Math.abs(clampNumber(segment.radius))
      if (Number.isFinite(radius) && radius > 0) {
        bounds = mergeBounds(bounds, boundsFromCircle(cx, cy, radius))
      }
    }
  }
  if (!bounds) return null
  const width = Math.abs(bounds[2] - bounds[0])
  const height = Math.abs(bounds[3] - bounds[1])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const stroke = Math.abs(clampNumber(strokeWidthUnits))
  if (stroke > 0) {
    const inset = stroke / 2
    return [bounds[0] - inset, bounds[1] - inset, bounds[2] + inset, bounds[3] + inset]
  }
  return bounds
}

const boundsFromShape = (shape: Shape | null | undefined): Bounds | null => {
  if (!shape) return null
  switch (shape.type) {
    case CIRCLE: {
      const cx = clampNumber((shape as unknown as {cx?: unknown}).cx)
      const cy = clampNumber((shape as unknown as {cy?: unknown}).cy)
      const r = Math.abs(clampNumber((shape as unknown as {r?: unknown}).r))
      if (!Number.isFinite(r) || r <= 0) return null
      return boundsFromCircle(cx, cy, r)
    }
    case RECTANGLE: {
      const x = clampNumber((shape as unknown as {x?: unknown}).x)
      const y = clampNumber((shape as unknown as {y?: unknown}).y)
      const w = Math.abs(clampNumber((shape as unknown as {xSize?: unknown}).xSize))
      const h = Math.abs(clampNumber((shape as unknown as {ySize?: unknown}).ySize))
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
      return [x, y, x + w, y + h]
    }
    case POLYGON: {
      const points = Array.isArray((shape as unknown as {points?: unknown}).points)
        ? ((shape as unknown as {points: Array<[number, number]>}).points)
        : []
      if (points.length < 3) return null
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const point of points) {
        const x = clampNumber(point?.[0])
        const y = clampNumber(point?.[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY) ||
        maxX <= minX ||
        maxY <= minY
      ) {
        return null
      }
      return [minX, minY, maxX, maxY]
    }
    case OUTLINE: {
      const segments = Array.isArray((shape as unknown as {segments?: unknown}).segments)
        ? ((shape as unknown as {segments: PathSegment[]}).segments)
        : []
      return boundsFromSegments(segments)
    }
    case LAYERED_SHAPE: {
      const shapes = Array.isArray((shape as unknown as {shapes?: unknown}).shapes)
        ? ((shape as unknown as {shapes: SimpleShape[]}).shapes)
        : []
      if (!shapes.length) return null
      let merged: Bounds | null = null
      for (const part of shapes) {
        merged = mergeBounds(merged, boundsFromShape(part))
      }
      return merged
    }
    default:
      return null
  }
}

/**
 * 将 bounds 转为矩形 `BoardMultiPolygon`（可直接喂给 GEOS）。
 *
 * 注意：这里的矩形是“外接矩形”，不是实际轮廓填充面积。
 */
export const boundsToRectMultiPolygon = (bounds: Bounds | null): BoardMultiPolygon | null => {
  if (!bounds || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return null
  return [
    [
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
        [bounds[0], bounds[1]],
      ],
    ],
  ]
}
