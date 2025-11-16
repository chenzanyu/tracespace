import {toHtml} from 'hast-util-to-html'

import type {SvgElement} from '@tracespace/legacy-renderer'

export function stringifySvg(element: SvgElement): string {
  return toHtml(element, {space: 'svg'})
}

