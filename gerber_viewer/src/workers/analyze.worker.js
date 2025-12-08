import 'jsts/org/locationtech/jts/monkey.js'
import * as geom from 'jsts/org/locationtech/jts/geom.js'

const ANALYSIS_ACTION_RUN = 'run-analysis'
const geometryFactory = new geom.GeometryFactory()
const PI = Math.PI

const normalizeType = (value) => (typeof value === 'string' ? value.toLowerCase() : '')

const mergeBounds = (current, candidate) => {
  if (!Array.isArray(candidate) || candidate.length < 4) return current
  const [x1, y1, x2, y2] = candidate.map((value) => Number(value))
  if (![x1, y1, x2, y2].every((value) => Number.isFinite(value))) return current
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  const maxX = Math.max(x1, x2)
  const maxY = Math.max(y1, y2)
  if (!current) return [minX, minY, maxX, maxY]
  return [
    Math.min(current[0], minX),
    Math.min(current[1], minY),
    Math.max(current[2], maxX),
    Math.max(current[3], maxY),
  ]
}

const describeBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const [minX, minY, maxX, maxY] = bounds
  if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return null
  return {
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

const computeCopperLayerCount = (layers) => {
  if (!Array.isArray(layers)) return 0
  return layers.reduce((total, layer) => {
    return total + (normalizeType(layer?.type) === 'copper' ? 1 : 0)
  }, 0)
}

const computeOutlineBounds = (layers) => {
  if (!Array.isArray(layers)) return null
  let bounds = null
  for (const layer of layers) {
    if (normalizeType(layer?.type) !== 'outline') continue
    bounds = mergeBounds(bounds, layer?.size)
  }
  return bounds
}

const buildBoardSize = (payload) => {
  const mmPerUnit = Number(payload?.mmPerUnit) || 1
  const outlineBounds = computeOutlineBounds(payload?.layers)
  const finalBounds = outlineBounds ?? payload?.boardOutlineBounds ?? null
  const summary = describeBounds(finalBounds)
  if (!summary) return null
  return {
    widthMm: summary.width * mmPerUnit,
    heightMm: summary.height * mmPerUnit,
  }
}

const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const createPolygon = (points) => {
  if (!Array.isArray(points) || points.length < 3) return null
  const coords = points.map(([x, y]) => new geom.Coordinate(x, y))
  coords.push(coords[0])
  const ring = geometryFactory.createLinearRing(coords)
  return geometryFactory.createPolygon(ring)
}

const createCircleGeometry = (cx, cy, radius, segments = 32) => {
  if (!Number.isFinite(radius) || radius <= 0) return null
  const points = []
  for (let i = 0; i < segments; i += 1) {
    const theta = (2 * PI * i) / segments
    points.push([cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)])
  }
  return createPolygon(points)
}

const rotateAndShift = (point, origin, degrees = 0) => {
  const radians = (degrees * PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const [px, py] = point
  const rx = px * cos - py * sin
  const ry = px * sin + py * cos
  return [rx + origin[0], ry + origin[1]]
}

const unionGeometries = (shapes) => {
  let geometry = null
  for (const shape of shapes) {
    if (!shape) continue
    geometry = geometry ? geometry.union(shape) : shape
  }
  return geometry
}

const computePolygonWidth = (geometry) => {
  if (!geometry) return null
  const envelope = geometry.getEnvelopeInternal()
  if (!envelope) return null
  return Math.min(envelope.getWidth(), envelope.getHeight())
}

const computeWidthFromSimpleShape = (shape, mmPerUnit) => {
  if (!shape) return null
  switch (shape.type) {
    case 'circle':
      return toNumber(shape.diameter) * mmPerUnit
    case 'rectangle':
    case 'obround': {
      const x = toNumber(shape.xSize)
      const y = toNumber(shape.ySize)
      if (x <= 0 || y <= 0) return null
      return Math.min(x, y) * mmPerUnit
    }
    case 'polygon': {
      const diameter = toNumber(shape.diameter)
      const vertices = Math.max(3, Math.floor(toNumber(shape.vertices)))
      if (diameter <= 0 || vertices < 3) return null
      const radius = diameter / 2
      return (2 * radius * Math.cos(PI / vertices)) * mmPerUnit
    }
    default:
      return null
  }
}

const solveMacroExpression = (expression, context) => {
  if (typeof expression === 'number') return expression
  if (typeof expression === 'string') return context[expression] ?? 0
  if (!expression) return 0
  const left = solveMacroExpression(expression.left, context)
  const right = solveMacroExpression(expression.right, context)
  switch (expression.operator) {
    case '+':
      return left + right
    case '-':
      return left - right
    case 'x':
      return left * right
    case '/':
      return right === 0 ? 0 : left / right
    default:
      return 0
  }
}

const polygonFromOutlineParameters = (origin, parameters) => {
  if (!Array.isArray(parameters) || parameters.length < 3) return null
  const coords = parameters.slice(2, -1)
  const degrees = parameters[parameters.length - 1] || 0
  const points = []
  for (let index = 0; index < coords.length; index += 2) {
    const point = [coords[index], coords[index + 1]]
    points.push(rotateAndShift(point, origin, degrees))
  }
  return createPolygon(points)
}

const polygonFromRegular = (origin, parameters) => {
  const [exposure, vertices, cx, cy, diameter, degrees] = parameters
  if (exposure === 0) return null
  const count = Math.max(3, Math.floor(vertices))
  const radius = diameter / 2
  const points = []
  for (let index = 0; index < count; index += 1) {
    const theta = (2 * PI * index) / count
    const local = [cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)]
    points.push(rotateAndShift(local, origin, degrees || 0))
  }
  return createPolygon(points)
}

