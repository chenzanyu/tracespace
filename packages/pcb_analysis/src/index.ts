import {CLEAR, DARK, parse} from '@tracespace/parser'
import type {
  GerberTree,
  Polarity,
  UnitsType,
} from '@tracespace/parser'
import {
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  LINE,
  ARC,
  POLYGON,
  RECTANGLE,
  CIRCLE,
  OUTLINE,
  LAYERED_SHAPE,
  positionsEqual,
  plot,
} from '@tracespace/plotter'
import type {
  ArcPosition,
  ImageGraphic,
  ImageGraphicBase,
  ImagePath,
  ImageRegion,
  ImageShape,
  ImageTree,
  LayeredShape,
  PathSegment,
  Position,
  SimpleShape,
  RectangleShape,
} from '@tracespace/plotter'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope'
import Geometry from 'jsts/org/locationtech/jts/geom/Geometry'
import GeometryCollection from 'jsts/org/locationtech/jts/geom/GeometryCollection'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory'
import LineString from 'jsts/org/locationtech/jts/geom/LineString'
import Polygon from 'jsts/org/locationtech/jts/geom/Polygon'
import PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel'
import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree'
import SnapIfNeededOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapIfNeededOverlayOp'
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp'
import IndexedFacetDistance from 'jsts/org/locationtech/jts/operation/distance/IndexedFacetDistance'
import GeometryPrecisionReducer from 'jsts/org/locationtech/jts/precision/GeometryPrecisionReducer'
import 'jsts/org/locationtech/jts/monkey'

const DEFAULT_PRECISION_SCALE = 1_000_000
const DEFAULT_STROKE_SEGMENTS = 8
const DEFAULT_ARC_SEGMENT_ANGLE = Math.PI / 64
const MIN_ARC_SEGMENT_ANGLE = Math.PI / 360

const PI = Math.PI
const HALF_PI = PI / 2
const THREE_HALF_PI = 3 * HALF_PI
const TWO_PI = 2 * PI
const EPSILON = 1e-9
const MILS_PER_MM = 39.37007874015748
const PRECISION_REDUCER_SCALE = 1e5
const GRID_TARGET_BUCKET_SIZE = 120
const GRID_MIN_GEOMETRIES_FOR_GRID = 80
const GRID_MAX_GRID_DIVISIONS = 32
const GRID_MIN_CELL_SIZE = 1e-6
const GRID_MIN_BUCKET_TARGET = 24
const GRID_MAX_RECURSION_DEPTH = 4

type PerformanceLike = {now: () => number}


function getTimestamp(): number {
  const perf =
    typeof globalThis !== 'undefined'
      ? (globalThis as {performance?: PerformanceLike}).performance
      : undefined

  return typeof perf?.now === 'function' ? perf.now() : Date.now()
}

export interface GeometryConversionOptions {
  /**
   * Scale factor applied to the {@link PrecisionModel}.
   * Values >= 1 keep sub-micron accuracy for mm units.
   */
  precisionScale?: number
  /**
   * Number of segments per quarter circle when buffering strokes.
   */
  strokeQuadrantSegments?: number
  /**
   * Maximum angle (in radians) between adjacent arc interpolation points.
   */
  maxArcSegmentAngle?: number
}

export interface GeometryGraphicEntry {
  id: string
  index: number
  geometry: Geometry
  source: ImageGraphic
  polarity: Polarity
  dcode?: string
}

export interface ImageGeometryResult {
  units: UnitsType | undefined
  mmPerUnit: number
  geometryFactory: GeometryFactory
  graphics: GeometryGraphicEntry[]
  collection: GeometryCollection
  composite: Geometry
  components: Geometry[]
  spacingIndex: GeometrySpacingIndex | null
  performance?: GeometryPerformanceProfile
}

export interface GerberConversionResult extends ImageGeometryResult {
  parseTree: GerberTree
  image: ImageTree
}

export interface MinimumSpacingMeasurement {
  spacingUnits: number
  spacingMm: number
  spacingMil: number
  location: Position | null
  violations: Geometry | null
  endpoints: [Position, Position] | null
  metrics?: MinimumSpacingMetrics
}

export interface SpacingRuleResult {
  spacingUnits: number
  spacingMm: number
  spacingMil: number
  violations: Geometry
  location: Position | null
  hasViolations: boolean
  metrics?: SpacingRuleMetrics
}

export interface GeometryPerformanceProfile {
  parseMs?: number
  plotMs?: number
  convertMs?: number
  convertBreakdown?: ConvertPerformanceBreakdown
  totalMs?: number
}

export interface ConvertPerformanceBreakdown {
  convertGraphicMs: number
  precisionReductionMs: number
  booleanOpsMs: number
  runCount: number
  averageRunSize: number
}

export interface MinimumSpacingMetrics {
  durationMs: number
  candidatePairs: number
  evaluatedPairs: number
  componentsIndexed: number
}

export interface SpacingRuleMetrics {
  durationMs: number
  candidatePairs?: number
  evaluatedPairs?: number
  overlappingPairs?: number
}

export interface GeometrySpacingIndex {
  readonly componentsIndexed: number
}

