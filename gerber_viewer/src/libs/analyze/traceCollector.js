const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const sanitizeShape = (shape) => {
  if (!shape || typeof shape !== 'object') return null
  switch (shape.type) {
    case 'circle':
      return { type: 'circle', diameter: toNumber(shape.diameter) }
    case 'rectangle':
    case 'obround':
      return {
        type: shape.type,
        xSize: toNumber(shape.xSize),
        ySize: toNumber(shape.ySize),
      }
    case 'polygon':
      return {
        type: 'polygon',
        diameter: toNumber(shape.diameter),
        vertices: toNumber(shape.vertices),
        rotation: toNumber(shape.rotation),
      }
    case 'macroShape':
      return {
        type: 'macro',
        name: shape.name || '',
        variableValues: Array.isArray(shape.variableValues)
          ? shape.variableValues.map((v) => toNumber(v))
          : [],
      }
    default:
      return null
  }
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

const collectToolData = (parseTree) => {
  if (!parseTree?.children) return { tools: {}, usedTools: new Set(), macroDefinitions: new Map() }
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
                xSize: node.hole.xSize != null ? toNumber(node.hole.xSize) : undefined,
                ySize: node.hole.ySize != null ? toNumber(node.hole.ySize) : undefined,
                diameter: node.hole.diameter != null ? toNumber(node.hole.diameter) : undefined,
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

export const collectTraceDataForParseTree = (parseTree) => {
  const { tools, usedTools, macroDefinitions } = collectToolData(parseTree)
  const neededMacros = new Set(
    Object.values(tools)
      .map((entry) => entry?.shape)
      .filter((shape) => shape?.type === 'macro')
      .map((shape) => shape.name)
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
  return {
    tools,
    usedTools: Array.from(usedTools),
    macros,
  }
}

