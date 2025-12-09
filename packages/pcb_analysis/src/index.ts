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
import Geometry from 'jsts/org/locationtech/jts/geom/Geometry'
import GeometryCollection from 'jsts/org/locationtech/jts/geom/GeometryCollection'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory'
import LineString from 'jsts/org/locationtech/jts/geom/LineString'
import Polygon from 'jsts/org/locationtech/jts/geom/Polygon'
import PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel'

const DEFAULT_PRECISION_SCALE = 1_000_000
const DEFAULT_STROKE_SEGMENTS = 8
const DEFAULT_ARC_SEGMENT_ANGLE = Math.PI / 64
const MIN_ARC_SEGMENT_ANGLE = Math.PI / 360

const PI = Math.PI
const HALF_PI = PI / 2
const THREE_HALF_PI = 3 * HALF_PI
const TWO_PI = 2 * PI
const EPSILON = 1e-9

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
}

export interface GerberConversionResult extends ImageGeometryResult {
  parseTree: GerberTree
  image: ImageTree
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
  let composite: Geometry | null = null

  image.children.forEach((graphic, index) => {
    const geometry = convertGraphic(graphic, context)
    if (geometry === null || geometry.isEmpty()) return

    const polarity = getGraphicPolarity(graphic)
    const entry: GeometryGraphicEntry = {
      id: `${graphic.type}-${index}`,
      index,
      geometry,
      polarity,
      source: graphic,
      dcode: graphic.dcode,
    }

    graphics.push(entry)
    if (polarity === CLEAR) {
      if (composite !== null) {
        composite = composite.difference(geometry)
      }
    } else {
      composite = composite === null ? geometry : composite.union(geometry)
    }
  })

  const collection = geometryFactory.createGeometryCollection(
    graphics.map(entry => entry.geometry)
  )

  const compositeGeometry =
    composite ?? geometryFactory.createGeometryCollection([])

  return {
    units: image.units,
    mmPerUnit: unitsToMillimeters(image.units),
    geometryFactory,
    graphics,
    collection,
    composite: compositeGeometry,
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
          ? composite.difference(geometry)
          : composite.union(geometry)
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
    composite = composite === null ? geometry : composite.union(geometry)
  }

  return composite
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
