// Tool store
// Keeps track of the defined tools, defined macros, and the current tool
import type {
  GerberNode,
  SimpleShape,
  HoleShape,
  MacroBlock,
  UnitsType,
  Circle,
} from '@tracespace/parser'
import {
  MACRO_SHAPE,
  TOOL_CHANGE,
  TOOL_DEFINITION,
  TOOL_MACRO,
  IN,
  MM,
  CIRCLE,
} from '@tracespace/parser'

export const SIMPLE_TOOL = 'simpleTool'

export const MACRO_TOOL = 'macroTool'

export interface SimpleTool {
  type: typeof SIMPLE_TOOL
  shape: SimpleShape
  hole: HoleShape | undefined
}

export interface MacroTool {
  type: typeof MACRO_TOOL
  macro: MacroBlock[]
  variableValues: number[]
}

export type Tool = SimpleTool | MacroTool

export interface ToolStore {
  use: (node: GerberNode) => Tool | undefined
}

export interface ToolStoreOptions {
  units: UnitsType
}

const DEFAULT_MIN_DIAMETERS: Record<UnitsType, number> = {
  [IN]: 0.001,
  [MM]: 0.0254,
}

const getMinimumCircleDiameter = (units: UnitsType): number =>
  DEFAULT_MIN_DIAMETERS[units] ?? DEFAULT_MIN_DIAMETERS[IN]

const ensureCircleDiameter = (circle: Circle, units: UnitsType): Circle => {
  const minDiameter = getMinimumCircleDiameter(units)
  if (circle.diameter >= minDiameter) return circle
  return {...circle, diameter: minDiameter}
}

const ensureMinimumHoleSize = (
  hole: HoleShape | undefined,
  units: UnitsType
): HoleShape | undefined => {
  if (!hole || hole.type !== CIRCLE) return hole
  return ensureCircleDiameter(hole, units)
}

export function createToolStore(options?: ToolStoreOptions): ToolStore {
  const store = Object.create(ToolStorePrototype) as ToolStore & ToolStoreState
  if (options?.units) {
    store._units = options.units
  }
  return store
}

interface ToolStoreState {
  _currentToolCode: string | undefined
  _toolsByCode: Partial<Record<string, Tool>>
  _macrosByName: Partial<Record<string, MacroBlock[]>>
  _units: UnitsType
}

const ToolStorePrototype: ToolStore & ToolStoreState = {
  _currentToolCode: undefined,
  _toolsByCode: {},
  _macrosByName: {},
  _units: IN,

  use(node: GerberNode): Tool | undefined {
    if (node.type === TOOL_MACRO) {
      this._macrosByName[node.name] = node.children
    }

    if (node.type === TOOL_DEFINITION) {
      const {code, shape, hole} = node
      if (shape.type === MACRO_SHAPE) {
        this._toolsByCode[code] = {
          type: MACRO_TOOL,
          macro: this._macrosByName[shape.name] ?? [],
          variableValues: shape.variableValues,
        }
      } else {
        const normalizedShape =
          shape.type === CIRCLE
            ? ensureCircleDiameter(shape, this._units)
            : shape
        const normalizedHole = ensureMinimumHoleSize(
          hole ?? undefined,
          this._units
        )
        this._toolsByCode[code] = {
          type: SIMPLE_TOOL,
          shape: normalizedShape,
          hole: normalizedHole,
        }
      }
    }

    if (node.type === TOOL_DEFINITION || node.type === TOOL_CHANGE) {
      this._currentToolCode = node.code
    }

    return typeof this._currentToolCode === 'string'
      ? this._toolsByCode[this._currentToolCode]
      : undefined
  },
}
