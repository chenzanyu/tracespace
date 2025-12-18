import {
  ARC,
  CIRCLE,
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  LAYERED_SHAPE,
  LINE,
  OUTLINE,
  POLYGON,
  RECTANGLE,
} from '@tracespace/plotter'
import type {ImageGraphic, ImagePath, ImageRegion, ImageShape, PathSegment, SimpleShape} from '@tracespace/plotter'

import type {EnigAreaOptions} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from './defaults'
import {clampNumber} from './numbers'

/**
 * 本文件负责把 `@tracespace/plotter` 的图形（ImageGraphic/PathSegment/...）转换为简单的 GeoJSON-ish 结构：
 * - 面：`number[][][][]`（Polygon rings）
 * - 线：`number[][][]`（LineString）
 *
 * 注意：
 * - 所有坐标都仍然是 plot 的单位值（mm 或 inch 的单位值），单位换算在上层通过 scale 完成
 * - ARC 会按 `arcToleranceRad` 离散化成多段 LINE
 */
const closeRing = (ring: number[][]): number[][] => {
  if (!ring.length) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (
    ring.length >= 2 &&
    Array.isArray(first) &&
    Array.isArray(last) &&
    first.length >= 2 &&
    last.length >= 2 &&
    first[0] === last[0] &&
    first[1] === last[1]
  ) {
    return ring
  }
  return [...ring, [...first]]
}

export const positionsClose = (a: number[], b: number[], eps = 1e-7): boolean =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

export const toXY = (pos: unknown): [number, number] => {
  if (!Array.isArray(pos) || pos.length < 2) return [0, 0]
  return [clampNumber(pos[0]), clampNumber(pos[1])]
}

const approximateArcPoints = (
  segment: PathSegment,
  maxSegmentAngle = DEFAULT_ENIG_AREA_OPTIONS.arcToleranceRad
): Array<[number, number]> => {
  if (segment.type !== ARC) return []
  const startAngle = (segment.start as unknown as number[])?.[2]
  const endAngle = (segment.end as unknown as number[])?.[2]
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toXY(segment.start)
  const endRaw = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startRaw, endRaw)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const stepAngle = Number.isFinite(maxSegmentAngle) && maxSegmentAngle > 0 ? maxSegmentAngle : Math.PI / 32
  const steps = Math.max(6, Math.ceil(absSweep / stepAngle))
  const [cx, cy] = toXY((segment as unknown as {center?: unknown}).center)
  const radius = clampNumber((segment as unknown as {radius?: unknown}).radius)
  if (!Number.isFinite(radius) || radius <= 0) return []
  const points: Array<[number, number]> = []
  for (let i = 1; i < steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

const segmentsToSubpaths = (
  segments: PathSegment[],
  {closePath = false, arcToleranceRad = DEFAULT_ENIG_AREA_OPTIONS.arcToleranceRad} = {}
): number[][][] => {
  if (!Array.isArray(segments) || segments.length === 0) return []
  const subpaths: number[][][] = []
  let current: number[][] = []
  let cursor: [number, number] | null = null
  let subpathStart: [number, number] | null = null

  const finalize = () => {
    if (current.length < (closePath ? 3 : 2)) {
      current = []
      return
    }
    if (closePath) current = closeRing(current)
    subpaths.push(current)
    current = []
    cursor = null
    subpathStart = null
  }

  for (const segment of segments) {
    const startRaw = toXY(segment.start)
    const endRaw = toXY(segment.end)
    if (!cursor || !positionsClose(cursor, startRaw)) {
      if (current.length) finalize()
      current = [[startRaw[0], startRaw[1]]]
      subpathStart = startRaw
    }

    if (segment.type === LINE) {
      current.push([endRaw[0], endRaw[1]])
      cursor = endRaw
      continue
    }
    if (segment.type === ARC) {
      approximateArcPoints(segment, arcToleranceRad).forEach(([x, y]) => current.push([x, y]))
      current.push([endRaw[0], endRaw[1]])
      cursor = endRaw
      continue
    }
    current.push([endRaw[0], endRaw[1]])
    cursor = endRaw
  }

  if (current.length) {
    if (closePath && subpathStart && cursor && !positionsClose(cursor, subpathStart)) {
      current.push([subpathStart[0], subpathStart[1]])
    }
    finalize()
  }

  return subpaths
}

const circleRing = (cx: number, cy: number, r: number, segments = 64): number[][] => {
  const steps = Math.max(12, Math.floor(segments))
  const ring: number[][] = []
  for (let i = 0; i < steps; i += 1) {
    const theta = (2 * Math.PI * i) / steps
    ring.push([cx + r * Math.cos(theta), cy + r * Math.sin(theta)])
  }
  return closeRing(ring)
}

const roundedRectRing = (x: number, y: number, w: number, h: number, r: number, cornerSteps = 6): number[][] => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  if (radius <= 0) {
    return closeRing([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ])
  }
  const steps = Math.max(2, Math.floor(cornerSteps))
  const points: number[][] = []
  const addCorner = (cx: number, cy: number, startAngle: number, endAngle: number) => {
    const sweep = endAngle - startAngle
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const a = startAngle + sweep * t
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius])
    }
  }
  addCorner(x + radius, y + radius, Math.PI, Math.PI * 1.5)
  addCorner(x + w - radius, y + radius, Math.PI * 1.5, Math.PI * 2)
  addCorner(x + w - radius, y + h - radius, 0, Math.PI / 2)
  addCorner(x + radius, y + h - radius, Math.PI / 2, Math.PI)
  return closeRing(points)
}

