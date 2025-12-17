import initGeosJs from 'geos-wasm'
import {geojsonToGeosGeom, geosGeomToGeojson} from 'geos-wasm/helpers'
import {CLEAR} from '@tracespace/parser'
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
import type {
  ImageGraphic,
  ImagePath,
  ImageRegion,
  ImageShape,
  ImageTree,
  PathSegment,
  SimpleShape,
} from '@tracespace/plotter'
import type {Geometry as GeoJsonGeometry} from 'geojson'

export type BoardMultiPolygon = number[][][][]

export type Bounds = [number, number, number, number]

export interface ResolvePcbSizeInput {
  mmPerUnit: number
  boardBounds?: Bounds | null
  outlineBounds?: Bounds | null
  boardPolygons?: BoardMultiPolygon | null
}

export interface ResolvePcbSizeResult {
  bounds: Bounds
  widthUnits: number
  heightUnits: number
  widthMm: number
  heightMm: number
  source: 'boardBounds' | 'outlineAndPolygonsMidpoint' | 'outlineBounds' | 'boardPolygons'
}

export interface EnigAreaSideInput {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  boardBounds?: Bounds | null
  copperTrees: ImageTree[]
  soldermaskTrees: ImageTree[]
  drillTrees?: ImageTree[]
  options?: Partial<EnigAreaOptions>
}

export interface EnigAreaOptions {
  arcToleranceRad: number
  pathBufferQuadrantSegments: number
  polygonSimplifyGridSize: number | null
  clipToBoard: boolean
}

export interface EnigAreaSideResult {
  enigAreaMm2: number
  boardAreaMm2: number
  enigAreaPercent: number
  debug: {
    copperAreaMm2: number
    soldermaskOpenAreaMm2: number
  }
}

export interface EnigAreaTimingSample {
  step: string
  ms: number
  meta?: Record<string, unknown>
}

export interface EnigAreaSideDebugResult extends EnigAreaSideResult {
  outlineAreaMm2: number
  options: EnigAreaOptions
  mmPerUnit: number
  timings: EnigAreaTimingSample[]
  geometries: {
    boardOutline: GeoJsonGeometry | null
    boardClip: GeoJsonGeometry | null
    copper: GeoJsonGeometry | null
    soldermaskOpen: GeoJsonGeometry | null
    exposed: GeoJsonGeometry | null
  }
}

export interface HoleWallEnigInput {
  mmPerUnit: number
  drillTrees: ImageTree[]
  copperTopTrees: ImageTree[]
  copperBottomTrees: ImageTree[]
  soldermaskTopTrees: ImageTree[]
  soldermaskBottomTrees: ImageTree[]
  boardThicknessMm?: number
  options?: Partial<EnigAreaOptions>
}

export interface HoleWallEnigResult {
  holeWallEnigAreaMm2: number
  holeWallPerimeterMm: number
  boardThicknessMm: number
}

type GeosModule = Awaited<ReturnType<typeof initGeosJs>>

let sharedGeosPromise: Promise<GeosModule> | null = null

export const getSharedGeos = async (): Promise<GeosModule> => {
  if (!sharedGeosPromise) {
    const maxErrorLogs = 25
    let errorLogCount = 0
    const errorCountsByKey = new Map<string, number>()
    const maxNoticeLogs = 25
    let noticeLogCount = 0
    sharedGeosPromise = initGeosJs({
      errorHandler: message => {
        const normalized = String(message || '')
        const key =
          normalized.startsWith('TopologyException:')
            ? 'TopologyException'
            : normalized.startsWith('IllegalArgumentException: Overlay input is mixed-dimension')
              ? 'Overlay input is mixed-dimension'
              : normalized
        if (key === 'TopologyException' || key === 'Overlay input is mixed-dimension') return
        const perKeyCount = (errorCountsByKey.get(key) ?? 0) + 1
        errorCountsByKey.set(key, perKeyCount)
        if (perKeyCount > 3) return
        errorLogCount += 1
        if (errorLogCount <= maxErrorLogs) {
          console.warn('[pcb-analysis][geos] error', message)
        } else if (errorLogCount === maxErrorLogs + 1) {
          console.warn('[pcb-analysis][geos] further errors suppressed')
        }
      },
      noticeHandler: message => {
        noticeLogCount += 1
        if (noticeLogCount <= maxNoticeLogs) {
          console.info('[pcb-analysis][geos] notice', message)
        } else if (noticeLogCount === maxNoticeLogs + 1) {
          console.info('[pcb-analysis][geos] further notices suppressed')
        }
      },
    })
  }
  return sharedGeosPromise
}

