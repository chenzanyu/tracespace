import {computeEnigAreaForSideDebug} from '@tracespace/pcb-analysis'
import type {BoardMultiPolygon, Bounds, EnigAreaOptions, EnigAreaSideDebugResult} from '@tracespace/pcb-analysis'
import type {FromMemoryLayersResult, Layer} from '@tracespace/core'
import type {ImageTree} from '@tracespace/plotter'

export type BoardSide = 'top' | 'bottom'

export interface EnigSideAnalysis {
  side: BoardSide
  copperLayerIds: string[]
  soldermaskLayerIds: string[]
  drillLayerIds: string[]
  result: EnigAreaSideDebugResult
}

export interface EnigAreaAnalysisResult {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  sides: Record<BoardSide, EnigSideAnalysis>
  totals: {
    enigTotalMm2: number
    enigPercentTotal: number
  }
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

export async function runEnigAreaAnalysis(params: {
  coreResult: FromMemoryLayersResult
  options?: Partial<EnigAreaOptions>
}): Promise<EnigAreaAnalysisResult> {
  const {coreResult, options} = params
  const mmPerUnit = coreResult.unitMeta?.mmPerUnit ?? 1
  const boardPolygons = (coreResult.plotResult.boardShape.polygons ?? []) as BoardMultiPolygon
  const boardBounds = (coreResult.plotResult.boardShape.size ?? null) as Bounds | null
  const {layers, plotTreesById} = coreResult.plotResult

  const drills = collectTrees(layers, plotTreesById, layer => normalizeLayerType(layer.type) === 'drill')

  const computeForSide = async (side: BoardSide): Promise<EnigSideAnalysis> => {
    const copper = collectTrees(
      layers,
      plotTreesById,
      layer => normalizeLayerType(layer.type) === 'copper' && normalizeSide(layer.side) === side
    )
    const soldermask = collectTrees(
      layers,
      plotTreesById,
      layer => normalizeLayerType(layer.type) === 'soldermask' && normalizeSide(layer.side) === side
    )

    const result = await computeEnigAreaForSideDebug({
      mmPerUnit,
      boardPolygons,
      boardBounds,
      copperTrees: copper.trees,
      soldermaskTrees: soldermask.trees,
      drillTrees: drills.trees,
      options,
    })

    return {
      side,
      copperLayerIds: copper.layerIds,
      soldermaskLayerIds: soldermask.layerIds,
      drillLayerIds: drills.layerIds,
      result,
    }
  }

  const [top, bottom] = await Promise.all([computeForSide('top'), computeForSide('bottom')])

  const boardAreaMm2 = Math.max(top.result.boardAreaMm2, bottom.result.boardAreaMm2)
  const enigTotalMm2 = top.result.enigAreaMm2 + bottom.result.enigAreaMm2
  const enigPercentTotal = boardAreaMm2 > 0 ? (enigTotalMm2 / boardAreaMm2) * 100 : 0

  return {
    mmPerUnit,
    boardPolygons,
    sides: {top, bottom},
    totals: {enigTotalMm2, enigPercentTotal},
  }
}
