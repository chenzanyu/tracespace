import { buildLine, earcut } from 'pixi.js'
import { CLEAR } from '@tracespace/parser'
import {
  IMAGE_SHAPE,
  IMAGE_PATH,
  IMAGE_REGION,
  CIRCLE,
  RECTANGLE,
  POLYGON,
  OUTLINE,
  LAYERED_SHAPE,
  ARC,
  LINE,
} from '@tracespace/plotter'

const MIN_PATH_STROKE_PX = 1.2
const DEFAULT_OUTLINE_WIDTH_MM = 0.05
const CLOSE_EPS = 1e-6

const toXY = (position) => [position?.[0] ?? 0, position?.[1] ?? 0]
const positionsClose = (a, b, eps = CLOSE_EPS) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const mapSvgPoint = (x, y, ctx) => {
  const [vx, vy] = ctx.viewBox
  return {
    x: (x - vx) * ctx.unitsToPx,
    y: (y - vy) * ctx.unitsToPx,
  }
}

const mapRawPoint = (x, y, ctx) => mapSvgPoint(x, -y, ctx)

const approximateArcPoints = (segment, ctx) => {
  const startAngle = segment?.start?.[2]
  const endAngle = segment?.end?.[2]
  let sweep = endAngle - startAngle
  if (!Number.isFinite(sweep)) return []

  const startXY = toXY(segment.start)
  const endXY = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startXY, endXY)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }

  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []

  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const [cx, cy] = segment.center
  const radius = segment.radius

  const points = []
  for (let i = 1; i < steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    points.push(mapRawPoint(px, py, ctx))
  }
  return points
}

