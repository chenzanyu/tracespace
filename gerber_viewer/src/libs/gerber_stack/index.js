import { Container, Graphics } from 'pixi.js'
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
  LINE,
} from '@tracespace/plotter'

const MIN_PATH_STROKE_PX = 1.2
const DEFAULT_OUTLINE_WIDTH_MM = 0.05

const LAYER_ORDER_MAP = {
  'top:solderpaste': 1,
  'top:silkscreen': 2,
  'top:soldermask': 3,
  'top:copper': 4,
  'inner:copper': 5,
  'bottom:copper': 6,
  'bottom:soldermask': 7,
  'bottom:silkscreen': 8,
  'bottom:solderpaste': 9,
  'all:outline': 10,
  'all:drill': 11,
  'null:drawing': 12,
}

// 生成图层排序权重，保证前后顺序一致
export function orderLayerWeight(side, type) {
  const safeSide = side || 'null'
  const key = `${safeSide}:${type || 'drawing'}`
  return LAYER_ORDER_MAP[key] ?? 100
}

// 随机色值，保证图层有默认颜色
export function randomHexColor() {
  const rand = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  return `#${rand()}${rand()}${rand()}`
}

// 将 #RRGGBB 转换为 Pixi 可直接使用的数值
export function parseHexColor(input) {
  if (typeof input !== 'string') return 0xffffff
  const hex = input.trim().replace(/^#/, '')
  if (hex.length === 3) {
    const [r, g, b] = hex
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16)
  }
  if (hex.length === 6) {
    const value = Number.parseInt(hex, 16)
    return Number.isNaN(value) ? 0xffffff : value
  }
  return 0xffffff
}

const toXY = (position) => [position[0], position[1]]

const positionsClose = (a, b, eps = 1e-6) =>
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
  const startAngle = segment.start[2]
  const endAngle = segment.end[2]
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
  for (let i = 1; i < steps; i++) {
    const angle = startAngle + (sweep * i) / steps
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    points.push(mapRawPoint(px, py, ctx))
  }
  return points
}

const drawSegments = (graphics, segments, ctx, { closePath }) => {
  if (!Array.isArray(segments) || segments.length === 0) return
  graphics.beginPath()
  let currentEnd = null
  let subpathStart = null

  for (const segment of segments) {
    const startRaw = toXY(segment.start)
    if (!currentEnd || !positionsClose(currentEnd.raw, startRaw)) {
      if (closePath && currentEnd && subpathStart && !positionsClose(currentEnd.raw, subpathStart.raw)) {
        graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
      }
      const startPoint = mapRawPoint(startRaw[0], startRaw[1], ctx)
      graphics.moveTo(startPoint.x, startPoint.y)
      subpathStart = { raw: startRaw, point: startPoint }
    }

    if (segment.type === LINE) {
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      graphics.lineTo(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    } else {
      const arcPoints = approximateArcPoints(segment, ctx)
      for (const p of arcPoints) graphics.lineTo(p.x, p.y)
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      graphics.lineTo(endPoint.x, endPoint.y)
      currentEnd = { raw: endRaw, point: endPoint }
    }
  }

  if (closePath && subpathStart && currentEnd && !positionsClose(currentEnd.raw, subpathStart.raw)) {
    graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
  }
  if (closePath) graphics.closePath()
}

const applyFill = (graphics) => {
  graphics.fill({ color: 0xffffff })
}

const applyStroke = (graphics, width) => {
  graphics.stroke({ width, color: 0xffffff, alignment: 0.5 })
}

const drawPolygon = (graphics, points, ctx) => {
  if (!Array.isArray(points) || points.length === 0) return
  graphics.beginPath()
  const first = mapRawPoint(points[0][0], points[0][1], ctx)
  graphics.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i++) {
    const pt = mapRawPoint(points[i][0], points[i][1], ctx)
    graphics.lineTo(pt.x, pt.y)
  }
  graphics.lineTo(first.x, first.y)
  graphics.closePath()
}

