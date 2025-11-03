import { s } from 'hastscript'

import * as parser from '@tracespace/parser'
import { UNITS as P_UNITS, COORDINATE_FORMAT as P_COORDFMT } from '@tracespace/parser'
import * as plotter from '@tracespace/plotter'
import * as renderer from '@tracespace/renderer'
import { random as randomId } from '@tracespace/xml-id'
import { SIDE_TOP, SIDE_BOTTOM } from '@tracespace/identify-layers'

import type { GerberTree } from '@tracespace/parser'
import type { ImageTree } from '@tracespace/plotter'
import type { GerberType, GerberSide } from '@tracespace/identify-layers'
import type { SvgElement, ViewBox } from '@tracespace/renderer'

import { readFile } from './read-file'
import { determineLayerTypes } from './determine-layer-types'
import { plotBoardShape, renderBoardShape } from './board-shape'
import { getDrillLayers, getSideLayers } from './sort-layers'
import { stringifySvg } from './stringify-svg'

import type { ParsedLayer } from './determine-layer-types'
import type { BoardShape, BoardShapeRender } from './board-shape'
import type { Side, SideLayers } from './sort-layers'

export { stringifySvg } from './stringify-svg'

export interface Layer {
  id: string
  filename: string
  type: GerberType | undefined
  side: GerberSide | undefined
}

export interface ReadResult {
  layers: Layer[]
  parseTreesById: Record<string, GerberTree>
}

export interface PlotResult {
  layers: Layer[]
  plotTreesById: Record<string, ImageTree>
  boardShape: BoardShape
}

export interface RenderLayersResult {
  layers: Layer[]
  rendersById: Record<string, SvgElement>
  boardShapeRender: BoardShapeRender
}

export interface RenderBoardResult extends Record<Side, SvgElement> { }

export interface BoardShapeRenderFragment {
  viewBox: ViewBox
  svgFragment?: string
}

export interface RenderFragmentsResult {
  layers: Layer[]
  topLayers: SideLayers
  bottomLayers: SideLayers
  drillLayers: string[]
  boardShapeRenderFragment: BoardShapeRenderFragment
  svgFragmentsById: Record<string, string>
}

export async function read(files: File[] | string[]): Promise<ReadResult> {
  const readTasks = files.map(readAndParseFile)
  const parsedLayers = await Promise.all(readTasks)
  const layerTypesById = determineLayerTypes(parsedLayers)
  const layers: Layer[] = []
  const parseTreesById: Record<string, GerberTree> = {}

  for (const { id, filename, parseTree } of parsedLayers) {
    const { type, side } = layerTypesById[id]

    layers.push({ id, filename, type, side })
    parseTreesById[id] = parseTree
  }

  return { layers, parseTreesById }
}

async function readAndParseFile(file: File | string): Promise<ParsedLayer> {
  const id = randomId()
  const { filename, contents } = await readFile(file)
  const parseTree = parser.parse(contents)

  return { id, filename, parseTree }
}

export function plot(readResult: ReadResult): PlotResult {
  const { layers, parseTreesById } = readResult
  const plotTreesById: Record<string, ImageTree> = {}

  for (const { id } of layers) {
    plotTreesById[id] = plotter.plot(parseTreesById[id])
  }
  
  //闭合容差
  const boardShape = plotBoardShape(layers, plotTreesById, 0.02)

  return { layers, plotTreesById, boardShape }
}

export function renderLayers(plotResult: PlotResult): RenderLayersResult {
  const { layers, boardShape, plotTreesById } = plotResult
  const boardShapeRender = renderBoardShape(boardShape)
  const rendersById: Record<string, SvgElement> = {}

  for (const { id } of layers) {
    rendersById[id] = renderer.render(
      plotTreesById[id],
      boardShapeRender.viewBox
    )
  }

  return { layers, rendersById, boardShapeRender }
}