const segmentsToSubpaths = (segments, ctx, { closePath } = {}) => {
  if (!Array.isArray(segments) || segments.length === 0) return []
  const subpaths = []
  let current = []
  let currentEnd = null
  let subpathStart = null

  const finalizeSubpath = () => {
    if (current.length < 4) {
      current = []
      return
    }
    if (closePath) {
      const firstX = current[0]
      const firstY = current[1]
      const lastX = current[current.length - 2]
      const lastY = current[current.length - 1]
      if (Math.abs(firstX - lastX) > CLOSE_EPS || Math.abs(firstY - lastY) > CLOSE_EPS) {
        current.push(firstX, firstY)
      }
    }
    subpaths.push(current)
    current = []
  }

  for (const segment of segments) {
    const startRaw = toXY(segment.start)
    if (!currentEnd || !positionsClose(currentEnd.raw, startRaw)) {
      if (current.length) finalizeSubpath()
      const startPoint = mapRawPoint(startRaw[0], startRaw[1], ctx)
      current.push(startPoint.x, startPoint.y)
      subpathStart = { raw: startRaw, point: startPoint }
    }

    if (segment.type === LINE) {
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      current.push(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    } else if (segment.type === ARC) {
      const arcPoints = approximateArcPoints(segment, ctx)
      for (const p of arcPoints) current.push(p.x, p.y)
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      current.push(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    }
  }

  if (current.length) {
    if (
      closePath &&
      subpathStart &&
      currentEnd &&
      !positionsClose(currentEnd.raw, subpathStart.raw)
    ) {
      current.push(subpathStart.point.x, subpathStart.point.y)
    }
    finalizeSubpath()
  }

  return subpaths
}

const stripClosingPoint = (points) => {
  if (points.length < 6) return points
  const firstX = points[0]
  const firstY = points[1]
  const lastX = points[points.length - 2]
  const lastY = points[points.length - 1]
  if (Math.abs(firstX - lastX) <= CLOSE_EPS && Math.abs(firstY - lastY) <= CLOSE_EPS) {
    return points.slice(0, -2)
  }
  return points
}

const triangulatePolygon = (points) => {
  const cleaned = stripClosingPoint(points)
  if (cleaned.length < 6) return null
  const triangles = earcut(cleaned, [], 2)
  if (!triangles || triangles.length < 3) return null
  return {
    positions: new Float32Array(cleaned),
    indices: new Uint32Array(triangles),
  }
}

const triangulateLine = (points, widthPx, closed = false) => {
  const cleaned = stripClosingPoint(points)
  if (cleaned.length < 4 || !Number.isFinite(widthPx) || widthPx <= 0) return null
  const vertices = []
  const indices = []
  const style = {
    width: widthPx,
    cap: 'butt',
    join: 'miter',
    miterLimit: 10,
    alignment: 0.5,
  }
  buildLine(cleaned, style, false, closed, vertices, indices)
  if (!vertices.length || indices.length < 3) return null
  return {
    positions: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}

const circlePoints = (cx, cy, rPx) => {
  const segments = Math.max(12, Math.ceil(Math.sqrt(rPx) * 6))
  const pts = []
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    pts.push(cx + Math.cos(a) * rPx, cy + Math.sin(a) * rPx)
  }
  pts.push(pts[0], pts[1])
  return pts
}

const roundedRectPoints = (x, y, w, h, rPx) => {
  const radius = Math.max(0, Math.min(rPx, w / 2, h / 2))
  if (radius <= 0) {
    return [x, y, x + w, y, x + w, y + h, x, y + h, x, y]
  }
  const cornerSteps = 8
  const pts = []
  const addCorner = (cornerX, cornerY, startAngle, endAngle) => {
    const sweep = endAngle - startAngle
    for (let i = 0; i <= cornerSteps; i += 1) {
      const t = i / cornerSteps
      const a = startAngle + sweep * t
      pts.push(cornerX + Math.cos(a) * radius, cornerY + Math.sin(a) * radius)
    }
  }
  addCorner(x + radius, y + radius, Math.PI, Math.PI * 1.5)
  addCorner(x + w - radius, y + radius, Math.PI * 1.5, Math.PI * 2)
  addCorner(x + w - radius, y + h - radius, 0, Math.PI / 2)
  addCorner(x + radius, y + h - radius, Math.PI / 2, Math.PI)
  pts.push(pts[0], pts[1])
  return pts
}

const collectShapeGeometries = (shape, ctx, mode, out) => {
  if (!shape) return
  const nextMode = mode === 'mask' || shape.erase === true ? 'mask' : 'solid'

  if (shape.type === LAYERED_SHAPE) {
    for (const sub of shape.shapes || []) collectShapeGeometries(sub, ctx, nextMode, out)
    return
  }

  const targetList = nextMode === 'mask' ? out.masks : out.solids

  switch (shape.type) {
    case CIRCLE: {
      const center = mapSvgPoint(shape.cx, -shape.cy, ctx)
      const rPx = Math.max((shape.r ?? 0) * ctx.unitsToPx, 0)
      const geom = triangulatePolygon(circlePoints(center.x, center.y, rPx))
      if (geom) targetList.push(geom)
      break
    }
    case RECTANGLE: {
      const topLeft = mapSvgPoint(shape.x, -shape.y - shape.ySize, ctx)
      const w = (shape.xSize ?? 0) * ctx.unitsToPx
      const h = (shape.ySize ?? 0) * ctx.unitsToPx
      const rPx = Math.max((shape.r ?? 0) * ctx.unitsToPx, 0)
      const geom = triangulatePolygon(roundedRectPoints(topLeft.x, topLeft.y, w, h, rPx))
      if (geom) targetList.push(geom)
      break
    }
    case POLYGON: {
      const entries = Array.isArray(shape.points) ? shape.points : []
      const pts = []
      for (const p of entries) {
        const mapped = mapRawPoint(p[0], p[1], ctx)
        pts.push(mapped.x, mapped.y)
      }
      if (pts.length >= 6) {
        pts.push(pts[0], pts[1])
        const geom = triangulatePolygon(pts)
        if (geom) targetList.push(geom)
      }
      break
    }
    case OUTLINE: {
      const subpaths = segmentsToSubpaths(shape.segments, ctx, { closePath: true })
      const strokeWidth = Math.max(ctx.unitsToPx * DEFAULT_OUTLINE_WIDTH_MM, MIN_PATH_STROKE_PX)
      const geoms = []
      for (const sub of subpaths) {
        const geom = triangulateLine(sub, strokeWidth, true)
        if (geom) geoms.push(geom)
      }
      if (geoms.length) targetList.push(...geoms)
      break
    }
    default:
      break
  }
}

const collectGraphicGeometries = (graphic, ctx, mode, out) => {
  if (!graphic) return
  const nextMode = mode === 'mask' || graphic.erase === true ? 'mask' : 'solid'
  const targetList = nextMode === 'mask' ? out.masks : out.solids

  switch (graphic.type) {
    case IMAGE_SHAPE:
      collectShapeGeometries(graphic.shape, ctx, nextMode, out)
      break
    case IMAGE_PATH: {
      const subpaths = segmentsToSubpaths(graphic.segments, ctx, { closePath: false })
      const widthPxRaw = (graphic.width ?? 0) * ctx.unitsToPx
      const strokeWidth = Math.max(widthPxRaw, MIN_PATH_STROKE_PX)
      const geoms = []
      for (const sub of subpaths) {
        const geom = triangulateLine(sub, strokeWidth, false)
        if (geom) geoms.push(geom)
      }
      if (geoms.length) targetList.push(...geoms)
      break
    }
    case IMAGE_REGION: {
      const subpaths = segmentsToSubpaths(graphic.segments, ctx, { closePath: true })
      const geoms = []
      for (const sub of subpaths) {
        const geom = triangulatePolygon(sub)
        if (geom) geoms.push(geom)
      }
      if (geoms.length) targetList.push(...geoms)
      break
    }
    default:
      break
  }
}

const mergeGeometryList = (geometries) => {
  const list = Array.isArray(geometries) ? geometries.filter(Boolean) : []
  if (list.length === 0) return null
  let totalPositions = 0
  let totalIndices = 0
  for (const g of list) {
    totalPositions += g.positions.length
    totalIndices += g.indices.length
  }
  if (totalPositions === 0 || totalIndices === 0) return null

  const positions = new Float32Array(totalPositions)
  const indices = new Uint32Array(totalIndices)
  let posOffset = 0
  let idxOffset = 0
  let vertexBase = 0

  for (const g of list) {
    positions.set(g.positions, posOffset)
    for (let i = 0; i < g.indices.length; i += 1) {
      indices[idxOffset + i] = g.indices[i] + vertexBase
    }
    posOffset += g.positions.length
    idxOffset += g.indices.length
    vertexBase += g.positions.length / 2
  }

  return { positions, indices }
}

export const buildLayerMeshChunks = (tree, ctx) => {
  const graphics = Array.isArray(tree?.children) ? tree.children : []
  const chunks = []
  const createChunk = () => ({ solids: [], masks: [], hasClear: false })
  let chunk = createChunk()
  chunks.push(chunk)

  for (const graphic of graphics) {
    if (!graphic) continue
    const isClear = graphic.polarity === CLEAR
    if (isClear) {
      const out = { solids: [], masks: [] }
      collectGraphicGeometries(graphic, ctx, 'mask', out)
      const mergedMask = mergeGeometryList(out.masks)
      if (mergedMask) {
        for (const existing of chunks) {
          existing.masks.push(mergedMask)
          existing.hasClear = true
        }
      }
      continue
    }

    if (chunk.hasClear) {
      chunk = createChunk()
      chunks.push(chunk)
    }

    const out = { solids: [], masks: [] }
    collectGraphicGeometries(graphic, ctx, 'solid', out)
    if (out.solids.length) chunk.solids.push(...out.solids)
    if (out.masks.length) chunk.masks.push(...out.masks)
  }

  return chunks
    .map((entry) => ({
      solid: mergeGeometryList(entry.solids),
      mask: mergeGeometryList(entry.masks),
    }))
    .filter((chunkEntry) => chunkEntry.solid && chunkEntry.solid.positions.length > 0)
}

