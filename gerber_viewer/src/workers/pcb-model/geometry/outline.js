import * as THREE from 'three'
import {
  ARC,
  LINE,
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  CIRCLE,
  RECTANGLE,
  POLYGON,
  OUTLINE,
  LAYERED_SHAPE,
} from '@tracespace/plotter'

const toXY = (position = []) => [Number(position?.[0]) || 0, Number(position?.[1]) || 0]

const positionsClose = (a, b, eps = 1e-6) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const approximateArcPoints = (segment) => {
  const startAngle = segment?.start?.[2]
  const endAngle = segment?.end?.[2]
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) return []
  let sweep = endAngle - startAngle
  const startRaw = toXY(segment.start)
  const endRaw = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startRaw, endRaw)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }
  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []
  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const [cx, cy] = segment.center || [0, 0]
  const radius = Number(segment.radius) || 0
  const points = []
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

const traceSegments = (target, segments, closePath = true) => {
  if (!Array.isArray(segments) || segments.length === 0) return
  let currentEnd = null
  let subpathStart = null

  for (const segment of segments) {
    const startRaw = toXY(segment?.start)
    if (!currentEnd || !positionsClose(currentEnd.raw, startRaw)) {
      if (closePath && currentEnd && subpathStart && !positionsClose(currentEnd.raw, subpathStart.raw)) {
        target.lineTo(subpathStart.raw[0], subpathStart.raw[1])
      }
      target.moveTo(startRaw[0], startRaw[1])
      subpathStart = { raw: startRaw }
    }

    if (segment.type === LINE) {
      const endRaw = toXY(segment.end)
      target.lineTo(endRaw[0], endRaw[1])
      currentEnd = { raw: endRaw }
    } else if (segment.type === ARC) {
      const arcPoints = approximateArcPoints(segment)
      arcPoints.forEach(([x, y]) => target.lineTo(x, y))
      const endRaw = toXY(segment.end)
      target.lineTo(endRaw[0], endRaw[1])
      currentEnd = { raw: endRaw }
    }
  }

  if (closePath && subpathStart && currentEnd && !positionsClose(currentEnd.raw, subpathStart.raw)) {
    target.lineTo(subpathStart.raw[0], subpathStart.raw[1])
  }
}

export const appendSegmentsToPath = (segments, path) => {
  traceSegments(path, segments, true)
  path.closePath()
}

const appendCircleToPath = (definition, target) => {
  if (!definition) return
  target.moveTo(definition.cx + definition.r, definition.cy)
  target.absellipse(definition.cx, definition.cy, definition.r, definition.r, 0, Math.PI * 2, false)
  target.closePath()
}

const appendRoundedRectToPath = (definition, target) => {
  if (!definition) return
  const radius = Math.max(definition.r || 0, 0)
  const x = definition.x
  const y = definition.y
  const width = definition.xSize
  const height = definition.ySize
  target.moveTo(x + radius, y)
  target.lineTo(x + width - radius, y)
  target.quadraticCurveTo(x + width, y, x + width, y + radius)
  target.lineTo(x + width, y + height - radius)
  target.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  target.lineTo(x + radius, y + height)
  target.quadraticCurveTo(x, y + height, x, y + height - radius)
  target.lineTo(x, y + radius)
  target.quadraticCurveTo(x, y, x + radius, y)
  target.closePath()
}

const appendPolygonToPath = (points, target) => {
  if (!Array.isArray(points) || points.length === 0) return
  target.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) target.lineTo(points[i][0], points[i][1])
  target.closePath()
}

const appendShapeDefinition = (definition, target) => {
  if (!definition) return
  switch (definition.type) {
    case CIRCLE:
      appendCircleToPath(definition, target)
      break
    case RECTANGLE:
      appendRoundedRectToPath(definition, target)
      break
    case POLYGON:
      appendPolygonToPath(definition.points, target)
      break
    case OUTLINE:
      traceSegments(target, definition.segments, true)
      target.closePath()
      break
    case LAYERED_SHAPE:
      definition.shapes?.forEach((sub) => appendShapeDefinition(sub, target))
      break
    default:
      break
  }
}

const appendSegmentsWithState = (segments, state) => {
  if (!Array.isArray(segments) || segments.length === 0) return
  const start = toXY(segments[0]?.start)
  if (!state.started) {
    state.shape.moveTo(start[0], start[1])
    state.first = start
    state.started = true
  } else if (state.current && !positionsClose(state.current, start)) {
    state.shape.moveTo(start[0], start[1])
  }
  traceSegments(state.shape, segments, false)
  const lastSeg = segments[segments.length - 1]
  state.current = toXY(lastSeg?.end || lastSeg?.start || start)
}

export const createOutlineState = () => ({
  shape: new THREE.Shape(),
  started: false,
  current: null,
  first: null,
  extraPaths: [],
})

export const finalizeOutlineState = (state) => {
  if (!state?.shape) return null
  if (state.started && state.first && state.current && !positionsClose(state.current, state.first)) {
    state.shape.lineTo(state.first[0], state.first[1])
  }
  if (state.started) {
    state.shape.closePath()
  }
  if (Array.isArray(state.extraPaths) && state.extraPaths.length) {
    if (!Array.isArray(state.shape.holes)) state.shape.holes = []
    state.extraPaths.forEach((path) => state.shape.holes.push(path))
  }
  return state.shape
}

export function renderImageOutline(element, state) {
  if (!element || !state) return
  if (element.type === IMAGE_PATH || element.type === IMAGE_REGION) {
    appendSegmentsWithState(element.segments, state)
    return
  }
  if (element.type === IMAGE_SHAPE) {
    const extra = new THREE.Path()
    appendShapeDefinition(element.shape, extra)
    state.extraPaths.push(extra)
    state.started = true
    return
  }
  console.warn('[pcbModel] Invalid outline element', element)
}

export const outlinePositionsClose = positionsClose
