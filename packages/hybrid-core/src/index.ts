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
export interface HybridPipelineOptions {
  modern?: ModernRenderOptions
}

export interface HybridPipelineResult {
  parsedLayers: ParsedMemoryLayer[]
  modern: ModernResult
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
  const parseFailures: Array<{filename?: string; message: string}> = []

  for (const layer of layersInput) {
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      parseFailures.push({filename: layer.filename, message})
      const name = layer.filename || '<unnamed layer>'
      console.warn(`[tracespace][hybrid-core] failed to parse "${name}": ${message}`)
    }
  }

  if (
    parsedLayers.length === 0 &&
    layersInput.length > 0 &&
    parseFailures.length > 0
  ) {
    const detail = parseFailures
      .map(({filename, message}) => `${filename ?? '<unnamed>'}: ${message}`)
      .join('; ')
    throw new Error(
      `[tracespace][hybrid-core] failed to parse any layers${detail ? ` (${detail})` : ''}`,
    )
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
  }
}
