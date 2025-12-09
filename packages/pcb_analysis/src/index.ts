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
import type {Geometry as GeoJSONGeometry} from 'geojson'
import Geometry from 'jsts/org/locationtech/jts/geom/Geometry'
import GeometryCollection from 'jsts/org/locationtech/jts/geom/GeometryCollection'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory'
import LineString from 'jsts/org/locationtech/jts/geom/LineString'
import Polygon from 'jsts/org/locationtech/jts/geom/Polygon'
import PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel'
import SnapIfNeededOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapIfNeededOverlayOp'
import GeometryPrecisionReducer from 'jsts/org/locationtech/jts/precision/GeometryPrecisionReducer'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader'
import polygonClipping from 'polygon-clipping'
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

type PointCoords = [number, number]
type LinearRingCoords = PointCoords[]
type PolygonCoords = LinearRingCoords[]
type MultiPolygonCoords = PolygonCoords[]
const geoJsonWriter = new GeoJSONWriter()

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
}

export interface SpacingRuleResult {
  spacingUnits: number
  spacingMm: number
  spacingMil: number
  violations: Geometry
  location: Position | null
  hasViolations: boolean
}

export function convertImageTree(
  image: ImageTree,
  options?: GeometryConversionOptions
): ImageGeometryResult {
  const normalized = normalizeOptions(options)
  const geometryFactory = new GeometryFactory(
    new PrecisionModel(normalized.precisionScale)
  )
  const context: ConversionContext = {geometryFactory, ...normalized}
  const graphics: GeometryGraphicEntry[] = []
  let compositeMultiPolygon: MultiPolygonCoords = []

  image.children.forEach((graphic, index) => {
    const geometry = convertGraphic(graphic, context)
    if (geometry === null || geometry.isEmpty()) return

    const preciseGeometry = reducePrecision(
      cleanGeometry(geometry),
      PRECISION_REDUCER_SCALE
    )
    if (preciseGeometry.isEmpty()) return
    const multiPolygon = geometryToMultiPolygon(preciseGeometry)
    if (multiPolygon === null || multiPolygon.length === 0) return

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
    compositeMultiPolygon =
      polarity === CLEAR
        ? subtractMultiPolygons(compositeMultiPolygon, [multiPolygon])
        : unionMultiPolygons([compositeMultiPolygon, multiPolygon])
  })

  const compositeGeometry = multiPolygonToGeometry(
    compositeMultiPolygon,
    geometryFactory
  )
  const componentGeometries = polygonCoordsToGeometries(
    compositeMultiPolygon,
    geometryFactory
  )

  const collection = geometryFactory.createGeometryCollection(
    graphics.map(entry => entry.geometry)
  )

  return {
    units: image.units,
    mmPerUnit: unitsToMillimeters(image.units),
    geometryFactory,
    graphics,
    collection,
    composite: compositeGeometry,
    components: componentGeometries,
  }
}

export function gerberToImageGeometries(
  contents: string,
  options?: GeometryConversionOptions
): GerberConversionResult {
  const parseTree = parse(contents)
  const image = plot(parseTree)
  const geometryResult = convertImageTree(image, options)

  return {
    ...geometryResult,
    parseTree,
    image,
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
    tolerance
  )

  return measurement
}

