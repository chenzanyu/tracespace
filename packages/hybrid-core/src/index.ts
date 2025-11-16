import * as parser from '@tracespace/parser'
import {random as randomId} from '@tracespace/xml-id'

import type {GerberTree} from '@tracespace/parser'
import type {GerberSide, GerberType} from '@tracespace/identify-layers'
import type {
  MemoryLayerInput,
  ParsedMemoryLayer,
  MemoryRenderOptions as ModernRenderOptions,
  FromMemoryLayersResult as ModernResult,
} from '@tracespace/core'
import {fromParsedLayers as runModern} from '@tracespace/core'
import type {
  MemoryRenderOptions as LegacyRenderOptions,
  RenderBoardResult as LegacyRenderBoardResult,
  RenderLayersResult as LegacyRenderLayersResult,
} from '@tracespace/legacy-core'
import {fromParsedLayers as runLegacy} from '@tracespace/legacy-core'

export interface HybridPipelineOptions {
  modern?: ModernRenderOptions
  legacy?: LegacyRenderOptions
}

export interface HybridPipelineResult {
  parsedLayers: ParsedMemoryLayer[]
  modern: ModernResult
  legacy: {
    renderLayersResult: LegacyRenderLayersResult
    renderBoardResult: LegacyRenderBoardResult
  }
}

const toString = (v: string | Uint8Array | ArrayBuffer): string => {
  if (typeof v === 'string') return v
  if (v instanceof Uint8Array) return new TextDecoder().decode(v)
  if (v instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(v))
  return String(v)
}

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

export function prepareParsedLayers(layersInput: MemoryLayerInput[]): ParsedMemoryLayer[] {
  const parsedLayers: ParsedMemoryLayer[] = []

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

  return parsedLayers
}

export function runHybridPipeline(
  layersInput: MemoryLayerInput[],
  options: HybridPipelineOptions = {}
): HybridPipelineResult {
  const parsedLayers = prepareParsedLayers(layersInput)

  return {
    parsedLayers,
    modern: runModern(parsedLayers, options.modern),
    legacy: runLegacy(parsedLayers, options.legacy),
  }
}
