import {s} from 'hastscript'

import type {ImageTree, SizeEnvelope, ImageGraphic} from '@tracespace/plotter'
import {BoundingBox} from '@tracespace/plotter'

import {renderGraphic} from './render'
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
  'fill-rule': 'evenodd',
  'clip-rule': 'evenodd',
  fill: 'currentColor',
  stroke: 'currentColor',
}

export function render(image: ImageTree, viewBox?: ViewBox): SvgElement {
  const {units, size, children} = image

  viewBox = viewBox ?? sizeToViewBox(size)

  // Build output children while honoring top-level erase graphics by masking
  const outChildren: SvgElement[] = []
  const defs: SvgElement[] = []
  let content: SvgElement[] = []
  const [x, y, width, height] = viewBox

  for (const child of children as Array<ImageGraphic & {erase?: boolean}>) {
    const el = renderGraphic(child)

    if (child.erase === true) {
      const id = `erase-${Math.random().toString(36).slice(2)}`
      defs.push(
        s('mask', {id}, [
          s('rect', {x, y, width, height, fill: '#fff'}),
          s('g', {color: '#000'}, [el]),
        ])
      )
      content = [s('g', {mask: `url(#${id})`}, content)]
    } else {
      content.push(el)
    }
  }

  if (defs.length > 0) outChildren.push(s('defs', defs))
  outChildren.push(...content)

  return s(
    'svg',
    {
      ...BASE_SVG_PROPS,
      ...BASE_IMAGE_PROPS,
      viewBox: viewBox.join(' '),
      width: `${viewBox[2]}${units}`,
      height: `${viewBox[3]}${units}`,
    },
    outChildren
  )
}

export function renderFragment(image: ImageTree): SvgElement {
  return s('g', {}, image.children.map(renderGraphic))
}

export function sizeToViewBox(size: SizeEnvelope): ViewBox {
  return BoundingBox.isEmpty(size)
    ? [0, 0, 0, 0]
    : [size[0], -size[3], size[2] - size[0], size[3] - size[1]]
}