export function renderBoard(
  renderLayersResult: RenderLayersResult
): RenderBoardResult {
  const { layers, rendersById, boardShapeRender } = renderLayersResult
  const { viewBox, path: shapeRender } = boardShapeRender
  const drillLayers = getDrillLayers(layers)

  const [x, y, width, height] = viewBox
  const result: Partial<RenderBoardResult> = {}

  const getRenderChildren = (id: string): SvgElement['children'] =>
    rendersById[id].children

  for (const side of [SIDE_TOP, SIDE_BOTTOM] as const) {
    const {
      copper: copperLayers,
      solderMask: resistLayers,
      silkScreen: silkLayers,
      solderPaste: pasteLayers,
    } = getSideLayers(side, layers)

    const id = randomId()
    const drillMaskId = `drill-${id}`
    const resistMaskId = `resist-${id}`
    const shapeClipId = `shape-${id}`

    const clipPath =
      shapeRender === undefined ? undefined : `url(#${shapeClipId})`
    const transform =
      side === SIDE_BOTTOM
        ? `translate(${2 * x + width},0) scale(-1,1)`
        : undefined

    // Ensure the outline path used for clipping applies even-odd winding so
    // multi-contour outlines (nested or self-intersecting) clip correctly
    const shapePathForClip =
      shapeRender === undefined
        ? undefined
        : {
            ...shapeRender,
            properties: {
              ...(shapeRender.properties ?? {}),
              // Some renderers honor fill-rule on the element inside clipPath
              // rather than clip-rule; set both for compatibility.
              'clip-rule': 'evenodd',
              'fill-rule': 'evenodd',
            },
          }

    result[side] = s(
      'svg',
      {
        ...renderer.BASE_SVG_PROPS,
        ...renderer.BASE_IMAGE_PROPS,
        viewBox: `${x} ${y} ${width} ${height}`,
      },
      [
        s('defs', [
          // Board-level masks use user-space coordinates for both the mask
          // region (x/y/width/height) and the mask contents to ensure the
          // white rect fully covers the board extents.
          s(
            'mask',
            {
              id: drillMaskId,
              maskUnits: 'userSpaceOnUse',
              maskContentUnits: 'userSpaceOnUse',
              x,
              y,
              width,
              height,
            },
            [
              s('rect', { x, y, width, height, fill: '#fff' }),
              s('g', { color: '#000' }, drillLayers.flatMap(getRenderChildren)),
            ]
          ),
          s(
            'mask',
            {
              id: resistMaskId,
              maskUnits: 'userSpaceOnUse',
              maskContentUnits: 'userSpaceOnUse',
              x,
              y,
              width,
              height,
            },
            [
              s('rect', { x, y, width, height, fill: '#fff' }),
              s('g', { color: '#000' }, resistLayers.flatMap(getRenderChildren)),
            ]
          ),
          shapeRender === undefined
            ? undefined
            : s(
                'clipPath',
                { id: shapeClipId, clipPathUnits: 'userSpaceOnUse' },
                shapePathForClip as any
              ),
        ]),
        s('g', { transform, 'clip-path': clipPath }, [
          s('g', { mask: `url(#${drillMaskId})` }, [
            s('rect', { fill: '#666', x, y, width, height }),
            s('g', { color: '#c93' }, copperLayers.flatMap(getRenderChildren)),
          ]),
          s('g', { mask: `url(#${resistMaskId})` }, [
            s('rect', { fill: '#004200', opacity: '0.8', x, y, width, height }),
            s('g', { color: '#fff' }, silkLayers.flatMap(getRenderChildren)),
          ]),
          s('g', { color: '#999' }, pasteLayers.flatMap(getRenderChildren)),
        ]),
      ]
    )
  }

  return result as RenderBoardResult
}

export function renderFragments(plotResult: PlotResult): RenderFragmentsResult {
  const { layers, plotTreesById, boardShape } = plotResult
  const { viewBox, path: boardShapePath } = renderBoardShape(boardShape)
  const topLayers = getSideLayers(SIDE_TOP, layers)
  const bottomLayers = getSideLayers(SIDE_BOTTOM, layers)
  const drillLayers = getDrillLayers(layers)
  const boardShapeRenderFragment = {
    viewBox,
    svgFragment:
      boardShapePath === undefined ? undefined : stringifySvg(boardShapePath),
  }

  const svgFragmentsById: Record<string, string> = {}

  for (const { id } of layers) {
    svgFragmentsById[id] = stringifySvg(
      renderer.renderFragment(plotTreesById[id])
    )
  }

  return {
    layers,
    topLayers,
    bottomLayers,
    drillLayers,
    boardShapeRenderFragment,
    svgFragmentsById,
  }
}




//新增扩展

export type MemoryLayerInput = {
  filename: string
  type?: 'copper' | 'soldermask' | 'silkscreen' | 'solderpaste' | 'drill' | 'outline' | 'drawing'
  side?: 'top' | 'bottom' | 'inner' | 'all'
  gerber: string | Uint8Array | ArrayBuffer
  // optional per-layer visual overrides
  color?: string
  opacity?: number
}

export interface MemoryRenderOptions {
  // Board render color overrides for top/bottom composite
  boardColors?: {
    copper?: string
    soldermask?: string
    silkscreen?: string
    solderpaste?: string
  }
  // Maximum gap tolerance for outline clipping, in millimeters
  maxOutlineGapMm?: number
}

export interface FromMemoryLayersResult {
  plotResult: PlotResult
  renderLayersResult: RenderLayersResult
  renderBoardResult: RenderBoardResult
  compositeViewBox: ViewBox
  compositeWidthMm: string
  compositeHeightMm: string
  unitMeta: {
    units: 'mm' | 'in'
    mmPerUnit: number
    unitsPerMm: number
  }
}

