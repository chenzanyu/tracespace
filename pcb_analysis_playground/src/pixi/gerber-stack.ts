import {Container, Graphics} from 'pixi.js'
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

const MIN_PATH_STROKE_PX = 1.2
const DEFAULT_OUTLINE_WIDTH_MM = 0.05

export interface PixiRenderContext {
  viewBox: [number, number, number, number]
  unitsToPx: number
}

export function parseHexColor(input: unknown): number {
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

const positionsClose = (a: [number, number], b: [number, number], eps = 1e-6): boolean =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const toXY = (position: unknown): [number, number] => {
  if (!Array.isArray(position) || position.length < 2) return [0, 0]
  return [Number(position[0]) || 0, Number(position[1]) || 0]
}

const mapSvgPoint = (x: number, y: number, ctx: PixiRenderContext): {x: number; y: number} => {
  const [vx, vy] = ctx.viewBox
  return {
    x: (x - vx) * ctx.unitsToPx,
    y: (y - vy) * ctx.unitsToPx,
  }
}

const mapRawPoint = (x: number, y: number, ctx: PixiRenderContext): {x: number; y: number} =>
  mapSvgPoint(x, -y, ctx)

const approximateArcPoints = (segment: PathSegment, ctx: PixiRenderContext): Array<{x: number; y: number}> => {
  if (segment.type !== ARC) return []
  const startAngle = (segment.start as unknown as number[])?.[2]
  const endAngle = (segment.end as unknown as number[])?.[2]
  let sweep = Number(endAngle) - Number(startAngle)
  if (!Number.isFinite(sweep)) return []

  const startXY = toXY(segment.start)
  const endXY = toXY(segment.end)
  if (Math.abs(sweep) < 1e-7 && positionsClose(startXY, endXY)) {
    sweep = sweep >= 0 ? Math.PI * 2 : -Math.PI * 2
  }

  const absSweep = Math.abs(sweep)
  if (absSweep === 0) return []

  const steps = Math.max(6, Math.ceil(absSweep / (Math.PI / 16)))
  const center = (segment as unknown as {center?: unknown}).center
  const radius = Number((segment as unknown as {radius?: unknown}).radius)
  const [cx, cy] = toXY(center)
  if (!Number.isFinite(radius) || radius <= 0) return []

  const points: Array<{x: number; y: number}> = []
  for (let i = 1; i < steps; i += 1) {
    const angle = Number(startAngle) + (sweep * i) / steps
    const px = cx + radius * Math.cos(angle)
    const py = cy + radius * Math.sin(angle)
    points.push(mapRawPoint(px, py, ctx))
  }
  return points
}

const drawSegments = (graphics: Graphics, segments: PathSegment[], ctx: PixiRenderContext, closePath: boolean): void => {
  if (!Array.isArray(segments) || segments.length === 0) return
  graphics.beginPath()
  let currentEnd: {raw: [number, number]; point: {x: number; y: number}} | null = null
  let subpathStart: {raw: [number, number]; point: {x: number; y: number}} | null = null

  for (const segment of segments) {
    const startRaw = toXY(segment.start)
    if (!currentEnd || !positionsClose(currentEnd.raw, startRaw)) {
      if (closePath && currentEnd && subpathStart && !positionsClose(currentEnd.raw, subpathStart.raw)) {
        graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
      }
      const startPoint = mapRawPoint(startRaw[0], startRaw[1], ctx)
      graphics.moveTo(startPoint.x, startPoint.y)
      subpathStart = {raw: startRaw, point: startPoint}
    }

    if (segment.type === LINE) {
      const endRaw = toXY(segment.end)
      const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
      graphics.lineTo(endPoint.x, endPoint.y)
      currentEnd = {raw: endRaw, point: endPoint}
      continue
    }

    const arcPoints = approximateArcPoints(segment, ctx)
    for (const p of arcPoints) graphics.lineTo(p.x, p.y)
    const endRaw = toXY(segment.end)
    const endPoint = mapRawPoint(endRaw[0], endRaw[1], ctx)
    graphics.lineTo(endPoint.x, endPoint.y)
    currentEnd = {raw: endRaw, point: endPoint}
  }

  if (closePath && subpathStart && currentEnd && !positionsClose(currentEnd.raw, subpathStart.raw)) {
    graphics.lineTo(subpathStart.point.x, subpathStart.point.y)
  }
  if (closePath) graphics.closePath()
}

const applyFill = (graphics: Graphics): void => {
  graphics.fill({color: 0xffffff})
}

const applyStroke = (graphics: Graphics, width: number): void => {
  graphics.stroke({width, color: 0xffffff, alignment: 0.5})
}

const drawPolygon = (graphics: Graphics, points: Array<[number, number]>, ctx: PixiRenderContext): void => {
  if (!Array.isArray(points) || points.length === 0) return
  graphics.beginPath()
  const first = mapRawPoint(points[0][0], points[0][1], ctx)
  graphics.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i += 1) {
    const pt = mapRawPoint(points[i][0], points[i][1], ctx)
    graphics.lineTo(pt.x, pt.y)
  }
  graphics.lineTo(first.x, first.y)
  graphics.closePath()
}