const drawShapeGeometry = (graphics, shape, ctx) => {
  if (!shape) return
  switch (shape.type) {
    case CIRCLE: {
      const center = mapSvgPoint(shape.cx, -shape.cy, ctx)
      const radius = Math.max(shape.r * ctx.unitsToPx, 0)
      graphics.circle(center.x, center.y, radius)
      applyFill(graphics)
      break
    }
    case RECTANGLE: {
      const topLeft = mapSvgPoint(shape.x, -shape.y - shape.ySize, ctx)
      const width = shape.xSize * ctx.unitsToPx
      const height = shape.ySize * ctx.unitsToPx
      const radius = Math.max((shape.r ?? 0) * ctx.unitsToPx, 0)
      graphics.roundRect(topLeft.x, topLeft.y, width, height, radius)
      applyFill(graphics)
      break
    }
    case POLYGON: {
      drawPolygon(graphics, shape.points, ctx)
      applyFill(graphics)
      break
    }
    case OUTLINE: {
      drawSegments(graphics, shape.segments, ctx, { closePath: true })
      const outlineWidth = Math.max(ctx.unitsToPx * DEFAULT_OUTLINE_WIDTH_MM, MIN_PATH_STROKE_PX)
      applyStroke(graphics, outlineWidth)
      break
    }
    default:
      break
  }
}

const renderShapeRecursive = (shape, ctx, chunk, mode) => {
  if (!shape) return
  const nextMode = mode === 'mask' || shape.erase === true ? 'mask' : 'solid'

  if (shape.type === LAYERED_SHAPE) {
    for (const sub of shape.shapes || []) renderShapeRecursive(sub, ctx, chunk, nextMode)
    return
  }

  const target = nextMode === 'mask' ? chunk.mask : chunk.solid
  if (!target) return
  drawShapeGeometry(target, shape, ctx)
}

const drawGraphicRecursive = (graphic, ctx, chunk, mode) => {
  if (!graphic) return
  const nextMode = mode === 'mask' || graphic.erase === true ? 'mask' : 'solid'
  const target = nextMode === 'mask' ? chunk.mask : chunk.solid

  switch (graphic.type) {
    case IMAGE_SHAPE:
      renderShapeRecursive(graphic.shape, ctx, chunk, nextMode)
      break
    case IMAGE_PATH: {
      if (!target) break
      drawSegments(target, graphic.segments, ctx, { closePath: false })
      const widthPxRaw = (graphic.width ?? 0) * ctx.unitsToPx
      const strokeWidth = Math.max(widthPxRaw, MIN_PATH_STROKE_PX)
      applyStroke(target, strokeWidth)
      break
    }
    case IMAGE_REGION:
      if (!target) break
      drawSegments(target, graphic.segments, ctx, { closePath: true })
      applyFill(target)
      break
    default:
      break
  }
}

// 将 PlotTree 转换为 Pixi 可渲染对象
export function createLayerDisplay(tree, ctx, colorValue, opacity = 1) {
  const layerContainer = new Container()
  layerContainer.eventMode = 'none'

  const createChunk = () => {
    const container = new Container({ isRenderGroup: true })
    container.eventMode = 'none'

    const solid = new Graphics()
    solid.eventMode = 'none'
    solid.tint = colorValue
    solid.alpha = opacity
    container.addChild(solid)

    const mask = new Graphics()
    mask.eventMode = 'none'
    container.addChild(mask)
    container.setMask({ mask, inverse: true })

    layerContainer.addChild(container)
    return { container, solid, mask, hasClear: false }
  }

  let chunk = null
  for (const graphic of tree.children || []) {
    const isClear = graphic.polarity === CLEAR
    const needsChunk = chunk === null || (!isClear && chunk.hasClear)

    if (needsChunk) chunk = createChunk()

    drawGraphicRecursive(graphic, ctx, chunk, isClear ? 'mask' : 'solid')
    if (isClear) chunk.hasClear = true
  }

  return layerContainer
}