/**
 * 从内存层列表（字符串/二进制）构建 renderLayersResult & renderBoardResult
 */
export async function fromMemoryLayers(
  layersInput: MemoryLayerInput[],
  options: MemoryRenderOptions = {}
): Promise<FromMemoryLayersResult> {
  // 辅助将可能的二进制转换为字符串（若需要）
  const toString = (v: string | Uint8Array | ArrayBuffer): string => {
    if (typeof v === 'string') return v
    if (v instanceof Uint8Array) return new TextDecoder().decode(v)
    if (v instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(v))
    return String(v)
  }

  // 标准化 side -> GerberSide | undefined
  const normalizeSide = (side?: MemoryLayerInput['side']): GerberSide | undefined => {
    if (!side) return undefined
    switch (String(side).toLowerCase()) {
      case 'top':
        return 'top' as GerberSide
      case 'bottom':
        return 'bottom' as GerberSide
      case 'inner':
        return 'inner' as GerberSide
      case 'all':
        return 'all' as GerberSide
      default:
        return undefined
    }
  }

  // 标准化 type -> GerberType | undefined
  const normalizeType = (type?: MemoryLayerInput['type']): GerberType | undefined => {
    if (!type) return undefined
    switch (type) {
      case 'copper':
      case 'soldermask':
      case 'silkscreen':
      case 'solderpaste':
      case 'drill':
      case 'outline':
      case 'drawing':
        return type as GerberType
      default:
        return undefined
    }
  }

  // 解析并构造与 read() 输出一致的数据结构
  const parsedLayers: Array<{
    id: string
    filename: string
    type: GerberType | undefined
    side: GerberSide | undefined
    parseTree: GerberTree
  }> = []

  for (const layer of layersInput) {
    const id = randomId()
    const contents = toString(layer.gerber)
    const parseTree = parser.parse(contents) as GerberTree

    parsedLayers.push({
      id,
      filename: layer.filename,
      type: normalizeType(layer.type),
      side: normalizeSide(layer.side),
      parseTree,
    })
  }

  const layers: ReadResult['layers'] = parsedLayers.map((p) => ({
    id: p.id,
    filename: p.filename,
    type: p.type,
    side: p.side,
  }))

  const parseTreesById: ReadResult['parseTreesById'] = Object.fromEntries(
    parsedLayers.map((p) => [p.id, p.parseTree])
  )

  // If some layers are missing units/format, borrow from layers that have them
  let commonUnits: any | undefined
  let commonFormat: [number, number] | undefined
  let commonZero: any | undefined
  for (const p of parsedLayers) {
    const nodes = p.parseTree.children as any[]
    for (const n of nodes) {
      if (!commonUnits && n?.type === P_UNITS && n.units) commonUnits = n.units
      if (!commonFormat && n?.type === P_COORDFMT && n.format) commonFormat = n.format
      if (!commonZero && n?.type === P_COORDFMT && n.zeroSuppression) commonZero = n.zeroSuppression
    }
  }
  if (commonUnits || commonFormat || commonZero) {
    for (const p of parsedLayers) {
      const nodes = p.parseTree.children as any[]
      const hasUnits = nodes.some((n) => n?.type === P_UNITS)
      const hasFormat = nodes.some((n) => n?.type === P_COORDFMT)
      const inserts: any[] = []
      if (!hasUnits && commonUnits) inserts.push({ type: P_UNITS, units: commonUnits })
      if (!hasFormat && (commonFormat || commonZero)) inserts.push({ type: P_COORDFMT, format: commonFormat, zeroSuppression: commonZero })
      if (inserts.length > 0) p.parseTree.children = [...inserts, ...nodes]
    }
  }

  // === 绘图：生成 plotTrees 并自定义闭合容差 ===
  const plotTreesById: PlotResult['plotTreesById'] = Object.fromEntries(
    layers.map(l => [l.id, plotter.plot(parseTreesById[l.id])])
  )

  // 从首个图确定文件单位（'mm' 或 'in'）
  const firstTree: ImageTree | undefined = plotTreesById[layers[0]?.id as string]
  const fileUnits: 'mm' | 'in' = (firstTree?.units as any) ?? 'mm'

  const mmToUnits = (mm: number): number => (fileUnits === 'mm' ? mm : mm / 25.4)
  const unitsToMm = (val: number): number => (fileUnits === 'mm' ? val : val * 25.4)

  const maxGapUnits = options.maxOutlineGapMm != null
    ? mmToUnits(options.maxOutlineGapMm)
    : (fileUnits === 'mm' ? mmToUnits(0.5) : 0.02)

  const boardShape = plotBoardShape(layers, plotTreesById, maxGapUnits)
  const plotResult: PlotResult = { layers, plotTreesById, boardShape }
  // Composite viewBox across all plotted layers (no board clipping)
  const allSize = plotter.BoundingBox.sum(
    Object.values(plotTreesById).map(t => t.size)
  )
  const compositeViewBox = renderer.sizeToViewBox(allSize)
  const boardShapeRender = renderBoardShape(boardShape)

  // === 分层渲染：强制使用相同 viewBox ===
  const rendersById: RenderLayersResult['rendersById'] = {}
  for (const {id} of layers) {
    const svg = renderer.render(plotTreesById[id], boardShapeRender.viewBox)
    rendersById[id] = svg
  }

  let renderLayersResult: RenderLayersResult = {
    layers,
    rendersById,
    boardShapeRender,
  }

  // === 板级渲染（top/bottom） ===
  let renderBoardResult = renderBoard(renderLayersResult)

  // === 尺寸：统一输出为毫米（mm） ===
  const [, , wUnits, hUnits] = boardShapeRender.viewBox
  const widthMm = `${unitsToMm(wUnits)}mm`
  const heightMm = `${unitsToMm(hUnits)}mm`

  // 每层 SVG 设置 mm 的 width/height，并应用每层颜色/透明度
  const visualById = new Map<string, {color?: string; opacity?: number}>(
    layersInput.map((l, i) => [layers[i].id, {color: l.color, opacity: l.opacity}])
  )

  for (const {id} of layers) {
    const svg = rendersById[id]
    if (!svg) continue
    svg.properties = svg.properties ?? {}
    svg.properties.width = widthMm
    svg.properties.height = heightMm

    const v = visualById.get(id)
    if (v?.color) svg.properties.color = v.color
    if (typeof v?.opacity === 'number') svg.properties.opacity = String(v.opacity)
  }

  // 板级颜色覆盖（copper / soldermask / silkscreen / solderpaste）
  const boardColors = options.boardColors ?? {}

  const applyBoardColors = (root: SvgElement): void => {
    const stack: SvgElement[] = [root]
    const all: SvgElement[] = []
    while (stack.length) {
      const n = stack.pop()!
      all.push(n)
      const kids = (n.children ?? []) as SvgElement[]
      for (const k of kids) if (k && (k as any).type === 'element') stack.push(k)
    }

    // drill-masked copper group
    for (const g of all.filter(n => n.tagName === 'g' && typeof n.properties?.mask === 'string' && (n.properties!.mask as string).startsWith('url(#drill-')) as any) {
      if (boardColors.copper) {
        const descendants = (g.children ?? []) as SvgElement[]
        for (const d of descendants) {
          if (d.tagName === 'g') {
            d.properties = d.properties ?? {}
            d.properties.color = boardColors.copper
          }
        }
      }
    }

    // resist-masked group: rect (mask color) + silk group
    for (const g of all.filter(n => n.tagName === 'g' && typeof n.properties?.mask === 'string' && (n.properties!.mask as string).startsWith('url(#resist-')) as any) {
      const gChildren = (g.children ?? []) as SvgElement[]
      for (const c of gChildren) {
        if (c.tagName === 'rect' && boardColors.soldermask) {
          c.properties = c.properties ?? {}
          c.properties.fill = boardColors.soldermask
        }
        if (c.tagName === 'g' && boardColors.silkscreen) {
          c.properties = c.properties ?? {}
          c.properties.color = boardColors.silkscreen
        }
      }
    }

    // paste group (usually the last g with color #999)
    if (boardColors.solderpaste) {
      for (const n of all) {
        if (n.tagName === 'g' && typeof n.properties?.color === 'string') {
          // Heuristic: default paste color is #999
          if ((n.properties!.color as string) === '#999') {
            n.properties.color = boardColors.solderpaste
          }
        }
      }
    }
  }

  for (const side of [SIDE_TOP, SIDE_BOTTOM] as const) {
    const svg = renderBoardResult[side]
    if (!svg) continue
    svg.properties = svg.properties ?? {}
    svg.properties.width = widthMm
    svg.properties.height = heightMm
    applyBoardColors(svg)
  }

  // Also expose composite dimensions for viewers that stack layers without clipping
  const compositeWidthMm = `${unitsToMm(compositeViewBox[2])}mm`
  const compositeHeightMm = `${unitsToMm(compositeViewBox[3])}mm`

  const mmPerUnit = unitsToMm(1) || 1
  const unitsPerMm = 1 / mmPerUnit

  return {
    plotResult,
    renderLayersResult,
    renderBoardResult,
    compositeViewBox,
    compositeWidthMm,
    compositeHeightMm,
    unitMeta: {
      units: fileUnits,
      mmPerUnit,
      unitsPerMm,
    },
  }
}