export function convertImageTree(
  image: ImageTree,
  options?: GeometryConversionOptions
): ImageGeometryResult {
  const conversionStart = getTimestamp()
  const normalized = normalizeOptions(options)
  const geometryFactory = new GeometryFactory(
    new PrecisionModel(normalized.precisionScale)
  )
  const context: ConversionContext = {geometryFactory, ...normalized}
  const graphics: GeometryGraphicEntry[] = []
  let compositeGeometry: Geometry | null = null
  const convertBreakdown: ConvertPerformanceBreakdown = {
    convertGraphicMs: 0,
    precisionReductionMs: 0,
    booleanOpsMs: 0,
    runCount: 0,
    averageRunSize: 0,
  }
  let accumulatedRunSize = 0
  let currentRunPolarity: Polarity | null = null
  let currentRun: Geometry[] = []

  const flushRun = (): void => {
    if (currentRun.length === 0 || currentRunPolarity === null) return

    const booleanStart = getTimestamp()
    const mergedRun = mergeRunGeometries(currentRun)
    convertBreakdown.booleanOpsMs += getTimestamp() - booleanStart
    convertBreakdown.runCount += 1
    accumulatedRunSize += currentRun.length
    currentRun = []

    if (!mergedRun || mergedRun.isEmpty()) {
      return
    }

    if (currentRunPolarity === CLEAR) {
      if (compositeGeometry !== null && !compositeGeometry.isEmpty()) {
        compositeGeometry = safeDifference(compositeGeometry, mergedRun)
      }
    } else {
      compositeGeometry =
        compositeGeometry === null
          ? mergedRun
          : safeUnion(compositeGeometry, mergedRun)
    }
  }

  image.children.forEach((graphic, index) => {
    const convertStart = getTimestamp()
    const geometry = convertGraphic(graphic, context)
    convertBreakdown.convertGraphicMs += getTimestamp() - convertStart
    if (geometry === null || geometry.isEmpty()) return

    const precisionStart = getTimestamp()
    const preciseGeometry = reducePrecision(
      cleanGeometry(geometry),
      PRECISION_REDUCER_SCALE
    )
    if (preciseGeometry.isEmpty()) return
    convertBreakdown.precisionReductionMs += getTimestamp() - precisionStart
    if (preciseGeometry.isEmpty()) return

    const polarity = getGraphicPolarity(graphic)
    const entry: GeometryGraphicEntry = {
      id: `${graphic.type}-${index}`,
      index,
      geometry: preciseGeometry,
      polarity,
      source: graphic,
      dcode: graphic.dcode,
    }

    graphics.push(entry)
    if (currentRunPolarity === null || currentRunPolarity !== polarity) {
      flushRun()
      currentRunPolarity = polarity
    }

    currentRun.push(preciseGeometry)
  })

  flushRun()

  if (compositeGeometry === null) {
    compositeGeometry = geometryFactory.createGeometryCollection([])
  }

  const componentGeometries = geometryToComponentPolygons(compositeGeometry)
  const spacingIndex = createGeometrySpacingIndex(componentGeometries)

  const collection = geometryFactory.createGeometryCollection(
    graphics.map(entry => entry.geometry)
  )
  const durationMs = getTimestamp() - conversionStart
  convertBreakdown.averageRunSize =
    convertBreakdown.runCount > 0
      ? accumulatedRunSize / convertBreakdown.runCount
      : 0

  return {
    units: image.units,
    mmPerUnit: unitsToMillimeters(image.units),
    geometryFactory,
    graphics,
    collection,
    composite: compositeGeometry,
    components: componentGeometries,
    spacingIndex,
    performance: {convertMs: durationMs, convertBreakdown},
  }
}

export function gerberToImageGeometries(
  contents: string,
  options?: GeometryConversionOptions
): GerberConversionResult {
  const pipelineStart = getTimestamp()
  const parseStart = pipelineStart
  const parseTree = parse(contents)
  const parseEnd = getTimestamp()
  const image = plot(parseTree)
  const plotEnd = getTimestamp()
  const geometryResult = convertImageTree(image, options)
  const totalMs = getTimestamp() - pipelineStart
  const performance: GeometryPerformanceProfile = {
    ...geometryResult.performance,
    parseMs: parseEnd - parseStart,
    plotMs: plotEnd - parseEnd,
    totalMs,
  }

  return {
    ...geometryResult,
    parseTree,
    image,
    performance,
  }
}

export interface MinimumSpacingOptions {
  searchTolerance?: number
}

export function measureMinimumSpacing(
  result: ImageGeometryResult,
  options?: MinimumSpacingOptions
): MinimumSpacingMeasurement | null {
  const components = result.components
  if (components.length === 0) return null

  const tolerance =
    options?.searchTolerance ?? Math.max(result.mmPerUnit / 1000, 1e-5)
  const measurement = measureSpacingBetweenComponents(
    components,
    result.geometryFactory,
    result.mmPerUnit,
    tolerance,
    result.spacingIndex as InternalGeometrySpacingIndex | null
  )

  return measurement
}

