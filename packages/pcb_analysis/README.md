# @tracespace/pcb-analysis

PCB analysis utilities powered by GEOS (via WebAssembly, using `geos-wasm`). The primary goal is to run heavier DFM metrics (boolean ops, buffering, area/length calculations) fast enough to be usable in the browser.

## Current API

```ts
import {computeEnigAreaForSide} from '@tracespace/pcb-analysis'
import {parse} from '@tracespace/parser'
import {plot} from '@tracespace/plotter'
import {plotBoardShape} from '@tracespace/core'

const topCopperGerber = '...'
const topMaskGerber = '...'
const outlineGerber = '...'

const topCopperTree = plot(parse(topCopperGerber))
const topMaskTree = plot(parse(topMaskGerber))
const outlineTree = plot(parse(outlineGerber))

const mmPerUnit = topCopperTree.units === 'in' ? 25.4 : 1

const layers = [
  {id: 'top-cu', filename: 'top-cu.gbr', type: 'copper', side: 'top'},
  {id: 'top-mask', filename: 'top-mask.gbr', type: 'soldermask', side: 'top'},
  {id: 'outline', filename: 'outline.gbr', type: 'outline', side: 'all'},
]
const plotTreesById = {
  'top-cu': topCopperTree,
  'top-mask': topMaskTree,
  outline: outlineTree,
}

const boardShape = plotBoardShape(layers, plotTreesById, mmPerUnit === 25.4 ? 0.02 : 0.5)
const boardPolygons = boardShape.polygons ?? []

const result = await computeEnigAreaForSide({
  mmPerUnit,
  boardPolygons,
  copperTrees: [topCopperTree],
  soldermaskTrees: [topMaskTree],
})

console.log(result.enigAreaMm2, result.enigAreaPercent)
```

**Definitions**

- `沉金面积 (ENIG area)` = `(Copper ∩ soldermask openings)` per side, summed top+bottom in the consumer.
- `沉金面积百分比` = `(总沉金面积 / 板框总面积) * 100%`.

## Options

`computeEnigAreaForSide` accepts an optional `options` object:

```ts
{
  arcToleranceRad?: number
  pathBufferQuadrantSegments?: number
  polygonSimplifyGridSize?: number | null
  soldermaskInterpretation?: 'auto' | 'openings' | 'coverage'
  soldermaskCoverageThreshold?: number
  clipToBoard?: boolean
}
```
