import type {EnigAreaOptions} from '../types'

/**
 * 默认 ENIG/FlyingProbe 参数。
 *
 * 注意：这是内部默认值；对外通过 `options?: Partial<EnigAreaOptions>` 覆盖。
 */
export const DEFAULT_ENIG_AREA_OPTIONS: EnigAreaOptions = Object.freeze({
  arcToleranceRad: Math.PI / 32,
  pathBufferQuadrantSegments: 8,
  polygonSimplifyGridSize: null,
  clipToBoard: true,
})
