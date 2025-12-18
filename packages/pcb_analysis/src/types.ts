import type {ImageTree} from '@tracespace/plotter'
import type {Geometry as GeoJsonGeometry} from 'geojson'

/**
 * 板框多边形（MultiPolygon）。
 *
 * - 结构等价于 GeoJSON `MultiPolygon.coordinates`：`number[][][][]`
 * - 坐标单位为 plot tree 的“单位值”（通常是 mm 或 inch 的单位值），与 `mmPerUnit` 配合换算
 * - ring 通常需要闭合（首尾点相同）；`plotBoardShape(...).polygons` 默认满足该要求
 */
export type BoardMultiPolygon = number[][][][]

/**
 * 外接矩形 bounds：`[minX, minY, maxX, maxY]`（单位为 plot tree 的单位值）
 */
export type Bounds = [number, number, number, number]

/**
 * 解析 PCB 尺寸的输入。
 *
 * 用途：当你只有部分信息（例如已经算出的 `boardBounds`，或者只有 outline 的 bounds / polygons）
 * 时，想得到一致的 `widthMm/heightMm`，可用此工具函数。
 */
export interface ResolvePcbSizeInput {
  /** 单位到 mm 的换算系数（`units === 'in' ? 25.4 : 1`） */
  mmPerUnit: number
  /** 已知的板框 bounds（优先级最高） */
  boardBounds?: Bounds | null
  /** 轮廓层的 bounds（可选） */
  outlineBounds?: Bounds | null
  /** 板框多边形（可选），用于 fallback 计算 bounds */
  boardPolygons?: BoardMultiPolygon | null
}

/**
 * 解析 PCB 尺寸的输出。
 */
export interface ResolvePcbSizeResult {
  /** 最终采用的 bounds */
  bounds: Bounds
  /** 宽度（plot 单位） */
  widthUnits: number
  /** 高度（plot 单位） */
  heightUnits: number
  /** 宽度（mm） */
  widthMm: number
  /** 高度（mm） */
  heightMm: number
  /** bounds 来源（便于调试与 UI 展示） */
  source: 'boardBounds' | 'outlineAndPolygonsMidpoint' | 'outlineBounds' | 'boardPolygons'
}

/**
 * 计算“单面平面沉金面积”的输入。
 */
export interface EnigAreaSideInput {
  /** 单位到 mm 的换算系数 */
  mmPerUnit: number
  /** 板框多边形（来自 `plotBoardShape(...).polygons`） */
  boardPolygons: BoardMultiPolygon
  /** 可选：板框 bounds（用于分母/裁剪区域；优先于 `boardPolygons` 的 bounds） */
  boardBounds?: Bounds | null
  /** 当前面的铜层 plot trees（可传多个，会 union 后一起算） */
  copperTrees: ImageTree[]
  /** 当前面的阻焊开窗 plot trees（可传多个，会 union 后一起算） */
  soldermaskTrees: ImageTree[]
  /** 可选：钻孔层 plot trees，用于从裁剪区域扣除孔洞 */
  drillTrees?: ImageTree[]
  /** 可选：算法参数 */
  options?: Partial<EnigAreaOptions>
}

/**
 * ENIG 计算参数（同样被 Flying Probe 计算复用）。
 */
export interface EnigAreaOptions {
  /**
   * 圆弧离散化容差（弧度）。
   *
   * - 越小越精细，但会产生更多点、运算更慢
   * - 默认：`Math.PI / 32`
   */
  arcToleranceRad: number
  /**
   * `IMAGE_PATH` buffer 的圆角精度（GEOS buffer 的 quadrant segments）。
   *
   * - 越大越圆，但会更慢、产生更多几何点
   * - 默认：`8`
   */
  pathBufferQuadrantSegments: number
  /**
   * 可选：网格简化尺寸（plot 单位）。
   *
   * - 传入 >0 时，会在关键几何阶段用 `GEOSUnaryUnionPrec` 做一定程度的归一化/简化以提升布尔性能
   * - `null` 表示不启用
   */
  polygonSimplifyGridSize: number | null
  /**
   * 是否把计算裁剪到板框 ViewBox（默认 true）。
   *
   * 注意：这里的“板框”指 `boardBounds` / `BoundingBox(boardPolygons)` 的矩形区域（不是实际轮廓填充面积）。
   */
  clipToBoard: boolean
}

/**
 * 计算“单面平面沉金面积”的输出。
 */
