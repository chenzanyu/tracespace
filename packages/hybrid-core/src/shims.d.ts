declare module '@tracespace/parser' {
  export type GerberTree = any
  const parser: any
  export = parser
}

declare module '@tracespace/xml-id' {
  export const random: (...args: unknown[]) => string
}

declare module '@tracespace/identify-layers' {
  export type GerberSide = 'top' | 'bottom' | 'inner' | 'all'
  export type GerberType =
    | 'copper'
    | 'soldermask'
    | 'silkscreen'
    | 'solderpaste'
    | 'drill'
    | 'outline'
    | 'drawing'
}

declare module '@tracespace/core' {
  export type MemoryLayerInput = any
  export type ParsedMemoryLayer = any
  export type MemoryRenderOptions = any
  export type FromMemoryLayersResult = any
  export const fromParsedLayers: (...args: any[]) => any
  export const inferDrillFormat: (...args: any[]) => any
  export const extractPadsFromGerber: (...args: any[]) => any
  export const applyDrillInferenceToTree: (...args: any[]) => any
  export const shouldInferDrillFormat: (...args: any[]) => any
}