const shapeToPolygons = (
  shape: SimpleShape | null,
  {arcToleranceRad}: Pick<EnigAreaOptions, 'arcToleranceRad'>
): number[][][][] => {
  if (!shape) return []
  const erase = (shape as unknown as {erase?: boolean}).erase === true
  const type = (shape as unknown as {type?: unknown}).type
  if (type === LAYERED_SHAPE) {
    const shapes = Array.isArray((shape as unknown as {shapes?: unknown}).shapes)
      ? ((shape as unknown as {shapes: SimpleShape[]}).shapes)
      : []
    const polygons: number[][][][] = []
    for (const child of shapes) {
      polygons.push(...shapeToPolygons(child, {arcToleranceRad}))
    }
    return polygons
  }
  if (erase) return []

  switch (type) {
    case CIRCLE: {
      const cx = clampNumber((shape as unknown as {cx?: unknown}).cx)
      const cy = clampNumber((shape as unknown as {cy?: unknown}).cy)
      const r = clampNumber((shape as unknown as {r?: unknown}).r)
      if (!Number.isFinite(r) || r <= 0) return []
      return [[circleRing(cx, cy, r)]]
    }
    case RECTANGLE: {
      const x = clampNumber((shape as unknown as {x?: unknown}).x)
      const y = clampNumber((shape as unknown as {y?: unknown}).y)
      const w = clampNumber((shape as unknown as {xSize?: unknown}).xSize)
      const h = clampNumber((shape as unknown as {ySize?: unknown}).ySize)
      const r = clampNumber((shape as unknown as {r?: unknown}).r)
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return []
      return [[roundedRectRing(x, y, w, h, r, 7)]]
    }
    case POLYGON: {
      const points = Array.isArray((shape as unknown as {points?: unknown}).points)
        ? ((shape as unknown as {points: Array<[number, number]>}).points)
        : []
      if (points.length < 3) return []
      return [[closeRing(points.map(([px, py]) => [clampNumber(px), clampNumber(py)]))]]
    }
    case OUTLINE: {
      const segments = Array.isArray((shape as unknown as {segments?: unknown}).segments)
        ? ((shape as unknown as {segments: PathSegment[]}).segments)
        : []
      const rings = segmentsToSubpaths(segments, {closePath: true, arcToleranceRad})
      if (!rings.length) return []
      return rings.map(ring => [ring])
    }
    default:
      return []
  }
}

export const graphicToGeoJsonParts = (
  graphic: ImageGraphic,
  options: Pick<EnigAreaOptions, 'arcToleranceRad'>
): {polygons: number[][][][]; lineStrings: number[][][]} => {
  const polygons: number[][][][] = []
  const lineStrings: number[][][] = []
  if (!graphic) return {polygons, lineStrings}

  if (graphic.type === IMAGE_REGION) {
    const region = graphic as ImageRegion
    const rings = segmentsToSubpaths(region.segments as PathSegment[], {
      closePath: true,
      arcToleranceRad: options.arcToleranceRad,
    })
    rings.forEach(ring => polygons.push([ring]))
    return {polygons, lineStrings}
  }

  if (graphic.type === IMAGE_SHAPE) {
    const entry = graphic as ImageShape
    polygons.push(...shapeToPolygons(entry.shape as SimpleShape, options))
    return {polygons, lineStrings}
  }

  if (graphic.type === IMAGE_PATH) {
    const path = graphic as ImagePath
    const subpaths = segmentsToSubpaths(path.segments as PathSegment[], {
      closePath: false,
      arcToleranceRad: options.arcToleranceRad,
    })
    subpaths.forEach(points => {
      if (points.length >= 2) lineStrings.push(points)
    })
    return {polygons, lineStrings}
  }

  return {polygons, lineStrings}
}

/**
 * 对 polygons 做统一的比例缩放（用于把 tree.units 统一到调用方给定的 `mmPerUnit` 坐标系）。
 */
export const scaleGeoJsonPolygons = (polygons: number[][][][], scale: number): number[][][][] => {
  if (!Number.isFinite(scale) || scale === 1) return polygons
  return polygons.map(polygon => polygon.map(ring => ring.map(([x, y]) => [Number(x) * scale, Number(y) * scale])))
}

/**
 * 对 lineStrings 做统一的比例缩放（用于把 tree.units 统一到调用方给定的 `mmPerUnit` 坐标系）。
 */
export const scaleGeoJsonLineStrings = (lineStrings: number[][][], scale: number): number[][][] => {
  if (!Number.isFinite(scale) || scale === 1) return lineStrings
  return lineStrings.map(line => line.map(([x, y]) => [Number(x) * scale, Number(y) * scale]))
}