export function analyzeSpacingRule(
  result: ImageGeometryResult,
  ruleMil: number,
  options?: MinimumSpacingOptions,
  measurement?: MinimumSpacingMeasurement | null
): SpacingRuleResult {
  const ruleStart = getTimestamp()
  const tolerance =
    options?.searchTolerance ?? Math.max(result.mmPerUnit / 1000, 1e-5)
  const spacingMil = Math.max(ruleMil, tolerance * MILS_PER_MM * 2)
  const spacingUnits = milToUnits(spacingMil, result.mmPerUnit)
  const measurementResult =
    measurement ??
    measureSpacingBetweenComponents(
      result.components,
      result.geometryFactory,
      result.mmPerUnit,
      tolerance,
      result.spacingIndex as InternalGeometrySpacingIndex | null
    )
  const emptyGeometry = result.geometryFactory.createGeometryCollection([])
  const hasViolations =
    measurementResult !== null &&
    measurementResult.spacingMil + EPSILON < spacingMil
  const violations = hasViolations && measurementResult?.violations
    ? measurementResult.violations
    : emptyGeometry
  const location: Position | null = hasViolations
    ? measurementResult?.location ?? null
    : (() => {
        const coordinate = result.composite
          .getInteriorPoint()
          .getCoordinate()
        return coordinate ? [coordinate.x, coordinate.y] : null
      })()
  const spacingMm = spacingUnits * result.mmPerUnit
  const durationMs = getTimestamp() - ruleStart

  return {
    spacingUnits,
    spacingMil,
    spacingMm,
    violations,
    location,
    hasViolations,
    metrics: {
      durationMs,
      candidatePairs: measurementResult?.metrics?.candidatePairs,
      evaluatedPairs: measurementResult?.metrics?.evaluatedPairs,
    },
  }
}

export interface SpacingRuleEvaluation {
  measurement: MinimumSpacingMeasurement | null
  rule: SpacingRuleResult
}

export function measureSpacingAndAnalyzeRule(
  result: ImageGeometryResult,
  ruleMil: number,
  options?: MinimumSpacingOptions
): SpacingRuleEvaluation {
  const measurement = measureMinimumSpacing(result, options)
  const rule = analyzeSpacingRule(result, ruleMil, options, measurement)
  return {measurement, rule}
}

function convertGraphic(
  graphic: ImageGraphic,
  context: ConversionContext
): Geometry | null {
  switch (graphic.type) {
    case IMAGE_SHAPE:
      return convertShape(graphic as ImageShape, context)

    case IMAGE_PATH:
      return convertStroke(graphic as ImagePath, context)

    case IMAGE_REGION:
      return convertRegion(graphic as ImageRegion, context)

    default:
      return null
  }
}

function convertShape(
  imageShape: ImageShape,
  context: ConversionContext
): Geometry | null {
  const {shape} = imageShape

  if (shape.type === LAYERED_SHAPE) {
    return convertLayeredShape(shape, context)
  }

  return convertSimpleShape(shape, context)
}

function convertLayeredShape(
  layered: LayeredShape,
  context: ConversionContext
): Geometry | null {
  let composite: Geometry | null = null

  for (const shape of layered.shapes) {
    const geometry = convertSimpleShape(shape, context)
    if (geometry === null || geometry.isEmpty()) continue

    composite =
      composite === null
        ? shape.erase
          ? null
          : geometry
        : shape.erase
          ? safeDifference(composite, geometry)
          : safeUnion(composite, geometry)
  }

  return composite
}

function convertSimpleShape(
  shape: SimpleShape,
  context: ConversionContext
): Geometry | null {
  if (shape.type === CIRCLE) {
    const coordinate = new Coordinate(shape.cx, shape.cy)
    const point = context.geometryFactory.createPoint(coordinate)
    return point.buffer(shape.r, context.strokeQuadrantSegments)
  }

  if (shape.type === RECTANGLE || shape.type === POLYGON || shape.type === OUTLINE) {
    const segments = simpleShapeToSegments(shape)
    return polygonsFromSegments(segments, context)
  }

  return null
}

function convertStroke(
  path: ImagePath,
  context: ConversionContext
): Geometry | null {
  const width = path.width
  if (width <= 0) return null

  const polylines = segmentsToChains(path.segments, context)
  const buffered: Geometry[] = []

  for (const polyline of polylines) {
    if (polyline.length < 2) continue

    const coordinates = polyline.map(toCoordinate)
    const lineString: LineString = context.geometryFactory.createLineString(
      coordinates
    )
    buffered.push(
      lineString.buffer(width / 2, context.strokeQuadrantSegments)
    )
  }

  return unionGeometries(buffered)
}

function convertRegion(
  region: ImageRegion,
  context: ConversionContext
): Geometry | null {
  return polygonsFromSegments(region.segments, context)
}

function polygonsFromSegments(
  segments: PathSegment[],
  context: ConversionContext
): Geometry | null {
  const chains = segmentsToChains(segments, context)
  const polygons: Geometry[] = []

  for (const chain of chains) {
    const polygon = polygonFromChain(chain, context)
    if (polygon !== null) {
      polygons.push(polygon)
    }
  }

  return unionGeometries(polygons)
}

