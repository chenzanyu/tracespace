import {describe, it, expect} from 'vitest'

import {IMAGE, IMAGE_SHAPE} from '@tracespace/plotter'
import {TYPE_COPPER} from '@tracespace/identify-layers'

import {__testing} from '..'

const rectRing = (x1: number, y1: number, x2: number, y2: number) => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
  [x1, y1],
]

describe('reconstructStrokeBoardPolygons', () => {
  it('vetoes contained "holes" when copper exists inside', () => {
    const outerInner = rectRing(0, 0, 10, 10)
    const subBoardInner1 = rectRing(1, 1, 4, 4)
    const subBoardInner2 = rectRing(6, 1, 9, 4)
    const holeInner = rectRing(2.1, 2.1, 2.9, 2.9)

    const strokePolygons = [
      [rectRing(-1, -1, 11, 11), outerInner],
      [rectRing(0.5, 0.5, 4.5, 4.5), subBoardInner1],
      [rectRing(5.5, 0.5, 9.5, 4.5), subBoardInner2],
      [rectRing(2.0, 2.0, 3.0, 3.0), holeInner],
    ]

    const copperTree = {
      type: IMAGE,
      units: 'mm',
      size: [-1, -1, 11, 11] as const,
      children: [
        {
          type: IMAGE_SHAPE,
          shape: {type: 'rectangle', x: 1, y: 1, xSize: 3, ySize: 3},
        },
        {
          type: IMAGE_SHAPE,
          shape: {type: 'rectangle', x: 6, y: 1, xSize: 3, ySize: 3},
        },
      ],
    }

    const result = __testing.reconstructStrokeBoardPolygons(strokePolygons as any, {
      layers: [{id: 'copper', filename: 'copper', type: TYPE_COPPER, side: 'top'}] as any,
      plotTreesById: {copper: copperTree as any},
    })

    expect(result).toBeTruthy()
    expect(Array.isArray(result)).toBe(true)
    expect(result?.length).toBe(1)
    expect(result?.[0]?.length).toBe(2)
  })

  it('treats contained polygons touching the boundary as connected (no cutout)', () => {
    const outerInner = rectRing(0, 0, 10, 10)
    const touchingInner = rectRing(0, 2, 4, 8)

    const strokePolygons = [
      [rectRing(-1, -1, 11, 11), outerInner],
      [rectRing(-0.5, 1.5, 4.5, 8.5), touchingInner],
    ]

    const result = __testing.reconstructStrokeBoardPolygons(strokePolygons as any)

    expect(result).toBeTruthy()
    expect(Array.isArray(result)).toBe(true)
    expect(result?.length).toBe(1)
    expect(result?.[0]?.length).toBe(1)
  })
})