export interface EnigAreaSideResult {
  /** 平面沉金面积（mm²）= `Area(Copper ∩ MaskOpen) * mmPerUnit^2` */
  enigAreaMm2: number
  /** 分母（mm²）= `Area(BoundingBox(boardPolygons)) * mmPerUnit^2` */
  boardAreaMm2: number
  /** 百分比（%）= `enigAreaMm2 / boardAreaMm2 * 100` */
  enigAreaPercent: number
  debug: {
    /** 裁剪后的铜层面积（mm²） */
    copperAreaMm2: number
    /** 裁剪后的阻焊开窗面积（mm²） */
    soldermaskOpenAreaMm2: number
  }
}

/**
 * 计算“单面飞针点数”的输入。
 *
 * 说明：这里的点数指“阻焊开窗岛”的数量（按实现规则统计），用于上层的 `computeFlyingProbeCount` 汇总。
 */
export interface FlyingProbeCountSideInput {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  boardBounds?: Bounds | null
  drillTrees?: ImageTree[]
  soldermaskTrees: ImageTree[]
  options?: Partial<EnigAreaOptions>
}

export interface FlyingProbeCountSideResult {
  /** 单面点数（阻焊开窗岛数量） */
  flyingProbeCount: number
}

/**
 * 计算“双面飞针点数”的输入。
 */
export interface FlyingProbeCountInput {
  mmPerUnit: number
  boardPolygons: BoardMultiPolygon
  boardBounds?: Bounds | null
  drillTrees?: ImageTree[]
  soldermaskTopTrees?: ImageTree[]
  soldermaskBottomTrees?: ImageTree[]
  options?: Partial<EnigAreaOptions>
}

export interface FlyingProbeCountResult {
  flyingProbeCount: number
  debug?: {
    maskTopCount: number
    maskBottomCount: number
    drillCount: number
  }
}

/**
 * `computeFlyingProbeCountDebug` 输出（包含几何中间结果与分步耗时）。
 *
 * 注意：该输出可能很大，建议只在开发/排障时使用。
 */
export interface FlyingProbeCountDebugResult extends FlyingProbeCountResult {
  /** 实际使用的 options（合并默认值后的结果） */
  options: EnigAreaOptions
  /** 单位到 mm 的换算系数 */
  mmPerUnit: number
  /** 分步耗时采样 */
  timings: EnigAreaTimingSample[]
  /**
   * 关键中间几何（GeoJSON），用于可视化/排障。
   *
   * - 这些几何的坐标单位与输入 plot tree 一致（同样受 `mmPerUnit` 影响）
   * - 导出可能较慢且数据量大
   */
  geometries: {
    boardOutline: GeoJsonGeometry | null
    boardClip: GeoJsonGeometry | null
    drill: GeoJsonGeometry | null
    maskTopOpen: GeoJsonGeometry | null
    maskBottomOpen: GeoJsonGeometry | null
    maskOpenUnion: GeoJsonGeometry | null
    drillSelected: GeoJsonGeometry | null
  }
  debug: {
    maskTopCount: number
    maskBottomCount: number
    /** 参与计算的钻孔个数（与任意一面开窗相交/贴边/重叠的孔，去重后计 1 次） */
    drillCount: number
    /** 钻孔总数（用于对照） */
    drillTotalCount: number
  }
}

/**
 * Debug 计时采样项。
 */
export interface EnigAreaTimingSample {
  step: string
  ms: number
  meta?: Record<string, unknown>
}

/**
 * `computeEnigAreaForSideDebug` 输出（包含几何中间结果与分步耗时）。
 *
 * 注意：该输出可能很大，建议只在开发/排障时使用。
 */
export interface EnigAreaSideDebugResult extends EnigAreaSideResult {
  outlineAreaMm2: number
  options: EnigAreaOptions
  mmPerUnit: number
  timings: EnigAreaTimingSample[]
  geometries: {
    boardOutline: GeoJsonGeometry | null
    boardClip: GeoJsonGeometry | null
    copper: GeoJsonGeometry | null
    soldermaskOpen: GeoJsonGeometry | null
    exposed: GeoJsonGeometry | null
  }
}

/**
 * 计算“孔壁沉金面积”的输入。
 *
 * 近似公式：`holeWallEnigAreaMm2 = holeWallPerimeterMm * boardThicknessMm`
 */
export interface HoleWallEnigInput {
  mmPerUnit: number
  drillTrees: ImageTree[]
  copperTopTrees: ImageTree[]
  copperBottomTrees: ImageTree[]
  soldermaskTopTrees: ImageTree[]
  soldermaskBottomTrees: ImageTree[]
  /** 板厚（mm），默认 1.6 */
  boardThicknessMm?: number
  options?: Partial<EnigAreaOptions>
}

export interface HoleWallEnigResult {
  /** 孔壁沉金面积（mm²） */
  holeWallEnigAreaMm2: number
  /** 孔洞周长（mm） */
  holeWallPerimeterMm: number
  /** 实际采用的板厚（mm） */
  boardThicknessMm: number
}
