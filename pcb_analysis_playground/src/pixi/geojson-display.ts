import {Container, Graphics} from 'pixi.js'
import type {Geometry as GeoJsonGeometry, Position} from 'geojson'

import type {PixiRenderContext} from './gerber-stack'

const positionsClose = (a: [number, number], b: [number, number], eps = 1e-9): boolean =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps

const normalizeRing = (ring: Position[]): Array<[number, number]> => {
  const points: Array<[number, number]> = []
  for (const entry of ring) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const x = Number(entry[0])
    const y = Number(entry[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push([x, y])
  }
  if (points.length < 2) return points
  const first = points[0]
  const last = points[points.length - 1]
  if (positionsClose(first, last)) points.pop()
  return points
}

const mapRawPoint = (x: number, y: number, ctx: PixiRenderContext): {x: number; y: number} => {
  const [vx, vy] = ctx.viewBox
  const ySvg = -y
  return {
    x: (x - vx) * ctx.unitsToPx,
    y: (ySvg - vy) * ctx.unitsToPx,
  }
}

const drawRingPath = (graphics: Graphics, ring: Array<[number, number]>, ctx: PixiRenderContext): void => {
  if (ring.length === 0) return
  graphics.beginPath()
  const first = mapRawPoint(ring[0][0], ring[0][1], ctx)
  graphics.moveTo(first.x, first.y)
  for (let index = 1; index < ring.length; index += 1) {
    const pt = mapRawPoint(ring[index][0], ring[index][1], ctx)
    graphics.lineTo(pt.x, pt.y)
  }
  graphics.closePath()
}

export interface GeoJsonDisplayOptions {
  fill?: boolean
  stroke?: boolean
  strokeWidthPx?: number
}

export function createGeoJsonDisplay(
  geometry: GeoJsonGeometry | null,
  ctx: PixiRenderContext,
  tint: number,
  alpha: number,
  options: GeoJsonDisplayOptions = {}
): Container {
  const container = new Container()
  container.eventMode = 'none'

  if (!geometry) return container

  const graphics = new Graphics()
  graphics.eventMode = 'none'
  graphics.tint = tint
  graphics.alpha = alpha
  container.addChild(graphics)

  const fillEnabled = options.fill !== false
  const strokeEnabled = options.stroke === true
  const strokeWidth = Number(options.strokeWidthPx) > 0 ? Number(options.strokeWidthPx) : 1.5

  const fillOuter = () => {
    if (!fillEnabled) return
    graphics.fill({color: 0xffffff})
  }
  const cutHole = () => {
    if (!fillEnabled) return
    graphics.cut()
  }
  const stroke = () => {
    if (!strokeEnabled) return
    graphics.stroke({width: strokeWidth, color: 0xffffff, alignment: 0.5})
  }

  const drawPolygon = (polygon: Position[][]) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return
    const rings = polygon.map(ring => normalizeRing(ring)).filter(ring => ring.length >= 3)
    if (rings.length === 0) return

    drawRingPath(graphics, rings[0], ctx)
    if (fillEnabled) fillOuter()
    if (strokeEnabled) stroke()

    for (const hole of rings.slice(1)) {
      drawRingPath(graphics, hole, ctx)
      cutHole()
      if (strokeEnabled) stroke()
    }
  }

  if (geometry.type === 'Polygon') {
    drawPolygon(geometry.coordinates)
    return container
  }

  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) drawPolygon(polygon)
    return container
  }

  if (geometry.type === 'GeometryCollection') {
    for (const entry of geometry.geometries) {
      if (entry.type === 'Polygon') drawPolygon(entry.coordinates)
      else if (entry.type === 'MultiPolygon') {
        for (const polygon of entry.coordinates) drawPolygon(polygon)
      }
    }
    return container
  }

  return container
}