export function analyzeSpacingRule(
  result: ImageGeometryResult,
  ruleMil: number,
  options?: MinimumSpacingOptions
): SpacingRuleResult {
  const tolerance =
    options?.searchTolerance ?? Math.max(result.mmPerUnit / 1000, 1e-5)
  const spacingMil = Math.max(ruleMil, tolerance * MILS_PER_MM * 2)
  const spacingUnits = milToUnits(spacingMil, result.mmPerUnit)
  const violations = detectSpacingViolations(
    result.components,
    spacingUnits / 2,
    result.geometryFactory
  )
  const hasViolations = !violations.isEmpty()
  const referenceGeometry = hasViolations
    ? violations
    : result.composite
  const coordinate = referenceGeometry.getInteriorPoint().getCoordinate()
  const location: Position | null = coordinate
    ? [coordinate.x, coordinate.y]
    : null
  const spacingMm = spacingUnits * result.mmPerUnit

  return {
    spacingUnits,
    spacingMil,
    spacingMm,
    violations,
    location,
    hasViolations,
  }
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

function geometryToMultiPolygon(geometry: Geometry): MultiPolygonCoords | null {
  if (geometry.isEmpty() || geometry.getDimension() < 2) {
    return null
  }

  const json = geoJsonWriter.write(geometry) as GeoJSONGeometry
  return extractMultiPolygonFromGeoJSON(json)
}

function extractMultiPolygonFromGeoJSON(
  geoJson: GeoJSONGeometry
): MultiPolygonCoords | null {
  if (geoJson.type === 'Polygon') {
    return [geoJson.coordinates as PolygonCoords]
  }

  if (geoJson.type === 'MultiPolygon') {
    return geoJson.coordinates as MultiPolygonCoords
  }

  if (geoJson.type === 'GeometryCollection') {
    const geometries = geoJson.geometries ?? []
    const results: MultiPolygonCoords = []

    for (const child of geometries) {
      const extracted = extractMultiPolygonFromGeoJSON(child as GeoJSONGeometry)
      if (extracted && extracted.length > 0) {
        results.push(...extracted)
      }
    }

    return results.length > 0 ? results : null
  }

  return null
}

function multiPolygonToGeometry(
  multiPolygon: MultiPolygonCoords,
  geometryFactory: GeometryFactory
): Geometry {
  if (!multiPolygon || multiPolygon.length === 0) {
    return geometryFactory.createGeometryCollection([])
  }

  const reader = new GeoJSONReader(geometryFactory)
  const geoJson = {
    type: 'MultiPolygon',
    coordinates: multiPolygon,
  }

  return reader.read(geoJson) as Geometry
}

function unionMultiPolygons(
  polygons: MultiPolygonCoords[]
): MultiPolygonCoords {
  let result: MultiPolygonCoords | null = null

  for (const polygon of polygons) {
    if (!polygon || polygon.length === 0) continue
    result =
      result === null
        ? polygon
        : (polygonClipping.union(result, polygon) as MultiPolygonCoords)
  }

  return result ?? []
}

function subtractMultiPolygons(
  subject: MultiPolygonCoords,
  clips: MultiPolygonCoords[]
): MultiPolygonCoords {
  if (!subject || subject.length === 0) {
    return []
  }

  let result: MultiPolygonCoords = subject

  for (const clip of clips) {
    if (!clip || clip.length === 0) continue
    if (result.length === 0) break
    result = polygonClipping.difference(
      result,
      clip
    ) as MultiPolygonCoords
  }

  return result
}

function polygonCoordsToGeometries(
  multiPolygon: MultiPolygonCoords,
  geometryFactory: GeometryFactory
): Geometry[] {
  const reader = new GeoJSONReader(geometryFactory)
  const geometries: Geometry[] = []

  for (const polygon of multiPolygon) {
    if (!polygon || polygon.length === 0) continue
    const geoJson = {type: 'Polygon', coordinates: polygon}
    const geometry = reader.read(geoJson) as Geometry
    if (!geometry.isEmpty()) {
      geometries.push(geometry)
    }
  }

  return geometries
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

function unitsToMil(widthUnits: number, mmPerUnit: number): number {
  const widthMm = widthUnits * mmPerUnit
  return widthMm * MILS_PER_MM
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
  tolerance: number
): MinimumSpacingMeasurement | null {
  if (components.length === 0) return null

  const aggregated = geometryFactory.createGeometryCollection(components)
  const envelope = aggregated.getEnvelopeInternal()
  const maxExtent = Math.max(envelope.getWidth(), envelope.getHeight())
  if (maxExtent <= 0) return null

  const epsilon = Math.max(tolerance, maxExtent / 10_000)
  let low = 0
  let high = maxExtent
  let violationGeometry: Geometry | null = null

  const ensuresViolations = (spacing: number): Geometry => {
    const halfSpacing = Math.max(spacing / 2, epsilon)
    return detectSpacingViolations(components, halfSpacing, geometryFactory)
  }

  let iterations = 0
  const maxIterations = 32

  while (iterations < maxIterations && high - low > epsilon) {
    iterations += 1
    const mid = (low + high) / 2
    const violations = ensuresViolations(mid)

    if (violations.isEmpty()) {
      low = mid
    } else {
      high = mid
      violationGeometry = violations
    }
  }

  if (violationGeometry === null || violationGeometry.isEmpty()) {
    violationGeometry = ensuresViolations(high)
  }

  const spacingUnits = Math.max(high, epsilon * 2)
  const spacingMm = spacingUnits * mmPerUnit
  const spacingMil = spacingMm * MILS_PER_MM
  const referenceGeometry = violationGeometry.isEmpty()
    ? aggregated
    : violationGeometry
  const coordinate = referenceGeometry.getInteriorPoint().getCoordinate()
  const location: Position | null = coordinate
    ? [coordinate.x, coordinate.y]
    : null

  return {
    spacingUnits,
    spacingMm,
    spacingMil,
    location,
    violations: violationGeometry,
  }
}

function detectSpacingViolations(
  components: Geometry[],
  halfSpacing: number,
  geometryFactory: GeometryFactory
): Geometry {
  if (components.length === 0 || halfSpacing <= 0) {
    return geometryFactory.createGeometryCollection([])
  }

  let accumulated: Geometry | null = null
  let violations: Geometry | null = null

  for (const component of components) {
    if (component.isEmpty()) continue

    const buffered = safeBuffer(component, halfSpacing)
    if (accumulated !== null && !accumulated.isEmpty()) {
      const overlap = safeIntersection(buffered, accumulated)
      if (!overlap.isEmpty()) {
        violations = violations === null ? overlap : safeUnion(violations, overlap)
      }
    }

    accumulated =
      accumulated === null ? buffered : safeUnion(accumulated, buffered)
  }

  return violations ?? geometryFactory.createGeometryCollection([])
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
