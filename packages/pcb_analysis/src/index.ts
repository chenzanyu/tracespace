import initGeosJs from 'geos-wasm'
import {geojsonToGeosGeom} from 'geos-wasm/helpers'
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

export type BoardMultiPolygon = number[][][][]

export interface EnigAreaSideInput {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  copperTrees: ImageTree[]
  soldermaskTrees: ImageTree[]
  drillTrees?: ImageTree[]
  options?: Partial<EnigAreaOptions>
}

export interface EnigAreaOptions {
  arcToleranceRad: number
  pathBufferQuadrantSegments: number
  polygonSimplifyGridSize: number | null
  soldermaskInterpretation: 'auto' | 'openings' | 'coverage'
  soldermaskCoverageThreshold: number
  clipToBoard: boolean
}

export interface EnigAreaSideResult {
  enigAreaMm2: number
  boardAreaMm2: number
  enigAreaPercent: number
  soldermaskInterpretation: 'openings' | 'coverage'
  debug: {
    copperAreaMm2: number
    soldermaskOpenAreaMm2: number
  }
}

type GeosModule = Awaited<ReturnType<typeof initGeosJs>>

let sharedGeosPromise: Promise<GeosModule> | null = null

export const getSharedGeos = async (): Promise<GeosModule> => {
  if (!sharedGeosPromise) {
    sharedGeosPromise = initGeosJs({
      errorHandler: message => console.warn('[pcb-analysis][geos] error', message),
      noticeHandler: message => console.info('[pcb-analysis][geos] notice', message),
    })
  }
  return sharedGeosPromise
}

const DEFAULT_OPTIONS: EnigAreaOptions = Object.freeze({
  arcToleranceRad: Math.PI / 32,
  pathBufferQuadrantSegments: 8,
  polygonSimplifyGridSize: null,
  soldermaskInterpretation: 'auto',
  soldermaskCoverageThreshold: 0.6,
  clipToBoard: true,
})

const clampNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
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

const unionFeatureCollection = (
  geos: GeosModule,
  geometries: Array<{type: string; coordinates: unknown}>
): number | null => {
  if (!geometries.length) return null
  const fc = {
    type: 'FeatureCollection',
    features: geometries.map(geometry => ({
      type: 'Feature',
      properties: {},
      geometry,
    })),
  }
  const collectionPtr = geojsonToGeosGeom(fc as never, geos as never)
  if (collectionPtr) {
    const unionPtr = geos.GEOSUnaryUnion(collectionPtr as never)
    destroyGeom(geos, collectionPtr)
    if (unionPtr) return unionPtr || null
  }

  let result: number | null = null
  for (const geometry of geometries) {
    const geomPtr = geojsonToGeosGeom(geometry as never, geos as never) || null
    if (!geomPtr) continue
    // unionTwo consumes inputs
    result = unionTwo(geos, result, geomPtr)
  }
  return result
}

const unionTwo = (geos: GeosModule, a: number | null, b: number | null): number | null => {
  if (!a && !b) return null
  if (a && !b) return a
  if (!a && b) return b
  try {
    const result = geos.GEOSUnion(a as never, b as never) || null
    if (result) {
      destroyGeom(geos, a)
      destroyGeom(geos, b)
      return result
    }
  } catch {
    // fallthrough to make-valid path
  }

  const aFixed = makeValidOrClone(geos, a)
  const bFixed = makeValidOrClone(geos, b)
  destroyGeom(geos, a)
  destroyGeom(geos, b)
  if (!aFixed && !bFixed) return null
  if (aFixed && !bFixed) return aFixed
  if (!aFixed && bFixed) return bFixed
  try {
    const result = geos.GEOSUnion(aFixed as never, bFixed as never) || null
    destroyGeom(geos, aFixed)
    destroyGeom(geos, bFixed)
    return result
  } catch {
    destroyGeom(geos, aFixed)
    destroyGeom(geos, bFixed)
    return null
  }
}

const difference = (geos: GeosModule, subject: number | null, clip: number | null): number | null => {
  if (!subject) {
    destroyGeom(geos, clip)
    return null
  }
  if (!clip) return subject
  try {
    const result = geos.GEOSDifference(subject as never, clip as never) || null
    destroyGeom(geos, subject)
    destroyGeom(geos, clip)
    return result
  } catch {
    const subjectFixed = makeValidOrClone(geos, subject)
    const clipFixed = makeValidOrClone(geos, clip)
    destroyGeom(geos, subject)
    destroyGeom(geos, clip)
    if (!subjectFixed) {
      destroyGeom(geos, clipFixed)
      return null
    }
    if (!clipFixed) return subjectFixed
    try {
      const result = geos.GEOSDifference(subjectFixed as never, clipFixed as never) || null
      destroyGeom(geos, subjectFixed)
      destroyGeom(geos, clipFixed)
      return result
    } catch {
      destroyGeom(geos, subjectFixed)
      destroyGeom(geos, clipFixed)
      return null
    }
  }
}

