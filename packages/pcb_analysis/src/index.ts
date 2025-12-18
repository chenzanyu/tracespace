/**
 * @tracespace/pcb-analysis
 *
 * 主要导出：
 * - `computeEnigAreaForSide`：单面平面沉金面积
 * - `computeHoleWallEnigArea`：孔壁沉金面积（近似）
 * - `computeFlyingProbeCount`：飞针点数
 * - `computeFlyingProbeCountDebug`：飞针点数（debug 版，含中间几何与耗时）
 * - `resolvePcbSize`：尺寸推断工具
 */
export type {
  BoardMultiPolygon,
  Bounds,
  EnigAreaOptions,
  EnigAreaSideDebugResult,
  EnigAreaSideInput,
  EnigAreaSideResult,
  EnigAreaTimingSample,
  FlyingProbeCountInput,
  FlyingProbeCountDebugResult,
  FlyingProbeCountResult,
  FlyingProbeCountSideInput,
  FlyingProbeCountSideResult,
  HoleWallEnigInput,
  HoleWallEnigResult,
  ResolvePcbSizeInput,
  ResolvePcbSizeResult,
} from './types'

export {getSharedGeos} from './internal/geos/shared'
export {resolvePcbSize} from './pcb-size/resolvePcbSize'
export {computeEnigAreaForSide} from './enig-area/enigArea'
export {computeEnigAreaForSideDebug} from './enig-area/enigAreaDebug'
export {computeFlyingProbeCount, computeFlyingProbeCountForSide} from './flying-probe/flyingProbe'
export {computeFlyingProbeCountDebug} from './flying-probe/flyingProbeDebug'
export {computeHoleWallEnigArea} from './enig-area/holeWallEnig'