const DEFAULT_OPTIONS: EnigAreaOptions = Object.freeze({
  arcToleranceRad: Math.PI / 32,
  pathBufferQuadrantSegments: 8,
  polygonSimplifyGridSize: null,
  clipToBoard: true,
})

const clampNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const normalizeBounds = (value: unknown): Bounds | null => {
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

const boundsFromPolygons = (polygons?: BoardMultiPolygon | null): Bounds | null => {
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

const boundsContains = (outer: Bounds, inner: Bounds): boolean =>
  outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]

const mergeBounds = (current: Bounds | null, candidate: Bounds | null): Bounds | null => {
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

const boundsFromShape = (shape: SimpleShape | null | undefined): Bounds | null => {
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

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

const normalizePositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

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

const positionsClose = (a: number[], b: number[], eps = 1e-7): boolean =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const toXY = (pos: unknown): [number, number] => {
  if (!Array.isArray(pos) || pos.length < 2) return [0, 0]
  return [clampNumber(pos[0]), clampNumber(pos[1])]
}

const approximateArcPoints = (
  segment: PathSegment,
  maxSegmentAngle = DEFAULT_OPTIONS.arcToleranceRad
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
  {closePath = false, arcToleranceRad = DEFAULT_OPTIONS.arcToleranceRad} = {}
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

const roundedRectRing = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  cornerSteps = 6
): number[][] => {
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
  {
    arcToleranceRad,
  }: Pick<EnigAreaOptions, 'arcToleranceRad'>
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

const graphicToGeoJsonParts = (
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

const destroyGeom = (geos: GeosModule, ptr: number | null) => {
  if (!ptr) return
  try {
    geos.GEOSGeom_destroy(ptr as never)
  } catch {
    // ignore dispose errors
  }
}

const computeArea = (geos: GeosModule, geomPtr: number | null): number => {
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

const computeLength = (geos: GeosModule, geomPtr: number | null): number => {
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

const cloneGeom = (geos: GeosModule, geomPtr: number | null): number | null => {
  if (!geomPtr) return null
  try {
    const clone = geos.GEOSGeom_clone(geomPtr as never)
    return clone || null
  } catch {
    return null
  }
}

const makeValidOrClone = (geos: GeosModule, geomPtr: number | null): number | null => {
  if (!geomPtr) return null
  try {
    const fixed = geos.GEOSMakeValid(geomPtr as never)
    if (fixed) return fixed as unknown as number
  } catch {
    // ignore make-valid errors
  }
  return cloneGeom(geos, geomPtr)
}

const GEOS_GEOMETRY_TYPE_POLYGON = 3
const GEOS_GEOMETRY_TYPE_MULTIPOLYGON = 6
const GEOS_GEOMETRY_TYPE_GEOMETRY_COLLECTION = 7

const isPolygonalTypeId = (typeId: number): boolean =>
  typeId === GEOS_GEOMETRY_TYPE_POLYGON || typeId === GEOS_GEOMETRY_TYPE_MULTIPOLYGON

const normalizePolygonalGeometry = (
  geos: GeosModule,
  geomPtr: number | null,
  gridSize?: number | null
): number | null => {
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

const unionFeatureCollection = (
  geos: GeosModule,
  geometries: Array<{type: string; coordinates: unknown}>,
  gridSize?: number | null
): number | null => {
  if (!geometries.length) return null
  const grid = normalizePositiveNumber(gridSize)

  const maxUnaryUnionGeometries = 2000
  const maxMakeValidUnaryUnionGeometries = 200

  const tryUnaryUnion = (
    slice: Array<{type: string; coordinates: unknown}>,
    allowMakeValid: boolean
  ): number | null => {
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

const unionTwo = (geos: GeosModule, a: number | null, b: number | null, gridSize?: number | null): number | null => {
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

const difference = (geos: GeosModule, subject: number | null, clip: number | null, gridSize?: number | null): number | null => {
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

const intersection = (geos: GeosModule, a: number | null, b: number | null, gridSize?: number | null): number | null => {
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

const simplifyIfNeeded = (
  geos: GeosModule,
  geomPtr: number | null,
  gridSize: number | null
): number | null => {
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

const buildLayerGeometryFromTree = async (
  geos: GeosModule,
  tree: ImageTree,
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
    overlayGridSize?: number | null
  }
): Promise<number | null> => {
  type SegmentPolarity = 'dark' | 'clear'
  const preferClearWhenDarkEmpty = extra?.preferClearWhenDarkEmpty === true
  const overlayGridSize = extra?.overlayGridSize ?? null

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
      destroyGeom(geos, linePtr)
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
    const isClear =
      (graphic as unknown as {erase?: boolean}).erase === true || graphic.polarity === CLEAR
    const nextPolarity: SegmentPolarity = isClear ? 'clear' : 'dark'
    if (segmentPolarity && nextPolarity !== segmentPolarity) {
      flushSegment()
    }
    if (!segmentPolarity) segmentPolarity = nextPolarity

    const {polygons, lineStrings} = graphicToGeoJsonParts(graphic, {
      arcToleranceRad: options.arcToleranceRad,
    })
    polygons.forEach(polygon => {
      segmentPolygons.push({type: 'Polygon', coordinates: polygon})
    })
    segmentPolygonCount += polygons.length

    if (graphic.type === IMAGE_PATH) {
      const width = clampNumber((graphic as unknown as {width?: unknown}).width)
      const radiusRaw = width / 2
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

const buildLayerGeometryFromTrees = async (
  geos: GeosModule,
  trees: ImageTree[],
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
    overlayGridSize?: number | null
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

const buildBoardGeometry = (geos: GeosModule, boardPolygons: BoardMultiPolygon): number | null => {
  if (!Array.isArray(boardPolygons) || boardPolygons.length === 0) return null
  const geom = geojsonToGeosGeom({type: 'MultiPolygon', coordinates: boardPolygons} as never, geos as never)
  return geom || null
}

export const computeEnigAreaForSide = async (
  input: EnigAreaSideInput
): Promise<EnigAreaSideResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon: BoardMultiPolygon | null =
    bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1]
      ? [
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
      : null

  const boardWidth = bounds ? Math.abs(bounds[2] - bounds[0]) : 0
  const boardHeight = bounds ? Math.abs(bounds[3] - bounds[1]) : 0
  const boardAreaUnits2 = Number.isFinite(boardWidth) && Number.isFinite(boardHeight) ? boardWidth * boardHeight : 0
  const boardAreaMm2 = boardAreaUnits2 * mmPerUnit * mmPerUnit

  let boardClipPtr = boundsPolygon ? buildBoardGeometry(geos, boundsPolygon) : buildBoardGeometry(geos, input.boardPolygons)

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  if (boardClipPtr && drillTrees.length) {
    const drillPtr = await buildLayerGeometryFromTrees(geos, drillTrees, options, {
      preferClearWhenDarkEmpty: true,
      overlayGridSize,
    })
    if (drillPtr) {
      const subtracted = difference(geos, boardClipPtr, drillPtr, overlayGridSize)
      boardClipPtr = subtracted || null
    }
  }

  let copperPtr = await buildLayerGeometryFromTrees(geos, input.copperTrees, options, {
    overlayGridSize,
  })
  let soldermaskOpenPtr = await buildLayerGeometryFromTrees(geos, input.soldermaskTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
  })

  if (options.clipToBoard && boardClipPtr) {
    const boardCloneForCopper = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForCopper) {
      copperPtr = intersection(geos, copperPtr, boardCloneForCopper as unknown as number, overlayGridSize)
    }
    const boardCloneForMask = geos.GEOSGeom_clone(boardClipPtr as never)
    if (boardCloneForMask) {
      soldermaskOpenPtr = intersection(geos, soldermaskOpenPtr, boardCloneForMask as unknown as number, overlayGridSize)
    }
  }

  const copperAreaUnits2 = computeArea(geos, copperPtr)
  const soldermaskOpenAreaUnits2 = computeArea(geos, soldermaskOpenPtr)

  const exposedPtr = intersection(geos, copperPtr, soldermaskOpenPtr, overlayGridSize)
  copperPtr = null
  // soldermaskOpenPtr is consumed by intersection()
  const exposedAreaUnits2 = computeArea(geos, exposedPtr)
  const enigAreaMm2 = exposedAreaUnits2 * mmPerUnit * mmPerUnit

  destroyGeom(geos, exposedPtr)
  destroyGeom(geos, boardClipPtr)

  const enigAreaPercent = boardAreaMm2 > 0 ? (enigAreaMm2 / boardAreaMm2) * 100 : 0

  return {
    enigAreaMm2,
    boardAreaMm2,
    enigAreaPercent,
    debug: {
      copperAreaMm2: copperAreaUnits2 * mmPerUnit * mmPerUnit,
      soldermaskOpenAreaMm2: soldermaskOpenAreaUnits2 * mmPerUnit * mmPerUnit,
    },
  }
}

export const computeEnigAreaForSideDebug = async (
  input: EnigAreaSideInput
): Promise<EnigAreaSideDebugResult> => {
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
    ...DEFAULT_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const endBounds = time('board:bounds')
  const boundsSource = normalizeBounds(input.boardBounds) ? 'boardBounds' : 'boardPolygons'
  const bounds = normalizeBounds(input.boardBounds) ?? boundsFromPolygons(input.boardPolygons)
  const boundsPolygon: BoardMultiPolygon | null =
    bounds && bounds[2] > bounds[0] && bounds[3] > bounds[1]
      ? [
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
      : null

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
  })
  endCopper({trees: input.copperTrees?.length ?? 0, hasGeom: Boolean(copperPtr)})

  const endMask = time('layer:soldermask')
  let soldermaskOpenPtr = await buildLayerGeometryFromTrees(geos, input.soldermaskTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
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
    boardOutline: toGeojson(outlineExportPtr),
    boardClip: toGeojson(boardClipExportPtr),
    copper: toGeojson(copperExportPtr),
    soldermaskOpen: toGeojson(soldermaskExportPtr),
    exposed: toGeojson(exposedPtr),
  }
  endGeojson()

  destroyGeom(geos, outlineExportPtr)
  destroyGeom(geos, boardClipExportPtr)
  destroyGeom(geos, copperExportPtr)
  destroyGeom(geos, soldermaskExportPtr)
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

export const computeHoleWallEnigArea = async (input: HoleWallEnigInput): Promise<HoleWallEnigResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const boardThicknessMmRaw = clampNumber(input.boardThicknessMm ?? 1.6, 1.6)
  const boardThicknessMm = Number.isFinite(boardThicknessMmRaw) && boardThicknessMmRaw > 0 ? boardThicknessMmRaw : 1.6
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  const drillPtr = await buildLayerGeometryFromTrees(geos, drillTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
  })

  const copperTopTrees = Array.isArray(input.copperTopTrees) ? input.copperTopTrees.filter(Boolean) : []
  const copperBottomTrees = Array.isArray(input.copperBottomTrees) ? input.copperBottomTrees.filter(Boolean) : []
  const soldermaskTopTrees = Array.isArray(input.soldermaskTopTrees) ? input.soldermaskTopTrees.filter(Boolean) : []
  const soldermaskBottomTrees = Array.isArray(input.soldermaskBottomTrees) ? input.soldermaskBottomTrees.filter(Boolean) : []

  const copperTopPtr = await buildLayerGeometryFromTrees(geos, copperTopTrees, options, {
    overlayGridSize,
  })
  const copperBottomPtr = await buildLayerGeometryFromTrees(geos, copperBottomTrees, options, {
    overlayGridSize,
  })

  let selectedDrillsPtr = intersection(geos, drillPtr, copperTopPtr, overlayGridSize)
  selectedDrillsPtr = intersection(geos, selectedDrillsPtr, copperBottomPtr, overlayGridSize)

  const maskOpenTopPtr = await buildLayerGeometryFromTrees(geos, soldermaskTopTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
  })
  const maskOpenBottomPtr = await buildLayerGeometryFromTrees(geos, soldermaskBottomTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
  })
  const maskOpenAnyPtr = unionTwo(geos, maskOpenTopPtr, maskOpenBottomPtr, overlayGridSize)
  if (maskOpenAnyPtr) {
    selectedDrillsPtr = intersection(geos, selectedDrillsPtr, maskOpenAnyPtr, overlayGridSize)
  }

  const holeWallPerimeterUnits = computeLength(geos, selectedDrillsPtr)
  const holeWallPerimeterMm = holeWallPerimeterUnits * mmPerUnit
  const holeWallEnigAreaMm2 = holeWallPerimeterMm * boardThicknessMm
  destroyGeom(geos, selectedDrillsPtr)

  return {
    holeWallEnigAreaMm2,
    holeWallPerimeterMm,
    boardThicknessMm,
  }
}