function polygonFromChain(
  chain: Position[],
  context: ConversionContext
): Polygon | null {
  if (chain.length < 3) return null

  const deduped = dedupeSequentialPoints(chain)
  if (deduped.length < 3) return null

  const isClosed = positionsEqual(deduped[0], deduped[deduped.length - 1])
  const closed = isClosed ? deduped : [...deduped, deduped[0]]
  if (closed.length < 4) return null

  const coordinates = closed.map(toCoordinate)
  const shell = context.geometryFactory.createLinearRing(coordinates)
  if (shell.isEmpty()) return null

  return context.geometryFactory.createPolygon(shell)
}

function segmentsToChains(
  segments: PathSegment[],
  context: ConversionContext
): Position[][] {
  const chains: Position[][] = []
  let current: Position[] = []
  let previousEnd: Position | undefined

  for (const segment of segments) {
    const start = extractPosition(segment.start)
    const end = extractPosition(segment.end)
    const isContinuous =
      previousEnd !== undefined && positionsEqual(previousEnd, start)

    if (!isContinuous) {
      if (current.length > 0) {
        chains.push(current)
      }

      current = [start]
    } else if (current.length === 0) {
      current.push(start)
    } else {
      const last = current[current.length - 1]
      if (!positionsEqual(last, start)) {
        current.push(start)
      }
    }

    appendSegmentPoints(current, segment, context)
    previousEnd = end
  }

  if (current.length > 0) {
    chains.push(current)
  }

  return chains
}

function appendSegmentPoints(
  target: Position[],
  segment: PathSegment,
  context: ConversionContext
): void {
  if (segment.type === LINE) {
    const normalized = extractPosition(segment.end)
    const last = target[target.length - 1]
    if (!last || !positionsEqual(last, normalized)) {
      target.push(normalized)
    }
    return
  }

  const points = sampleArcSegment(segment, context.maxArcSegmentAngle)
  for (const point of points) {
    const normalized = extractPosition(point)
    const last = target[target.length - 1]
    if (!last || !positionsEqual(last, normalized)) {
      target.push(normalized)
    }
  }
}

function sampleArcSegment(
  segment: Extract<PathSegment, {type: typeof ARC}>,
  maxAngle: number
): Position[] {
  const {center, radius} = segment
  const [startX, startY, startTheta] = segment.start as ArcPosition
  const [, , endTheta] = segment.end as ArcPosition
  const sweep = endTheta - startTheta

  if (Math.abs(sweep) < EPSILON) {
    return [extractPosition(segment.end)]
  }

  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / maxAngle))
  const points: Position[] = []

  for (let step = 1; step <= steps; step++) {
    const theta = startTheta + (sweep * step) / steps
    points.push([
      center[0] + radius * Math.cos(theta),
      center[1] + radius * Math.sin(theta),
    ])
  }

  // Ensure the final point exactly matches the provided end coordinate.
  const computedEnd = points[points.length - 1]
  const explicitEnd = extractPosition(segment.end)
  if (computedEnd && !positionsEqual(computedEnd, explicitEnd)) {
    points[points.length - 1] = explicitEnd
  }

  // Re-introduce the original start coordinate if the arc does not move.
  if (points.length === 0) {
    points.push([startX, startY])
  }

  return points
}

function simpleShapeToSegments(shape: SimpleShape): PathSegment[] {
  if (shape.type === RECTANGLE) {
    return rectangleToSegments(shape)
  }

  if (shape.type === POLYGON) {
    const {points} = shape
    return points.map((start, index) => {
      const endIndex = index === points.length - 1 ? 0 : index + 1
      return {type: LINE, start, end: points[endIndex]}
    })
  }

  return shape.segments
}

function rectangleToSegments(shape: RectangleShape): PathSegment[] {
  const {x, y, xSize, ySize} = shape
  const r = shape.r ?? 0
  const xHalf = xSize / 2
  const yHalf = ySize / 2

  if (r > 0 && nearlyEqual(r, xHalf)) {
    return [
      {
        type: LINE,
        start: [x + xSize, y + r],
        end: [x + xSize, y + ySize - r],
      },
      {
        type: ARC,
        start: [x + xSize, y + ySize - r, 0],
        end: [x, y + ySize - r, PI],
        center: [x + r, y + ySize - r],
        radius: r,
      },
      {
        type: LINE,
        start: [x, y + ySize - r],
        end: [x, y + r],
      },
      {
        type: ARC,
        start: [x, y + r, PI],
        end: [x + xSize, y + r, TWO_PI],
        center: [x + r, y + r],
        radius: r,
      },
    ]
  }

  if (r > 0 && nearlyEqual(r, yHalf)) {
    return [
      {
        type: LINE,
        start: [x + r, y],
        end: [x + xSize - r, y],
      },
      {
        type: ARC,
        start: [x + xSize - r, y, -HALF_PI],
        end: [x + xSize - r, y + ySize, HALF_PI],
        center: [x + xSize - r, y + r],
        radius: r,
      },
      {
        type: LINE,
        start: [x + xSize - r, y + ySize],
        end: [x + r, y + ySize],
      },
      {
        type: ARC,
        start: [x + r, y + ySize, HALF_PI],
        end: [x + r, y, THREE_HALF_PI],
        center: [x + r, y + r],
        radius: r,
      },
    ]
  }

  return [
    {type: LINE, start: [x, y], end: [x + xSize, y]},
    {
      type: LINE,
      start: [x + xSize, y],
      end: [x + xSize, y + ySize],
    },
    {
      type: LINE,
      start: [x + xSize, y + ySize],
      end: [x, y + ySize],
    },
    {type: LINE, start: [x, y + ySize], end: [x, y]},
  ]
}

