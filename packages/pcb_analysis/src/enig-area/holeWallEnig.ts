import type {EnigAreaOptions, HoleWallEnigInput, HoleWallEnigResult} from '../types'

import {DEFAULT_ENIG_AREA_OPTIONS} from '../internal/defaults'
import {clampNumber, normalizePositiveNumber} from '../internal/numbers'
import {computeLength, destroyGeom} from '../internal/geos/geom'
import {intersection, unionTwo} from '../internal/geos/ops'
import {getSharedGeos} from '../internal/geos/shared'
import {buildLayerGeometryFromTrees} from '../internal/layerGeometry'

/**
 * 计算“孔壁沉金面积”（近似）。
 *
 * 规则：
 * 1. 先筛选可能为通孔电镀孔：`selected = DrillHoles ∩ CopperTop ∩ CopperBottom`
 * 2. 再要求孔洞在任意一面被阻焊开窗暴露：`selected = selected ∩ (MaskOpenTop ∪ MaskOpenBottom)`
 * 3. `holeWallPerimeterMm = Length(selected) * mmPerUnit`
 * 4. `holeWallEnigAreaMm2 = holeWallPerimeterMm * boardThicknessMm`
 *
 * 注意：默认按“整板厚通孔”处理；盲/埋孔会被高估（需调用侧自行区分孔类型后换算）。
 */
export const computeHoleWallEnigArea = async (input: HoleWallEnigInput): Promise<HoleWallEnigResult> => {
  const geos = await getSharedGeos()
  const options: EnigAreaOptions = {
    ...DEFAULT_ENIG_AREA_OPTIONS,
    ...(input.options || {}),
  }
  const mmPerUnit = clampNumber(input.mmPerUnit, 1) || 1
  const boardThicknessMmRaw = clampNumber(input.boardThicknessMm ?? 1.6, 1.6)
  const boardThicknessMm = Number.isFinite(boardThicknessMmRaw) && boardThicknessMmRaw > 0 ? boardThicknessMmRaw : 1.6
  const overlayGridSize = normalizePositiveNumber(options.polygonSimplifyGridSize) ?? null

  const drillTrees = Array.isArray(input.drillTrees) ? input.drillTrees.filter(Boolean) : []
  const drillPtr = await buildLayerGeometryFromTrees(geos, drillTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })

  const copperTopTrees = Array.isArray(input.copperTopTrees) ? input.copperTopTrees.filter(Boolean) : []
  const copperBottomTrees = Array.isArray(input.copperBottomTrees) ? input.copperBottomTrees.filter(Boolean) : []
  const soldermaskTopTrees = Array.isArray(input.soldermaskTopTrees) ? input.soldermaskTopTrees.filter(Boolean) : []
  const soldermaskBottomTrees = Array.isArray(input.soldermaskBottomTrees) ? input.soldermaskBottomTrees.filter(Boolean) : []

  const copperTopPtr = await buildLayerGeometryFromTrees(geos, copperTopTrees, options, {
    overlayGridSize,
    mmPerUnit,
  })
  const copperBottomPtr = await buildLayerGeometryFromTrees(geos, copperBottomTrees, options, {
    overlayGridSize,
    mmPerUnit,
  })

  let selectedDrillsPtr = intersection(geos, drillPtr, copperTopPtr, overlayGridSize)
  selectedDrillsPtr = intersection(geos, selectedDrillsPtr, copperBottomPtr, overlayGridSize)

  const maskOpenTopPtr = await buildLayerGeometryFromTrees(geos, soldermaskTopTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })
  const maskOpenBottomPtr = await buildLayerGeometryFromTrees(geos, soldermaskBottomTrees, options, {
    preferClearWhenDarkEmpty: true,
    overlayGridSize,
    mmPerUnit,
  })
  const maskOpenAnyPtr = unionTwo(geos, maskOpenTopPtr, maskOpenBottomPtr, overlayGridSize)
  if (maskOpenAnyPtr) {
    selectedDrillsPtr = intersection(geos, selectedDrillsPtr, maskOpenAnyPtr, overlayGridSize)
  }

  const holeWallPerimeterUnits = computeLength(geos, selectedDrillsPtr)
  const holeWallPerimeterMm = holeWallPerimeterUnits * mmPerUnit
  const holeWallEnigAreaMm2 = holeWallPerimeterMm * boardThicknessMm
  destroyGeom(geos, selectedDrillsPtr)

  return {
    holeWallEnigAreaMm2,
    holeWallPerimeterMm,
    boardThicknessMm,
  }
}
