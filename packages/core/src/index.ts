import * as parser from '@tracespace/parser'
import { UNITS as P_UNITS, COORDINATE_FORMAT as P_COORDFMT } from '@tracespace/parser'
import * as plotter from '@tracespace/plotter'
import { random as randomId } from '@tracespace/xml-id'

import type { GerberTree } from '@tracespace/parser'
import type { ImageTree } from '@tracespace/plotter'
import type { GerberType, GerberSide } from '@tracespace/identify-layers'

import { readFile } from './read-file'
import { determineLayerTypes } from './determine-layer-types'
import { plotBoardShape } from './board-shape'

import type { ParsedLayer } from './determine-layer-types'
import type { BoardShape, ViewBox } from './board-shape'

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

export type MemoryLayerInput = {
  filename: string
  type?: 'copper' | 'soldermask' | 'silkscreen' | 'solderpaste' | 'drill' | 'outline' | 'drawing'
  side?: 'top' | 'bottom' | 'inner' | 'all'
  gerber: string | Uint8Array | ArrayBuffer
  // optional per-layer visual overrides
  color?: string
  opacity?: number
}

export interface ParsedMemoryLayer {
  id: string
  filename: string
  type: GerberType | undefined
  side: GerberSide | undefined
  parseTree: GerberTree
  color?: string
  opacity?: number
}

export interface FromMemoryLayersResult {
  plotResult: PlotResult
  parseTreesById: Record<string, GerberTree>
  boardViewBox: ViewBox
  compositeViewBox: ViewBox
  compositeWidthMm: string
  compositeHeightMm: string
  unitMeta: {
    units: 'mm' | 'in'
    mmPerUnit: number
    unitsPerMm: number
  }
}

const sizeToViewBox = (box: plotter.BoundingBox.Box): ViewBox => {
  if (!Array.isArray(box) || box.length < 4 || plotter.BoundingBox.isEmpty(box)) {
    return [0, 0, 0, 0]
  }

  const [minX, minY, maxX, maxY] = box
  return [minX, -maxY, maxX - minX, maxY - minY]
}

const timingLabelFor = (phase: string): string =>
  `[tracespace][stack-preview] ${phase}`

const measurePhase = <T>(phase: string, fn: () => T): T => {
  const label = timingLabelFor(phase)
  console.time(label)
  try {
    return fn()
  } finally {
    console.timeEnd(label)
  }
}

/**
 * 从内存层列表（字符串/二进制）构建 tracespace 管道输出
 */
export async function fromMemoryLayers(
  layersInput: MemoryLayerInput[]
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
  const parsedLayers: ParsedMemoryLayer[] = []

  measurePhase('parse', () => {
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
        color: layer.color,
        opacity: layer.opacity,
      })
    }
  })

  return fromParsedLayers(parsedLayers)
}

export function fromParsedLayers(
  parsedLayers: ParsedMemoryLayer[]
): FromMemoryLayersResult {
  const layers: ReadResult['layers'] = parsedLayers.map((p) => ({
    id: p.id,
    filename: p.filename,
    type: p.type,
    side: p.side,
  }))

  const parseTreesById: ReadResult['parseTreesById'] = Object.fromEntries(
    parsedLayers.map((p) => [p.id, p.parseTree])
  )

  const metaGroupKey = (type?: GerberType): 'drill' | 'nonDrill' =>
    type === 'drill' ? 'drill' : 'nonDrill'
  const borrowedMeta: Record<'drill' | 'nonDrill', {
    units?: any
    format?: [number, number]
    zeroSuppression?: any
  }> = {
    drill: {},
    nonDrill: {},
  }

  for (const p of parsedLayers) {
    const nodes = p.parseTree.children as any[]
    const group = borrowedMeta[metaGroupKey(p.type)]
    for (const n of nodes) {
      if (!group.units && n?.type === P_UNITS && n.units) group.units = n.units
      if (!group.format && n?.type === P_COORDFMT && n.format) group.format = n.format
      if (!group.zeroSuppression && n?.type === P_COORDFMT && n.zeroSuppression) {
        group.zeroSuppression = n.zeroSuppression
      }
    }
  }

  for (const p of parsedLayers) {
    const nodes = p.parseTree.children as any[]
    const group = borrowedMeta[metaGroupKey(p.type)]
    if (!group.units && !group.format && !group.zeroSuppression) continue
    const hasUnits = nodes.some((n) => n?.type === P_UNITS)
    const hasFormat = nodes.some((n) => n?.type === P_COORDFMT)
    const inserts: any[] = []
    if (!hasUnits && group.units) inserts.push({ type: P_UNITS, units: group.units })
    if (!hasFormat && (group.format || group.zeroSuppression)) {
      inserts.push({
        type: P_COORDFMT,
        format: group.format,
        zeroSuppression: group.zeroSuppression,
      })
    }
    if (inserts.length > 0) p.parseTree.children = [...inserts, ...nodes]
  }

  // === 绘图：生成 plotTrees 并自定义闭合容差 ===
  const plotTreesById: PlotResult['plotTreesById'] = measurePhase(
    'plot',
    () =>
      Object.fromEntries(
        layers.map(l => [l.id, plotter.plot(parseTreesById[l.id])])
      )
  )

  const collectCompositeBoxes = (filterFn: (layer: Layer) => boolean) =>
    layers
      .filter(filterFn)
      .map(layer => plotTreesById[layer.id]?.size)
      .filter((box): box is plotter.BoundingBox.Box => Boolean(box) && !plotter.BoundingBox.isEmpty(box))

  // 从首个图确定文件单位（'mm' 或 'in'）
  const resolveUnitSourceTree = (): ImageTree | undefined => {
    const outlineLayer = layers.find(layer => layer.type === 'outline')
    if (outlineLayer) {
      const outlineTree = plotTreesById[outlineLayer.id]
      if (outlineTree?.units) return outlineTree
    }
    return plotTreesById[layers[0]?.id as string]
  }
  const unitSourceTree = resolveUnitSourceTree()
  const fileUnits: 'mm' | 'in' = (unitSourceTree?.units as any) ?? 'mm'

  const mmToUnits = (mm: number): number => (fileUnits === 'mm' ? mm : mm / 25.4)
  const unitsToMm = (val: number): number => (fileUnits === 'mm' ? val : val * 25.4)

  const maxGapUnits = fileUnits === 'mm' ? mmToUnits(0.5) : 0.02

  const boardShape = measurePhase(
    'board-shape',
    () => plotBoardShape(layers, plotTreesById, maxGapUnits)
  )
  const plotResult: PlotResult = { layers, plotTreesById, boardShape }
  // Composite viewBox across all plotted layers (no board clipping)
  const nonDrillBoxes = collectCompositeBoxes(layer => layer.type !== 'drill')
  const fallbackBoxes = nonDrillBoxes.length > 0
    ? nonDrillBoxes
    : collectCompositeBoxes(() => true)
  const compositeBox = plotter.BoundingBox.sum(fallbackBoxes)
  const compositeViewBox = sizeToViewBox(compositeBox)
  const boardViewBox = sizeToViewBox(boardShape.size as plotter.BoundingBox.Box)

  const compositeWidthMm = `${unitsToMm(compositeViewBox[2])}mm`
  const compositeHeightMm = `${unitsToMm(compositeViewBox[3])}mm`

  const mmPerUnit = unitsToMm(1) || 1
  const unitsPerMm = 1 / mmPerUnit

  return {
    plotResult,
    parseTreesById,
    boardViewBox,
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

export { plotBoardShape } from './board-shape'
export type { BoardShape, BoardShapeFailureReason, ViewBox } from './board-shape'