function dedupeSequentialPoints(points: Position[]): Position[] {
  const deduped: Position[] = []

  for (const point of points) {
    const last = deduped[deduped.length - 1]
    if (!last || !positionsEqual(last, point)) {
      deduped.push(point)
    }
  }

  return deduped
}

function extractPosition(position: Position | ArcPosition): Position {
  return [position[0], position[1]]
}

function toCoordinate(position: Position): Coordinate {
  return new Coordinate(position[0], position[1])
}

function unionGeometries(geometries: Geometry[]): Geometry | null {
  let composite: Geometry | null = null

  for (const geometry of geometries) {
    if (geometry === null || geometry.isEmpty()) continue
    composite = safeUnion(composite, geometry)
  }

  return composite
}

function mergeRunGeometries(geometries: Geometry[]): Geometry | null {
  if (geometries.length === 0) return null
  if (geometries.length <= GRID_MIN_GEOMETRIES_FOR_GRID) {
    return unionGeometries(geometries)
  }

  const buckets = splitGeometriesByGrid(geometries)
  if (buckets.length <= 1) {
    return unionGeometries(geometries)
  }

  const bucketResults: Geometry[] = []
  for (const bucket of buckets) {
    const merged = unionGeometries(bucket)
    if (merged !== null && !merged.isEmpty()) {
      bucketResults.push(merged)
    }
  }

  return unionGeometries(bucketResults)
}

