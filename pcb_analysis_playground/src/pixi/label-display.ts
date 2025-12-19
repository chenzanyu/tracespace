import {Container, Text} from 'pixi.js'

import type {PixiRenderContext} from './gerber-stack'

export type PixiLabel = {x: number; y: number; text: string}

export interface LabelDisplayOptions {
  fontSizePx?: number
  strokeWidthPx?: number
}

const mapRawPoint = (x: number, y: number, ctx: PixiRenderContext): {x: number; y: number} => {
  const [vx, vy] = ctx.viewBox
  const ySvg = -y
  return {
    x: (x - vx) * ctx.unitsToPx,
    y: (ySvg - vy) * ctx.unitsToPx,
  }
}

export function createLabelDisplay(
  labels: PixiLabel[],
  ctx: PixiRenderContext,
  tint: number,
  alpha: number,
  options: LabelDisplayOptions = {}
): Container {
  const container = new Container()
  container.eventMode = 'none'

  const fontSize = Number(options.fontSizePx) > 0 ? Number(options.fontSizePx) : 14
  const strokeWidth = Number(options.strokeWidthPx) > 0 ? Number(options.strokeWidthPx) : 3

  for (const label of labels) {
    const point = mapRawPoint(label.x, label.y, ctx)
    const text = new Text({
      text: label.text,
      anchor: 0.5,
      style: {
        fontFamily: 'Arial',
        fontSize,
        fill: 0xffffff,
        align: 'center',
        stroke: {color: 0x000000, width: strokeWidth},
      },
    })
    text.tint = tint
    text.alpha = alpha
    text.position.set(point.x, point.y)
    text.roundPixels = true
    text.eventMode = 'none'
    container.addChild(text)
  }

  return container
}