const intersection = (geos: GeosModule, a: number | null, b: number | null): number | null => {
  if (!a || !b) {
    destroyGeom(geos, a)
    destroyGeom(geos, b)
    return null
  }
  try {
    const result = geos.GEOSIntersection(a as never, b as never) || null
    destroyGeom(geos, a)
    destroyGeom(geos, b)
    return result
  } catch {
    const aFixed = makeValidOrClone(geos, a)
    const bFixed = makeValidOrClone(geos, b)
    destroyGeom(geos, a)
    destroyGeom(geos, b)
    if (!aFixed || !bFixed) {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return null
    }
    try {
      const result = geos.GEOSIntersection(aFixed as never, bFixed as never) || null
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return result
    } catch {
      destroyGeom(geos, aFixed)
      destroyGeom(geos, bFixed)
      return null
    }
  }
}

const simplifyIfNeeded = (
  geos: GeosModule,
  geomPtr: number | null,
  gridSize: number | null
): number | null => {
  if (!geomPtr) return null
  const grid = Number(gridSize)
  if (!Number.isFinite(grid) || grid <= 0) return geomPtr
  const simplified = geos.GEOSUnaryUnionPrec(geomPtr as never, grid)
  destroyGeom(geos, geomPtr)
  return simplified || null
}

const buildLayerGeometryFromTree = async (
  geos: GeosModule,
  tree: ImageTree,
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
  }
): Promise<number | null> => {
  const darkPolygons: Array<{type: 'Polygon'; coordinates: number[][][]}> = []
  const clearPolygons: Array<{type: 'Polygon'; coordinates: number[][][]}> = []
  const darkLinesByRadius = new Map<number, number[][][]>()
  const clearLinesByRadius = new Map<number, number[][][]>()
  const preferClearWhenDarkEmpty = extra?.preferClearWhenDarkEmpty === true

  const children = Array.isArray(tree?.children) ? (tree.children as ImageGraphic[]) : []
  for (const graphic of children) {
    if (!graphic) continue
    const isClear = (graphic as unknown as {erase?: boolean}).erase === true || graphic.polarity === CLEAR
    const {polygons, lineStrings} = graphicToGeoJsonParts(graphic, {arcToleranceRad: options.arcToleranceRad})
    const polygonTargets = isClear ? clearPolygons : darkPolygons
    polygons.forEach(polygon => {
      polygonTargets.push({type: 'Polygon', coordinates: polygon})
    })

    if (graphic.type === IMAGE_PATH) {
      const width = clampNumber((graphic as unknown as {width?: unknown}).width)
      const radiusRaw = width / 2
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 0
      if (radius > 0 && lineStrings.length) {
        const map = isClear ? clearLinesByRadius : darkLinesByRadius
        const existing = map.get(radius) ?? []
        existing.push(...lineStrings)
        map.set(radius, existing)
      }
    }
  }

  const unionBufferedLines = (byRadius: Map<number, number[][][]>): number | null => {
    let result: number | null = null
    for (const [radius, lines] of byRadius.entries()) {
      if (!lines.length) continue
      const ml = {type: 'MultiLineString', coordinates: lines}
      const linePtr = geojsonToGeosGeom(ml as never, geos as never)
      if (!linePtr) continue
      const buffered = geos.GEOSBuffer(linePtr as never, radius, options.pathBufferQuadrantSegments)
      destroyGeom(geos, linePtr)
      result = unionTwo(geos, result, buffered || null)
    }
    return result
  }

  const darkUnion = simplifyIfNeeded(
    geos,
    unionTwo(geos, unionFeatureCollection(geos, darkPolygons), unionBufferedLines(darkLinesByRadius)),
    options.polygonSimplifyGridSize
  )
  const clearUnion = simplifyIfNeeded(
    geos,
    unionTwo(geos, unionFeatureCollection(geos, clearPolygons), unionBufferedLines(clearLinesByRadius)),
    options.polygonSimplifyGridSize
  )

  if (!darkUnion) {
    if (preferClearWhenDarkEmpty) return clearUnion
    destroyGeom(geos, clearUnion)
    return null
  }
  if (!clearUnion) return darkUnion
  return difference(geos, darkUnion, clearUnion)
}