function partitionGeometriesByGrid(geometries: Geometry[]): Geometry[][] {
  if (geometries.length === 0) return []

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const envelopes: Envelope[] = []

  for (const geometry of geometries) {
    const envelope = geometry.getEnvelopeInternal()
    envelopes.push(envelope)
    if (!envelope || envelope.isNull()) continue
    minX = Math.min(minX, envelope.getMinX())
    minY = Math.min(minY, envelope.getMinY())
    maxX = Math.max(maxX, envelope.getMaxX())
    maxY = Math.max(maxY, envelope.getMaxY())
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return [geometries]
  }

  const width = Math.max(maxX - minX, GRID_MIN_CELL_SIZE)
  const height = Math.max(maxY - minY, GRID_MIN_CELL_SIZE)
  const approxBuckets = Math.ceil(geometries.length / GRID_TARGET_BUCKET_SIZE)
  if (approxBuckets <= 1) {
    return [geometries]
  }

  const aspectRatio =
    height <= GRID_MIN_CELL_SIZE
      ? GRID_MAX_GRID_DIVISIONS
      : Math.max(width / height, GRID_MIN_CELL_SIZE)
  let columns = Math.max(
    1,
    Math.round(Math.sqrt(approxBuckets * aspectRatio))
  )
  let rows = Math.max(1, Math.ceil(approxBuckets / columns))
  columns = Math.min(columns, GRID_MAX_GRID_DIVISIONS)
  rows = Math.min(rows, GRID_MAX_GRID_DIVISIONS)
  if (columns * rows < approxBuckets) {
    const scale = Math.ceil(Math.sqrt(approxBuckets / (columns * rows)))
    columns = Math.min(columns * scale, GRID_MAX_GRID_DIVISIONS)
    rows = Math.min(
      Math.max(rows, Math.ceil(approxBuckets / Math.max(columns, 1))),
      GRID_MAX_GRID_DIVISIONS
    )
  }
  if (columns <= 1 && rows <= 1) {
    return [geometries]
  }

  const cellWidth = Math.max(width / columns, GRID_MIN_CELL_SIZE)
  const cellHeight = Math.max(height / rows, GRID_MIN_CELL_SIZE)
  const buckets = new Map<string, Geometry[]>()

  geometries.forEach((geometry, index) => {
    const envelope = envelopes[index]
    if (!envelope || envelope.isNull()) {
      const key = '0:0'
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(geometry)
      } else {
        buckets.set(key, [geometry])
      }
      return
    }

    const centerX = (envelope.getMinX() + envelope.getMaxX()) / 2
    const centerY = (envelope.getMinY() + envelope.getMaxY()) / 2
    const col = Math.min(
      columns - 1,
      Math.max(0, Math.floor((centerX - minX) / cellWidth))
    )
    const row = Math.min(
      rows - 1,
      Math.max(0, Math.floor((centerY - minY) / cellHeight))
    )
    const key = `${col}:${row}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(geometry)
    } else {
      buckets.set(key, [geometry])
    }
  })

  const partitioned = Array.from(buckets.values())
  partitioned.sort((a, b) => b.length - a.length)
  return partitioned
}

function splitGeometriesByGrid(
  geometries: Geometry[],
  depth = 0
): Geometry[][] {
  if (geometries.length === 0) return []
  if (depth >= GRID_MAX_RECURSION_DEPTH) {
    return [geometries]
  }

  const adaptiveTarget = Math.max(
    GRID_MIN_BUCKET_TARGET,
    Math.floor(GRID_TARGET_BUCKET_SIZE / Math.max(1, Math.pow(2, depth)))
  )
  if (geometries.length <= adaptiveTarget) {
    return [geometries]
  }

  const buckets = partitionGeometriesByGrid(geometries)
  if (buckets.length <= 1) {
    return [geometries]
  }

  const result: Geometry[][] = []
  buckets.forEach(bucket => {
    if (bucket.length === 0) {
      return
    }

    if (bucket.length <= adaptiveTarget || depth + 1 >= GRID_MAX_RECURSION_DEPTH) {
      result.push(bucket)
      return
    }

    const nested = splitGeometriesByGrid(bucket, depth + 1)
    if (nested.length === 0) {
      result.push(bucket)
    } else {
      result.push(...nested)
    }
  })

  return result.length > 0 ? result : [geometries]
}

function safeUnion(a: Geometry | null, b: Geometry): Geometry {
  if (b.isEmpty()) return a ?? b
  if (a === null || a.isEmpty()) return b
  return overlayWithFallback('union', a, b)
}

function safeDifference(a: Geometry, b: Geometry): Geometry {
  if (a.isEmpty() || b.isEmpty()) return a
  return overlayWithFallback('difference', a, b)
}

type OverlayOp = 'union' | 'difference'

function overlayWithFallback(
  op: OverlayOp,
  a: Geometry,
  b: Geometry
): Geometry {
  try {
    return op === 'union' ? a.union(b) : a.difference(b)
  } catch (error) {
    try {
      return op === 'union'
        ? SnapIfNeededOverlayOp.union(a, b)
        : SnapIfNeededOverlayOp.difference(a, b)
    } catch {
      const cleanedA = cleanGeometry(a)
      const cleanedB = cleanGeometry(b)
      try {
        return op === 'union'
          ? cleanedA.union(cleanedB)
          : cleanedA.difference(cleanedB)
      } catch {
        const reducedA = reducePrecision(cleanedA, PRECISION_REDUCER_SCALE)
        const reducedB = reducePrecision(cleanedB, PRECISION_REDUCER_SCALE)
        return op === 'union'
          ? reducedA.union(reducedB)
          : reducedA.difference(reducedB)
      }
    }
  }
}

function cleanGeometry(geometry: Geometry): Geometry {
  try {
    return geometry.buffer(0)
  } catch {
    return geometry
  }
}

function reducePrecision(geometry: Geometry, scale: number): Geometry {
  const model = new PrecisionModel(scale)
  const reducer = new GeometryPrecisionReducer(model)
  reducer.setPointwise(true)
  reducer.setRemoveCollapsedComponents(true)
  return reducer.reduce(geometry)
}

function safeIntersection(a: Geometry, b: Geometry): Geometry {
  try {
    return a.intersection(b)
  } catch {
    try {
      return SnapIfNeededOverlayOp.intersection(a, b)
    } catch {
      const cleanedA = cleanGeometry(a)
      const cleanedB = cleanGeometry(b)
      try {
        return cleanedA.intersection(cleanedB)
      } catch {
        const reducedA = reducePrecision(cleanedA, PRECISION_REDUCER_SCALE)
        const reducedB = reducePrecision(cleanedB, PRECISION_REDUCER_SCALE)
        return reducedA.intersection(reducedB)
      }
    }
  }
}

function geometryToComponentPolygons(composite: Geometry): Geometry[] {
  if (composite.isEmpty()) return []
  const components: Geometry[] = []
  const stack: Geometry[] = [composite]

  while (stack.length > 0) {
    const geometry = stack.pop()
    if (!geometry || geometry.isEmpty()) continue

    const type = geometry.getGeometryType()
    if (type === 'Polygon') {
      components.push(geometry)
      continue
    }

    if (type === 'MultiPolygon' || type === 'GeometryCollection') {
      const count = geometry.getNumGeometries()
      for (let index = 0; index < count; index++) {
        stack.push(geometry.getGeometryN(index))
      }
      continue
    }

    if (geometry.getDimension() >= 2 && geometry.getNumGeometries) {
      const count = geometry.getNumGeometries()
      if (count === 0) {
        components.push(geometry)
      } else {
        for (let index = 0; index < count; index++) {
          stack.push(geometry.getGeometryN(index))
        }
      }
    }
  }

  return components
}

function normalizeOptions(
  options?: GeometryConversionOptions
): NormalizedOptions {
  const precisionScale = Math.max(
    1,
    options?.precisionScale ?? DEFAULT_PRECISION_SCALE
  )
  const strokeQuadrantSegments = Math.max(
    1,
    options?.strokeQuadrantSegments ?? DEFAULT_STROKE_SEGMENTS
  )
  const requestedArcAngle =
    options?.maxArcSegmentAngle ?? DEFAULT_ARC_SEGMENT_ANGLE
  const maxArcSegmentAngle = Math.min(
    Math.max(requestedArcAngle, MIN_ARC_SEGMENT_ANGLE),
    Math.PI / 8
  )

  return {precisionScale, strokeQuadrantSegments, maxArcSegmentAngle}
}

function unitsToMillimeters(units: UnitsType | undefined): number {
  return units === 'in' ? 25.4 : 1
}

function milToUnits(widthMil: number, mmPerUnit: number): number {
  const widthMm = widthMil / MILS_PER_MM
  return widthMm / mmPerUnit
}

function getGraphicPolarity(graphic: ImageGraphicBase): Polarity {
  if (graphic.erase === true) return CLEAR
  return graphic.polarity ?? DARK
}

function nearlyEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon
}

interface NormalizedOptions {
  precisionScale: number
  strokeQuadrantSegments: number
  maxArcSegmentAngle: number
}

interface ConversionContext extends NormalizedOptions {
  geometryFactory: GeometryFactory
}

function measureSpacingBetweenComponents(
  components: Geometry[],
  geometryFactory: GeometryFactory,
  mmPerUnit: number,
  tolerance: number,
  spacingIndex?: InternalGeometrySpacingIndex | null
): MinimumSpacingMeasurement | null {
  if (components.length < 2) return null

  const measurementStart = getTimestamp()
  const cachedIndex =
    spacingIndex && spacingIndex.componentsIndexed >= 2
      ? spacingIndex
      : createGeometrySpacingIndex(components)
  if (
    cachedIndex === null ||
    !Number.isFinite(cachedIndex.maxExtent) ||
    cachedIndex.maxExtent <= 0
  ) {
    return null
  }

  const {entries, tree, maxExtent} = cachedIndex
  if (entries.length < 2) return null

  const seededDistance = seedInitialSpacingEstimate(entries)
  let bestDistance = Number.isFinite(seededDistance)
    ? seededDistance
    : Number.POSITIVE_INFINITY
  const targetDistance = Math.max(tolerance, 0)
  let bestPoints: [Coordinate, Coordinate] | null = null
  let candidatePairs = 0
  let evaluatedPairs = 0
  const initialPadding = Math.max(maxExtent, tolerance * 4, 1e-6)
  const proxySlack = Math.max(targetDistance, tolerance * 0.5)
  const maxCandidatesPerEntry = 256
  const maxFailedCandidatesPerEntry = 32

  outer: for (const entry of entries) {
    if (bestDistance <= targetDistance + EPSILON) break
    const padding = Number.isFinite(bestDistance)
      ? Math.max(bestDistance, tolerance * 2, 1e-6)
      : initialPadding
    const searchEnvelope = new Envelope(entry.envelope)
    searchEnvelope.expandBy(padding)
    const candidates = tree.query(searchEnvelope) as SpatialIndexEntry[]

    let scannedForEntry = 0
    let skippedForEntry = 0

    for (const candidate of candidates) {
      if (candidate.index <= entry.index) continue
      scannedForEntry += 1
      if (scannedForEntry > maxCandidatesPerEntry) {
        break
      }
      candidatePairs += 1
      const envelopeGap = entry.envelope.distance(candidate.envelope)
      if (envelopeGap > bestDistance) {
        skippedForEntry += 1
        if (skippedForEntry >= maxFailedCandidatesPerEntry) {
          break
        }
        continue
      }
      if (Number.isFinite(bestDistance)) {
        const hullGap =
          entry.hull !== null && candidate.hull !== null
            ? entry.hull.distance(candidate.hull)
            : envelopeGap
        if (hullGap > bestDistance + proxySlack) {
          skippedForEntry += 1
          if (skippedForEntry >= maxFailedCandidatesPerEntry) {
            break
          }
          continue
        }
      }
      evaluatedPairs += 1
      const distanceResult = estimateIndexedDistance(entry, candidate)
      const distance = distanceResult.distance
      if (distance + EPSILON < bestDistance) {
        bestDistance = Math.max(distance, 0)
        const nearestPoints = getNearestPointsForResult(
          distanceResult,
          entry,
          candidate
        )
        if (nearestPoints !== null) {
          bestPoints = [nearestPoints[0], nearestPoints[1]]
        }
        if (bestDistance <= targetDistance + EPSILON) {
          break outer
        }
      }
    }
  }

  if (!Number.isFinite(bestDistance) || bestPoints === null) {
    return null
  }

  const [pointA, pointB] = bestPoints
  const location: Position = [(pointA.x + pointB.x) / 2, (pointA.y + pointB.y) / 2]
  const violationGeometry = geometryFactory.createLineString([pointA, pointB])
  const durationMs = getTimestamp() - measurementStart
  const spacingUnits = Math.max(bestDistance, 0)
  const spacingMm = spacingUnits * mmPerUnit
  const spacingMil = spacingMm * MILS_PER_MM
  const endpoints: [Position, Position] = [
    [pointA.x, pointA.y],
    [pointB.x, pointB.y],
  ]

  return {
    spacingUnits,
    spacingMm,
    spacingMil,
    location,
    violations: violationGeometry,
    endpoints,
    metrics: {
      durationMs,
      candidatePairs,
      evaluatedPairs,
      componentsIndexed: cachedIndex.componentsIndexed,
    },
  }
}

interface SpatialIndexEntry {
  geometry: Geometry
  envelope: Envelope
  index: number
  hull: Geometry | null
  distanceIndex: IndexedFacetDistance | null
}

function buildSpatialEntries(components: Geometry[]): SpatialIndexEntry[] {
  const entries: SpatialIndexEntry[] = []

  components.forEach((geometry, index) => {
    if (geometry.isEmpty()) return
    const envelope = geometry.getEnvelopeInternal()
    if (!envelope || envelope.isNull()) return
    let hull: Geometry | null = null
    let distanceIndex: IndexedFacetDistance | null = null
    try {
      hull = geometry.convexHull()
    } catch {
      hull = null
    }
    try {
      distanceIndex = new IndexedFacetDistance(geometry)
    } catch {
      distanceIndex = null
    }
    entries.push({
      geometry,
      envelope: new Envelope(envelope),
      index,
      hull,
      distanceIndex,
    })
  })

  return entries
}

interface InternalGeometrySpacingIndex extends GeometrySpacingIndex {
  entries: SpatialIndexEntry[]
  tree: STRtree
  envelope: Envelope
  maxExtent: number
}

function createGeometrySpacingIndex(
  components: Geometry[]
): InternalGeometrySpacingIndex | null {
  if (components.length < 2) return null
  const entries = buildSpatialEntries(components)
  if (entries.length < 2) return null

  const tree = new STRtree()
  let overallEnvelope: Envelope | null = null
  for (const entry of entries) {
    tree.insert(entry.envelope, entry)
    if (overallEnvelope === null) {
      overallEnvelope = new Envelope(entry.envelope)
    } else {
      overallEnvelope.expandToInclude(entry.envelope)
    }
  }
  tree.build()

  if (overallEnvelope === null) {
    overallEnvelope = new Envelope()
  }
  const maxExtent = Math.max(
    overallEnvelope.getWidth(),
    overallEnvelope.getHeight()
  )
  if (!Number.isFinite(maxExtent) || maxExtent <= 0) {
    return null
  }

  return {
    componentsIndexed: entries.length,
    entries,
    tree,
    envelope: overallEnvelope,
    maxExtent,
  }
}

function seedInitialSpacingEstimate(
  entries: SpatialIndexEntry[],
  maxPairs = 24,
  neighborsPerEntry = 4
): number {
  if (entries.length < 2) return Number.POSITIVE_INFINITY
  const sorted = [...entries]
  sorted.sort(
    (a, b) => a.envelope.getMinX() - b.envelope.getMinX()
  )

  let best = Number.POSITIVE_INFINITY
  let pairsEvaluated = 0

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]
    for (
      let j = i + 1;
      j < sorted.length && j <= i + neighborsPerEntry;
      j++
    ) {
      if (pairsEvaluated >= maxPairs) {
        return best
      }
      const candidate = sorted[j]
      const envelopeGap = current.envelope.distance(candidate.envelope)
      if (envelopeGap >= best) {
        continue
      }
      pairsEvaluated += 1
      const op = new DistanceOp(current.geometry, candidate.geometry)
      const distance = op.distance()
      if (distance + EPSILON < best) {
        best = Math.max(distance, 0)
        if (best <= EPSILON) {
          return 0
        }
      }
    }
  }

  return best
}

type IndexedDistanceResult =
  | {distance: number; provider: 'entry'; op?: DistanceOp}
  | {distance: number; provider: 'candidate'; op?: DistanceOp}
  | {distance: number; provider: 'direct'; op: DistanceOp}

function estimateIndexedDistance(
  entry: SpatialIndexEntry,
  candidate: SpatialIndexEntry
): IndexedDistanceResult {
  if (entry.distanceIndex !== null) {
    try {
      const distance = entry.distanceIndex.distance(candidate.geometry)
      return {distance, provider: 'entry'}
    } catch {
      // fall through
    }
  }

  if (candidate.distanceIndex !== null) {
    try {
      const distance = candidate.distanceIndex.distance(entry.geometry)
      return {distance, provider: 'candidate'}
    } catch {
      // fall through
    }
  }

  const op = new DistanceOp(entry.geometry, candidate.geometry)
  return {distance: op.distance(), provider: 'direct', op}
}

function getNearestPointsForResult(
  result: IndexedDistanceResult,
  entry: SpatialIndexEntry,
  candidate: SpatialIndexEntry
): [Coordinate, Coordinate] | null {
  try {
    if (result.provider === 'entry') {
      const points = entry.distanceIndex?.nearestPoints(candidate.geometry)
      if (points) return [points[0], points[1]]
      const opFallback = new DistanceOp(entry.geometry, candidate.geometry)
      return opFallback.nearestPoints() as [Coordinate, Coordinate]
    }

    if (result.provider === 'candidate') {
      const points = candidate.distanceIndex?.nearestPoints(entry.geometry)
      if (points) return [points[0], points[1]]
      const opFallback = new DistanceOp(entry.geometry, candidate.geometry)
      return opFallback.nearestPoints() as [Coordinate, Coordinate]
    }

    return result.op.nearestPoints() as [Coordinate, Coordinate]
  } catch {
    return null
  }
}

function safeBuffer(geometry: Geometry, distance: number): Geometry {
  try {
    const buffered = geometry.buffer(distance)
    return reducePrecision(buffered, PRECISION_REDUCER_SCALE)
  } catch {
    try {
      const buffered = geometry.buffer(distance, 8)
      return reducePrecision(buffered, PRECISION_REDUCER_SCALE)
    } catch {
      return geometry.getFactory().createGeometryCollection([])
    }
  }
}
