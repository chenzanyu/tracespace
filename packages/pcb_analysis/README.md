# @tracespace/pcb-analysis

Utilities that convert tracespace plot trees into [JSTS](https://github.com/bjornharrtell/jsts) geometries so we can perform accurate PCB analytics such as minimum line width, spacing, and copper area measurement.

## Current API

```ts
import {gerberToImageGeometries, convertImageTree} from '@tracespace/pcb-analysis'
import {parse} from '@tracespace/parser'
import {plot} from '@tracespace/plotter'

const gerberContents = '...'

// Run the whole tracespace pipeline in one call
const result = gerberToImageGeometries(gerberContents)

console.log(result.units) // -> 'mm' | 'in'
console.log(result.graphics.length) // -> total plotted graphics
console.log(result.composite.getArea()) // -> copper area in file units^2

// Or convert an image tree you already have
const parseTree = parse(gerberContents)
const imageTree = plot(parseTree)
const geometryResult = convertImageTree(imageTree)
```

Each `GeometryGraphicEntry` in `result.graphics` links the generated `Geometry` object back to the original tracespace graphic node, allowing future minimum width / spacing routines to associate measurements with their source aperture.

## Options

`convertImageTree` and `gerberToImageGeometries` accept the same optional configuration object:

```ts
{
  precisionScale?: number          // defaults to 1_000_000 for sub-micron accuracy
  strokeQuadrantSegments?: number  // stroke buffer smoothness (default: 8)
  maxArcSegmentAngle?: number      // radians per interpolated arc segment (default: π / 64)
}
```