const drawShapeGeometry = (graphics: Graphics, shape: SimpleShape, ctx: PixiRenderContext): void => {
  switch (shape.type) {
    case CIRCLE: {
      const center = mapSvgPoint(shape.cx, -shape.cy, ctx)
      const radius = Math.max(shape.r * ctx.unitsToPx, 0)
      graphics.circle(center.x, center.y, radius)
      applyFill(graphics)
      return
    }
    case RECTANGLE: {
      const topLeft = mapSvgPoint(shape.x, -shape.y - shape.ySize, ctx)
      const width = shape.xSize * ctx.unitsToPx
      const height = shape.ySize * ctx.unitsToPx
      const radius = Math.max((shape.r ?? 0) * ctx.unitsToPx, 0)
      graphics.roundRect(topLeft.x, topLeft.y, width, height, radius)
      applyFill(graphics)
      return
    }
    case POLYGON: {
      drawPolygon(graphics, shape.points, ctx)
      applyFill(graphics)
      return
    }
    case OUTLINE: {
      drawSegments(graphics, shape.segments, ctx, true)
      const outlineWidth = Math.max(ctx.unitsToPx * DEFAULT_OUTLINE_WIDTH_MM, MIN_PATH_STROKE_PX)
      applyStroke(graphics, outlineWidth)
      return
    }
    default:
      return
  }
}

const renderShapeRecursive = (
  shape: ImageShape['shape'],
  ctx: PixiRenderContext,
  chunk: {solid: Graphics; mask: Graphics; hasClear: boolean},
  mode: 'solid' | 'mask'
): void => {
  if (!shape) return
  const nextMode = mode === 'mask' || shape.erase === true ? 'mask' : 'solid'

  if (shape.type === LAYERED_SHAPE) {
    for (const sub of shape.shapes || []) renderShapeRecursive(sub, ctx, chunk, nextMode)
    return
  }

  const target = nextMode === 'mask' ? chunk.mask : chunk.solid
  drawShapeGeometry(target, shape, ctx)
}

const drawGraphicRecursive = (
  graphic: ImageGraphic,
  ctx: PixiRenderContext,
  chunk: {solid: Graphics; mask: Graphics; hasClear: boolean},
  mode: 'solid' | 'mask'
): void => {
  const nextMode = mode === 'mask' || graphic.erase === true ? 'mask' : 'solid'
  const target = nextMode === 'mask' ? chunk.mask : chunk.solid

  switch (graphic.type) {
    case IMAGE_SHAPE:
      renderShapeRecursive((graphic as ImageShape).shape, ctx, chunk, nextMode)
      return
    case IMAGE_PATH: {
      drawSegments(target, (graphic as ImagePath).segments, ctx, false)
      const widthPxRaw = (Number((graphic as ImagePath).width) || 0) * ctx.unitsToPx
      const strokeWidth = Math.max(widthPxRaw, MIN_PATH_STROKE_PX)
      applyStroke(target, strokeWidth)
      return
    }
    case IMAGE_REGION:
      drawSegments(target, (graphic as ImageRegion).segments, ctx, true)
      applyFill(target)
      return
    default:
      return
  }
}

export function createLayerDisplay(
  tree: ImageTree,
  ctx: PixiRenderContext,
  colorValue: number,
  opacity = 1
): Container {
  const layerContainer = new Container()
  layerContainer.eventMode = 'none'

  const chunks: Array<{container: Container; solid: Graphics; mask: Graphics; hasClear: boolean}> = []
  const createChunk = (): {container: Container; solid: Graphics; mask: Graphics; hasClear: boolean} => {
    const container = new Container({isRenderGroup: true})
    container.eventMode = 'none'

    const solid = new Graphics()
    solid.eventMode = 'none'
    solid.tint = colorValue
    solid.alpha = opacity
    container.addChild(solid)

    const mask = new Graphics()
    mask.eventMode = 'none'
    container.addChild(mask)
    container.setMask({mask, inverse: true})

    layerContainer.addChild(container)
    const chunk = {container, solid, mask, hasClear: false}
    chunks.push(chunk)
    return chunk
  }

  let chunk = createChunk()
  const graphics = Array.isArray(tree.children) ? tree.children : []

  for (const graphic of graphics) {
    const isClear = (graphic as ImageGraphic).polarity === CLEAR

    if (isClear) {
      for (const target of chunks) {
        drawGraphicRecursive(graphic as ImageGraphic, ctx, target, 'mask')
        target.hasClear = true
      }
      continue
    }

    if (chunk.hasClear) {
      chunk = createChunk()
    }

    drawGraphicRecursive(graphic as ImageGraphic, ctx, chunk, 'solid')
  }

  return layerContainer
}

