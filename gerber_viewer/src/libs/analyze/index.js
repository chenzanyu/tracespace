import { enqueueAnalysisJob } from './workerPool'

const ANALYSIS_ACTION_RUN = 'run-analysis'

const cloneBounds = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return null
  const result = []
  for (let i = 0; i < 4; i += 1) {
    const value = Number(bounds[i])
    result.push(Number.isFinite(value) ? value : 0)
  }
  return result
}

const normalizeMmPerUnit = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 1
  return numeric
}

const normalizeLayerType = (value) =>
  typeof value === 'string' ? value.toLowerCase() : ''

const sanitizeShape = (shape) => {
  if (!shape || typeof shape !== 'object') return null
  switch (shape.type) {
    case 'circle':
      return { type: 'circle', diameter: Number(shape.diameter) || 0 }
    case 'rectangle':
    case 'obround':
      return {
        type: shape.type,
        xSize: Number(shape.xSize) || 0,
        ySize: Number(shape.ySize) || 0,
      }
    case 'polygon':
      return {
        type: 'polygon',
        diameter: Number(shape.diameter) || 0,
        vertices: Number(shape.vertices) || 0,
        rotation: Number(shape.rotation) || 0,
      }
    case 'macroShape':
      return {
        type: 'macro',
        name: shape.name || '',
        variableValues: Array.isArray(shape.variableValues)
          ? shape.variableValues.map(value => Number(value) || 0)
          : [],
      }
    default:
      return null
  }
}

const collectToolData = (parseTree) => {
  if (!parseTree?.children) return { tools: {}, usedTools: new Set(), macros: new Map() }
  const tools = {}
  const usedTools = new Set()
  const macroDefinitions = new Map()
  let activeTool = null

  for (const node of parseTree.children) {
    switch (node?.type) {
      case 'toolDefinition': {
        const shape = sanitizeShape(node.shape)
        const hole =
          node.hole && typeof node.hole === 'object'
            ? {
                type: node.hole.type,
                xSize: Number(node.hole.xSize) || undefined,
                ySize: Number(node.hole.ySize) || undefined,
                diameter: Number(node.hole.diameter) || undefined,
              }
            : undefined
        tools[node.code] = { shape, hole }
        break
      }
      case 'toolChange': {
        activeTool = node.code || null
        break
      }
      case 'graphic': {
        if (node.graphic && node.graphic !== 'move' && activeTool) {
          usedTools.add(activeTool)
        }
        break
      }
      case 'toolMacro': {
        macroDefinitions.set(node.name, node)
        break
      }
      default:
        break
    }
  }

  return { tools, usedTools, macroDefinitions }
}

const sanitizeMacroBlocks = (macroNode) => {
  if (!macroNode?.children) return []
  return macroNode.children
    .map((block) => {
      if (block.type === 'macroPrimitive') {
        return {
          type: 'primitive',
          code: block.code,
          parameters: block.parameters,
        }
      }
      if (block.type === 'macroVariable') {
        return {
          type: 'variable',
          name: block.name,
          value: block.value,
        }
      }
      return null
    })
    .filter(Boolean)
}

export const buildAnalysisPayload = ({
  fm,
  boardOutlineDescriptor,
  unitMmPerUnit,
  includeTraceMetrics = false,
  traceDataByLayerId = null,
}) => {
  if (!fm?.plotResult?.layers) return null
  const layers = []
  const plotTrees = fm.plotResult?.plotTreesById ?? {}
  const parseTrees = fm.parseTreesById ?? {}
  for (const layer of fm.plotResult.layers) {
    if (!layer) continue
     let traceData = null
    if (includeTraceMetrics && normalizeLayerType(layer.type) === 'copper') {
      if (traceDataByLayerId && traceDataByLayerId[layer.id]) {
        traceData = traceDataByLayerId[layer.id]
      } else {
        const { tools, usedTools, macroDefinitions } = collectToolData(parseTrees[layer.id])
        const neededMacros = new Set(
          Object.values(tools)
            .map(entry => entry?.shape)
            .filter(shape => shape?.type === 'macro')
            .map(shape => shape.name)
            .filter(Boolean)
        )
        const macros = {}
        for (const name of neededMacros) {
          if (!name) continue
          const macroNode = macroDefinitions.get(name)
          if (macroNode) {
            macros[name] = {
              name,
              blocks: sanitizeMacroBlocks(macroNode),
            }
          }
        }
        traceData = {
          tools,
          usedTools: Array.from(usedTools),
          macros,
        }
      }
     }
    layers.push({
      id: layer.id,
      type: layer.type ?? null,
      size: cloneBounds(plotTrees?.[layer.id]?.size),
      traceData,
    })
  }
  return {
    mmPerUnit: normalizeMmPerUnit(unitMmPerUnit),
    boardOutlineBounds: cloneBounds(boardOutlineDescriptor?.bounds),
    includeTraceMetrics: Boolean(includeTraceMetrics),
    layers,
  }
}

export const runAnalysisJob = (payload) => {
  if (!payload) return Promise.reject(new Error('分析参数缺失'))
  return enqueueAnalysisJob({
    action: ANALYSIS_ACTION_RUN,
    payload,
  })
}