const plotMacroPrimitiveGeometry = (code, origin, parameters) => {
  switch (code) {
    case '1': {
      const [exposure, diameter, cx, cy] = parameters
      if (exposure === 0) return null
      return createCircleGeometry(origin[0] + cx, origin[1] + cy, diameter / 2)
    }
    case '20':
    case '2': {
      const [exposure, width, sx, sy, ex, ey, degrees] = parameters
      if (exposure === 0) return null
      const dx = ex - sx
      const dy = ey - sy
      const distance = Math.sqrt(dx ** 2 + dy ** 2) || 1
      const offsetX = (width / 2) * (dx / distance)
      const offsetY = (width / 2) * (dy / distance)
      const points = [
        [sx + offsetX, sy - offsetY],
        [ex + offsetX, ey - offsetY],
        [ex - offsetX, ey + offsetY],
        [sx - offsetX, sy + offsetY],
      ].map(point => rotateAndShift(point, origin, degrees || 0))
      return createPolygon(points)
    }
    case '21': {
      const [exposure, width, height, cx, cy, degrees] = parameters
      if (exposure === 0) return null
      const halfWidth = width / 2
      const halfHeight = height / 2
      const localPoints = [
        [cx - halfWidth, cy - halfHeight],
        [cx + halfWidth, cy - halfHeight],
        [cx + halfWidth, cy + halfHeight],
        [cx - halfWidth, cy + halfHeight],
      ]
      return createPolygon(localPoints.map(point => rotateAndShift(point, origin, degrees || 0)))
    }
    case '22': {
      const [exposure, width, height, x, y, degrees] = parameters
      if (exposure === 0) return null
      const localPoints = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ]
      return createPolygon(localPoints.map(point => rotateAndShift(point, origin, degrees || 0)))
    }
    case '4': {
      const [exposure] = parameters
      if (exposure === 0) return null
      return polygonFromOutlineParameters(origin, parameters)
    }
    case '5': {
      return polygonFromRegular(origin, parameters)
    }
    default:
      return null
  }
}

const buildMacroGeometry = (macroDef, variableValues) => {
  if (!macroDef?.blocks) return null
  const context = {}
  variableValues.forEach((value, index) => {
    context[`$${index + 1}`] = value
  })
  const shapes = []
  for (const block of macroDef.blocks) {
    if (block.type === 'variable') {
      context[block.name] = solveMacroExpression(block.value, context)
    } else if (block.type === 'primitive') {
      const params = block.parameters.map(param => solveMacroExpression(param, context))
      const geometry = plotMacroPrimitiveGeometry(block.code, [0, 0], params)
      if (geometry) shapes.push(geometry)
    }
  }
  return unionGeometries(shapes)
}

const computeWidthFromMacro = (shape, traceData, mmPerUnit) => {
  if (!shape || shape.type !== 'macro') return null
  const macro = traceData?.macros?.[shape.name]
  if (!macro) return null
  const geometry = buildMacroGeometry(macro, shape.variableValues || [])
  const width = computePolygonWidth(geometry)
  if (!Number.isFinite(width)) return null
  return width * mmPerUnit
}

const computeLayerMinTraceWidth = (layer, mmPerUnit) => {
  if (normalizeType(layer?.type) !== 'copper') return null
  const traceData = layer?.traceData
  if (!traceData) return null
  const used = Array.isArray(traceData.usedTools) ? traceData.usedTools : []
  const tools = traceData.tools || {}
  let minWidth = Infinity
  for (const code of used) {
    const tool = tools[code]
    if (!tool) continue
    const shape = tool.shape
    let width = computeWidthFromSimpleShape(shape, mmPerUnit)
    if (!Number.isFinite(width) && shape?.type === 'macro') {
      width = computeWidthFromMacro(shape, traceData, mmPerUnit)
    }
    if (!Number.isFinite(width) || width <= 0) continue
    minWidth = Math.min(minWidth, width)
  }
  return Number.isFinite(minWidth) ? minWidth : null
}

const computeMinTraceWidth = (layers, mmPerUnit) => {
  let minWidth = Infinity
  for (const layer of layers || []) {
    const layerWidth = computeLayerMinTraceWidth(layer, mmPerUnit)
    if (Number.isFinite(layerWidth) && layerWidth > 0) {
      minWidth = Math.min(minWidth, layerWidth)
    }
  }
  return Number.isFinite(minWidth) ? minWidth : null
}

const runAnalysis = (payload) => {
  const layers = Array.isArray(payload?.layers) ? payload.layers : []
  const result = {
    copperLayerCount: computeCopperLayerCount(layers),
    boardSize: buildBoardSize(payload),
  }
  if (payload?.includeTraceMetrics) {
    result.minTraceWidth = computeMinTraceWidth(layers, Number(payload.mmPerUnit) || 1)
  }
  return result
}

self.onmessage = (event) => {
  const { jobId, action, payload } = event.data || {}
  if (action !== ANALYSIS_ACTION_RUN) {
    self.postMessage({
      jobId,
      success: false,
      error: `Unknown analysis action: ${action}`,
    })
    return
  }
  try {
    const result = runAnalysis(payload)
    self.postMessage({
      jobId,
      success: true,
      result,
    })
  } catch (error) {
    self.postMessage({
      jobId,
      success: false,
      error: error?.message || 'Analysis failed',
    })
  }
}
