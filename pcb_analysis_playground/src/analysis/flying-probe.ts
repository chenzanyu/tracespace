import {computeFlyingProbeCountDebug} from '@tracespace/pcb-analysis'
import type {
  BoardMultiPolygon,
  Bounds,
  EnigAreaOptions,
  FlyingProbeCountDebugResult,
} from '@tracespace/pcb-analysis'
import type {FromMemoryLayersResult, Layer} from '@tracespace/core'
import type {ImageTree} from '@tracespace/plotter'

export type BoardSide = 'top' | 'bottom'

export interface FlyingProbeAnalysisResult {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  boardBounds: Bounds | null
  drills: {
    layerIds: string[]
  }
  soldermask: {
    top: {layerIds: string[]; graphicCount: number}
    bottom: {layerIds: string[]; graphicCount: number}
  }
  result: FlyingProbeCountDebugResult
}

const normalizeLayerType = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '')

const normalizeSide = (value: unknown): BoardSide | null => {
  const str = typeof value === 'string' ? value.toLowerCase() : ''
  if (str === 'top' || str === 'bottom') return str
  return null
}

const collectTrees = (
  layers: Layer[],
  plotTreesById: Record<string, ImageTree>,
  predicate: (layer: Layer) => boolean
): {layerIds: string[]; trees: ImageTree[]} => {
  const layerIds: string[] = []
  const trees: ImageTree[] = []
  for (const layer of layers) {
    if (!predicate(layer)) continue
    const tree = plotTreesById[layer.id]
    if (!tree) continue
    layerIds.push(layer.id)
    trees.push(tree)
  }
  return {layerIds, trees}
}

const countGraphicsInTrees = (trees: ImageTree[]): number => {
  let total = 0
  for (const tree of trees) {
    const children = Array.isArray(tree?.children) ? tree.children : []
    total += children.filter(Boolean).length
  }
  return total
}

export async function runFlyingProbeAnalysis(params: {
  coreResult: FromMemoryLayersResult
  options?: Partial<EnigAreaOptions>
}): Promise<FlyingProbeAnalysisResult> {
  const {coreResult, options} = params
  const mmPerUnit = coreResult.unitMeta?.mmPerUnit ?? 1
  const boardPolygons = (coreResult.plotResult.boardShape.polygons ?? []) as BoardMultiPolygon
  const boardBounds = (coreResult.plotResult.boardShape.size ?? null) as Bounds | null
  const {layers, plotTreesById} = coreResult.plotResult

  const drills = collectTrees(layers, plotTreesById, layer => normalizeLayerType(layer.type) === 'drill')
  const soldermaskBySide = {
    top: collectTrees(
      layers,
      plotTreesById,
      layer => normalizeLayerType(layer.type) === 'soldermask' && normalizeSide(layer.side) === 'top'
    ),
    bottom: collectTrees(
      layers,
      plotTreesById,
      layer => normalizeLayerType(layer.type) === 'soldermask' && normalizeSide(layer.side) === 'bottom'
    ),
  }

  const result: FlyingProbeCountDebugResult = await computeFlyingProbeCountDebug({
    mmPerUnit,
    boardPolygons,
    boardBounds,
    drillTrees: drills.trees,
    soldermaskTopTrees: soldermaskBySide.top.trees,
    soldermaskBottomTrees: soldermaskBySide.bottom.trees,
    options,
  })

  return {
    mmPerUnit,
    boardPolygons,
    boardBounds,
    drills: {layerIds: drills.layerIds},
    soldermask: {
      top: {layerIds: soldermaskBySide.top.layerIds, graphicCount: countGraphicsInTrees(soldermaskBySide.top.trees)},
      bottom: {
        layerIds: soldermaskBySide.bottom.layerIds,
        graphicCount: countGraphicsInTrees(soldermaskBySide.bottom.trees),
      },
    },
    result,
  }
}

