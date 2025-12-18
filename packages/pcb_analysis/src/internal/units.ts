import {normalizePositiveNumber} from './numbers'

/**
 * 将 plotter 的 `units` 字段转换为 `mmPerUnit`。
 */
export const mmPerUnitForUnits = (units: unknown): number | null => {
  const normalized = typeof units === 'string' ? units.toLowerCase() : ''
  if (normalized === 'mm') return 1
  if (normalized === 'in') return 25.4
  return null
}

/**
 * 计算坐标缩放因子：把某个 tree 的单位系转换到目标 `mmPerUnit` 坐标系。
 *
 * 例：tree.units='in'，目标 mmPerUnit=1（mm）时，缩放因子为 25.4（inch → mm）。
 */
export const scaleFactorForUnitsToTargetMmPerUnit = (units: unknown, targetMmPerUnit: number): number => {
  const target = normalizePositiveNumber(targetMmPerUnit) ?? 1
  const sourceMmPerUnit = mmPerUnitForUnits(units)
  if (!sourceMmPerUnit) return 1
  return sourceMmPerUnit / target
}
