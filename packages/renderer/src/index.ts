import {s} from 'hastscript'

import type {ImageTree, SizeEnvelope} from '@tracespace/plotter'
import {BoundingBox} from '@tracespace/plotter'

import {renderGraphic, renderTreeGraphics} from './render'
import type {SvgElement, ViewBox} from './types'

export {renderGraphic} from './render'

export type {SvgElement, ViewBox} from './types'

export const BASE_SVG_PROPS = {
  version: '1.1',
  xmlns: 'http://www.w3.org/2000/svg',
  'xmlns:xlink': 'http://www.w3.org/1999/xlink',
}

export const BASE_IMAGE_PROPS = {
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'stroke-width': '0',
  fill: 'currentColor',
  stroke: 'currentColor',
}

export function render(image: ImageTree, viewBox?: ViewBox): SvgElement {
  const {units, size} = image

  viewBox = viewBox ?? sizeToViewBox(size)
  const children = renderTreeGraphics(image, viewBox)

  return s(
    'svg',
    {
      ...BASE_SVG_PROPS,
      ...BASE_IMAGE_PROPS,
      viewBox: viewBox.join(' '),
      width: `${viewBox[2]}${units}`,
      height: `${viewBox[3]}${units}`,
    },
    children
  )
}

export function renderFragment(image: ImageTree): SvgElement {
  const fragmentChildren = renderTreeGraphics(image, sizeToViewBox(image.size))
  return s('g', {}, fragmentChildren)
}

export function sizeToViewBox(size: SizeEnvelope): ViewBox {
  return BoundingBox.isEmpty(size)
    ? [0, 0, 0, 0]
    : [size[0], -size[3], size[2] - size[0], size[3] - size[1]]
}
