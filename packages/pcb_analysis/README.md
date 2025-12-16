# @tracespace/pcb-analysis

PCB analysis utilities powered by GEOS (via WebAssembly, using `geos-wasm`). The primary goal is to run heavier DFM metrics (boolean ops, buffering, area/length calculations) fast enough to be usable in the browser.

## API: `computeEnigAreaForSide`

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

### Definitions

- `沉金面积 (ENIG area)` = `Area(Copper ∩ soldermask openings)` per side.
- `沉金面积百分比`（双面时的总百分比）= `(ENIG_top + ENIG_bottom) / 轮廓层ViewBox矩形面积 * 100%`.
  - `轮廓层ViewBox矩形面积` = `Area(BoundingBox(boardPolygons))`，即 `boardPolygons` 的外接矩形面积（不是实际轮廓填充面积）。

### Data Format

- `boardPolygons` 的类型是 `BoardMultiPolygon = number[][][][]`，等价于 GeoJSON `MultiPolygon.coordinates`：
  - `boardPolygons[polygonIndex][ringIndex][pointIndex] = [x, y]`（单位为 plot tree 的单位：mm 或 inch 的“单位值”）。
  - ring 通常需要闭合（首尾点相同）；`plotBoardShape` 的输出默认满足该要求。

### Input / Output

**Input**

- `mmPerUnit`: plot tree 单位到 mm 的换算系数（`units === 'in' ? 25.4 : 1`）。
- `boardPolygons`: 轮廓层（或板框）多边形（来自 `plotBoardShape(...).polygons`）。只会用它来取 `BoundingBox`。
- `copperTrees`: 当前面的铜层 plot trees（可传多个层，会 union 后一起算）。
- `soldermaskTrees`: 当前面的阻焊层 plot trees（可传多个层，会 union 后一起算）。
- `drillTrees`（可选）: 钻孔层 plot trees；用于从裁剪区域中扣除孔洞（避免把孔洞区域计入相交/裁剪结果）。

**Output**

- `enigAreaMm2`: 当前面 ENIG 面积（mm²）。
- `boardAreaMm2`: 分母（轮廓 ViewBox 外接矩形面积，mm²）。
- `enigAreaPercent`: 当前面 `enigAreaMm2 / boardAreaMm2 * 100`（注意：双面总百分比需要你在调用侧把 top+bottom 相加后再除以同一个 `boardAreaMm2`）。
- `debug.copperAreaMm2` / `debug.soldermaskOpenAreaMm2`: 裁剪后的铜层面积 / 阻焊开窗面积（mm²）。

### Example: 双面沉金总面积与百分比

`computeEnigAreaForSide` 只计算“单面”，如果你要双面总沉金面积/百分比，需要在调用侧做一次汇总：

```ts
const top = await computeEnigAreaForSide({
  mmPerUnit,
  boardPolygons,
  copperTrees: topCopperTrees,
  soldermaskTrees: topMaskTrees,
  drillTrees,
})

const bottom = await computeEnigAreaForSide({
  mmPerUnit,
  boardPolygons,
  copperTrees: bottomCopperTrees,
  soldermaskTrees: bottomMaskTrees,
  drillTrees,
})

const enigTotalMm2 = top.enigAreaMm2 + bottom.enigAreaMm2
const boardAreaMm2 = top.boardAreaMm2 // 两面相同（同一个 boardPolygons bounding box）
const enigTotalPercent = boardAreaMm2 > 0 ? (enigTotalMm2 / boardAreaMm2) * 100 : 0
```

### Geometry Rules (how it calculates)

下面用接近代码的伪公式描述整个计算流程（单面）：

1. `boardBounds = BoundingBox(boardPolygons)`
2. `boardArea = Area(Rect(boardBounds))`（分母）
3. `clipRegion = Rect(boardBounds)`
4. 若提供 `drillTrees`：`clipRegion = clipRegion - DrillHoles`
5. `copper = BooleanReplay(copperTrees)`（按 LPD/LPC 顺序）
6. `maskOpen = BooleanReplay(soldermaskTrees)`（按 LPD/LPC 顺序，且支持“只有 clear 的负片阻焊”）
7. 若 `clipToBoard=true`：
   - `copper = copper ∩ clipRegion`
   - `maskOpen = maskOpen ∩ clipRegion`