const buildLayerGeometryFromTrees = async (
  geos: GeosModule,
  trees: ImageTree[],
  options: EnigAreaOptions,
  extra?: {
    preferClearWhenDarkEmpty?: boolean
  }
): Promise<number | null> => {
  const list = Array.isArray(trees) ? trees.filter(Boolean) : []
  let result: number | null = null
  for (const tree of list) {
    const geom = await buildLayerGeometryFromTree(geos, tree, options, extra)
    result = unionTwo(geos, result, geom)
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
  let boardPtr = buildBoardGeometry(geos, input.boardPolygons)
  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  if (boardPtr && drillTrees.length) {
    const drillPtr = await buildLayerGeometryFromTrees(geos, drillTrees, options, {
      preferClearWhenDarkEmpty: true,
    })
    if (drillPtr) {
      const boardClone = geos.GEOSGeom_clone(boardPtr as never)
      if (boardClone) {
        const subtracted = difference(geos, boardClone as unknown as number, drillPtr)
        if (subtracted) {
          destroyGeom(geos, boardPtr)
          boardPtr = subtracted
        }
      } else {
        destroyGeom(geos, drillPtr)
      }
    }
  }
  const boardAreaUnits2 = computeArea(geos, boardPtr)
  const boardAreaMm2 = boardAreaUnits2 * mmPerUnit * mmPerUnit

  let copperPtr = await buildLayerGeometryFromTrees(geos, input.copperTrees, options)
  let soldermaskRawPtr = await buildLayerGeometryFromTrees(geos, input.soldermaskTrees, options, {
    preferClearWhenDarkEmpty: true,
  })

  const interpretMask = (): {openPtr: number | null; mode: 'openings' | 'coverage'} => {
    if (!soldermaskRawPtr) return {openPtr: null, mode: 'openings'}
    const requested = options.soldermaskInterpretation
    if (requested === 'openings') return {openPtr: soldermaskRawPtr, mode: 'openings'}
    if (requested === 'coverage') {
      if (!boardPtr) return {openPtr: soldermaskRawPtr, mode: 'openings'}
      const boardClone = geos.GEOSGeom_clone(boardPtr as never)
      if (!boardClone) {
        return {openPtr: soldermaskRawPtr, mode: 'openings'}
      }
      const openingsPtr = geos.GEOSDifference(boardClone as never, soldermaskRawPtr as never) || null
      destroyGeom(geos, boardClone || null)
      destroyGeom(geos, soldermaskRawPtr)
      soldermaskRawPtr = null
      return {openPtr: openingsPtr, mode: 'coverage'}
    }
    if (!boardPtr) return {openPtr: soldermaskRawPtr, mode: 'openings'}
    const rawArea = computeArea(geos, soldermaskRawPtr)
    const threshold = Number.isFinite(options.soldermaskCoverageThreshold)
      ? Math.max(0, Math.min(1, options.soldermaskCoverageThreshold))
      : DEFAULT_OPTIONS.soldermaskCoverageThreshold
    if (boardAreaUnits2 > 0 && rawArea / boardAreaUnits2 >= threshold) {
      const boardClone = geos.GEOSGeom_clone(boardPtr as never)
      if (!boardClone) return {openPtr: soldermaskRawPtr, mode: 'openings'}
      const openingsPtr = geos.GEOSDifference(boardClone as never, soldermaskRawPtr as never) || null
      destroyGeom(geos, boardClone || null)
      destroyGeom(geos, soldermaskRawPtr)
      soldermaskRawPtr = null
      return {openPtr: openingsPtr, mode: 'coverage'}
    }
    return {openPtr: soldermaskRawPtr, mode: 'openings'}
  }

  const {openPtr: maskOpenPtr, mode: maskMode} = interpretMask()
  soldermaskRawPtr = null

  let clippedMaskOpenPtr = maskOpenPtr

  if (options.clipToBoard && boardPtr) {
    const boardCloneForCopper = geos.GEOSGeom_clone(boardPtr as never)
    if (boardCloneForCopper) {
      copperPtr = intersection(geos, copperPtr, boardCloneForCopper as unknown as number)
    }
    const boardCloneForMask = geos.GEOSGeom_clone(boardPtr as never)
    if (boardCloneForMask) {
      clippedMaskOpenPtr = intersection(geos, clippedMaskOpenPtr, boardCloneForMask as unknown as number)
    }
  }

  const copperAreaUnits2 = computeArea(geos, copperPtr)
  const soldermaskOpenAreaUnits2 = computeArea(geos, clippedMaskOpenPtr)

  const exposedPtr = intersection(geos, copperPtr, clippedMaskOpenPtr)
  copperPtr = null
  // clippedMaskOpenPtr is consumed by intersection()
  const exposedAreaUnits2 = computeArea(geos, exposedPtr)
  const enigAreaMm2 = exposedAreaUnits2 * mmPerUnit * mmPerUnit

  destroyGeom(geos, exposedPtr)
  destroyGeom(geos, boardPtr)

  const enigAreaPercent = boardAreaMm2 > 0 ? (enigAreaMm2 / boardAreaMm2) * 100 : 0

  return {
    enigAreaMm2,
    boardAreaMm2,
    enigAreaPercent,
    soldermaskInterpretation: maskMode,
    debug: {
      copperAreaMm2: copperAreaUnits2 * mmPerUnit * mmPerUnit,
      soldermaskOpenAreaMm2: soldermaskOpenAreaUnits2 * mmPerUnit * mmPerUnit,
    },
  }
}