8. `enig = copper ∩ maskOpen`
9. `enigAreaMm2 = Area(enig) * mmPerUnit^2`
10. `enigPercent = enigAreaMm2 / (boardArea * mmPerUnit^2) * 100`

#### 1) Layer boolean follows Gerber draw order (LPD/LPC)

Gerber 的 `LPD`(dark) / `LPC`(clear) 是“顺序生效”的：clear 只清除之前已经画出来的内容。
本库按 `ImageTree.children` 的顺序做布尔回放：

- `LPD`/dark：`result = Union(result, geom)`
- `LPC`/clear 或 `erase=true`：`result = Difference(result, geom)`

实现上会把相邻同极性的一段图形先合并成一个 `segmentGeom` 再做一次布尔（提升性能），但语义等价于逐条回放。

#### 2) 铜层/阻焊层图形生成方式

- `IMAGE_REGION` / `IMAGE_SHAPE`：按填充区域生成 polygon。
- `IMAGE_PATH`：把中心线按线宽 `width/2` 做 buffer（圆角近似由 `pathBufferQuadrantSegments` 决定），得到 polygon 后参与布尔。

最终所有布尔与面积计算只基于 polygon（非 polygon 结果会被丢弃）。

#### 3) 阻焊不做“coverage/openings”语义推断

阻焊层直接取上面的布尔结果作为“开窗区域”（openings）。不会再根据面积占比去判断是否需要 `Board - Mask` 取反。

兼容一种常见的负片阻焊：如果阻焊层没有任何 dark 图形（只有 clear/erase），则把 clear 的 union 结果作为 openings（否则会得到空结果）。

> 重要：这意味着本库假设你的 `soldermaskTrees` 本身语义就是“开窗”。  
> 如果你的 CAM 输出是“阻焊覆盖区域”（mask coverage），需要你在调用前自行转换为 openings（例如 `openings = clipRegion - coverage`）。

#### 4) 只计算轮廓 ViewBox 范围内（超出不计）

当 `clipToBoard=true`（默认）：

- 先计算 `clipRegion = BoundingBox(boardPolygons)`（外接矩形）。
- 若提供 `drillTrees`，则 `clipRegion = clipRegion - DrillHoles`。
- 铜层与阻焊开窗最终都会与 `clipRegion` 做 `Intersection`，因此任何超出轮廓 ViewBox 的部分都不会计入面积。

> 注意：`drillTrees` 只影响裁剪/相交区域（不计孔洞区域的 ENIG/铜/阻焊开窗面积），不影响 `boardAreaMm2` 的分母；分母始终是轮廓 ViewBox 外接矩形面积。

#### 5) ENIG 面积与百分比

- `ENIG_side = Area( CopperClipped ∩ MaskOpenClipped )`
- `ENIG_percent_side = ENIG_side / BoardViewBoxRectArea * 100`
- 双面总沉金（调用侧计算）：
  - `ENIG_total = ENIG_top + ENIG_bottom`
  - `ENIG_percent_total = ENIG_total / BoardViewBoxRectArea * 100`

## Options

`computeEnigAreaForSide` accepts an optional `options` object:

```ts
{
  arcToleranceRad?: number
  pathBufferQuadrantSegments?: number
  polygonSimplifyGridSize?: number | null
  clipToBoard?: boolean
}
```

**Options notes**

- `polygonSimplifyGridSize`: 传入一个“网格尺寸”（以 plot 单位表示），会在关键几何阶段做一定程度的归一化/简化以提升布尔性能；`null` 表示不启用。
- `arcToleranceRad`: 圆弧离散化容差（越小越精细但更慢）。
- `pathBufferQuadrantSegments`: `IMAGE_PATH` buffer 的圆角精度（越大越圆但更慢）。

## Troubleshooting

- 结果为 0：确认 `copperTrees` / `soldermaskTrees` 的 `plot(parse(...))` 是否成功；并确认它们是同一坐标系、同一 `mmPerUnit`。
- 百分比异常：注意 `boardAreaMm2` 用的是 `BoundingBox(boardPolygons)` 的矩形面积，不是实际轮廓面积。
- 计算很慢：可以尝试设置 `polygonSimplifyGridSize`（例如 0.01mm：`0.01 / mmPerUnit`）来降低几何复杂度；也可以增大 `arcToleranceRad` 或减小 `pathBufferQuadrantSegments` 以减少弧线/圆角离散点数。
